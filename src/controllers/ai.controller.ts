import { Request, Response } from "express";
import OpenAI from "openai";
import { prisma } from "config/client";
import { retrieveContext } from "services/ai/retrieve.service";
import { upsertMessageEmbedding } from "services/ai/embedding.service";
import { maybeStoreMemories } from "services/ai/memory.service";
import { answerCheck } from "services/ai/answercheck.service";
import { rollupSummary } from "services/summary.service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const aiCreateSession = async (req: Request, res: Response) => {
    const session = await prisma.aiChatSession.create({
        data: { userId: req.user?.id ?? null, status: "OPEN" }
    });
    res.json(session);
};

export const aiCloseSession = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await prisma.aiChatSession.update({ where: { id }, data: { status: "CLOSED" } });
    res.json({ ok: true });
};

export const aiChat = async (req: Request, res: Response) => {
    const { sessionId, message } = req.body || {};
    if (!sessionId || !message) return res.status(400).json({ message: "sessionId & message required" });

    const session = await prisma.aiChatSession.findUnique({ where: { id: Number(sessionId) } });
    if (!session) return res.status(404).json({ message: "session not found" });
    if (session.status === "CLOSED") return res.status(403).json({ message: "session closed" });

    // lưu user msg
    const userMsg = await prisma.aiChatMessage.create({
        data: { sessionId, role: "USER", content: String(message) }
    });
    await upsertMessageEmbedding(userMsg.id, userMsg.content);

    // lấy history ngắn + summary + memory
    const lastMsgs = await prisma.aiChatMessage.findMany({
        where: { sessionId },
        orderBy: { id: "desc" },
        take: 12
    });
    const history = lastMsgs.reverse().map(m => ({ role: m.role.toLowerCase() as any, content: m.content }));
    const summary = session.summary || "";
    const memories = await retrieveContext({
        userId: req.user?.id,
        sessionId,
        query: message,
        topK: 8
    });

    const context = [
        summary ? `# TÓM TẮT TRƯỚC: ${summary}` : "",
        memories.length ? `# GỢI NHỚ LIÊN QUAN:\n- ${memories.map(m => m.text).join("\n- ")}` : ""
    ].filter(Boolean).join("\n\n");

    // gọi LLM
    const sys = {
        role: "system" as const,
        content:
            `Bạn là trợ lý của LaptopShop. Bám sát câu hỏi, dùng tiếng Việt tự nhiên.
Nếu thiếu dữ kiện, hãy hỏi lại 1 câu ngắn để làm rõ.`
    };

    const ctxMsg = context ? [{ role: "system" as const, content: `NGỮ CẢNH:\n${context}` }] : [];
    const msgs = [sys, ...ctxMsg, ...history, { role: "user" as const, content: message }];

    const out = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: msgs,
        temperature: 0.3
    });

    let answer = out.choices[0].message.content || "";

    // answer-check
    const check = await answerCheck(message, context, answer);
    if (!check.pass && check.revised) answer = check.revised;

    // lưu assistant msg
    const asMsg = await prisma.aiChatMessage.create({
        data: { sessionId, role: "ASSISTANT", content: answer }
    });
    await upsertMessageEmbedding(asMsg.id, asMsg.content);

    // tóm tắt cuộn (thưa hơn: mỗi 6 lượt)
    const count = await prisma.aiChatMessage.count({ where: { sessionId } });
    if (count % 6 === 0) await rollupSummary(sessionId);

    // cân nhắc lưu trí nhớ
    const histSnippet = history.slice(-8).map(m => `${m.role}: ${m.content}`).join("\n");
    await maybeStoreMemories({
        userId: req.user?.id,
        sessionId,
        historySnippet: histSnippet,
        userMsg: message,
        assistantMsg: answer
    });

    // update lastUsedAt
    await prisma.aiChatSession.update({
        where: { id: sessionId },
        data: { lastUsedAt: new Date() }
    });

    res.json({ answer, sessionId });
};
