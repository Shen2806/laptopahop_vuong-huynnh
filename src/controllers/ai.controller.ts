// src/controllers/ai.controller.ts
import { Request, Response } from "express";
import OpenAI from "openai";
import { prisma } from "config/client";
import { retrieveContext } from "services/ai/retrieve.service";
import { upsertMessageEmbedding } from "services/ai/embedding.service";
import { maybeStoreMemories } from "services/ai/memory.service";
import { answerCheck } from "services/ai/answercheck.service";
import { SYSTEM_PROMPT } from "config/aiPrompt";
import 'dotenv/config';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const aiCreateSession = async (req: Request, res: Response) => {
    const session = await prisma.aiChatSession.create({
        data: { userId: (req as any)?.user?.id ?? null, status: "OPEN" }
    });
    res.json(session);
};

export const aiCloseSession = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const userId = (req as any)?.user?.id ?? null;
    // Nếu có user => ràng buộc; nếu không có user (khách), cho phép đóng theo id
    const where = userId ? { id, userId } : { id };
    const s = await prisma.aiChatSession.findFirst({ where });
    if (!s) return res.status(404).json({ message: "session not found" });
    await prisma.aiChatSession.update({ where: { id }, data: { status: "CLOSED" } });
    res.json({ ok: true });
};

export const aiChat = async (req: Request, res: Response) => {
    try {
        const { sessionId, message } = req.body || {};
        if (!sessionId || !message) return res.status(400).json({ message: "sessionId & message required" });

        const userId = (req as any)?.user?.id ?? null;
        const where = userId ? { id: Number(sessionId), userId } : { id: Number(sessionId) };
        const session = await prisma.aiChatSession.findFirst({ where });
        if (!session) return res.status(404).json({ message: "session not found" });
        if (session.status === "CLOSED") return res.status(403).json({ message: "session closed" });

        // 1) lưu user msg
        const userMsg = await prisma.aiChatMessage.create({
            data: { sessionId: session.id, role: "USER", content: String(message) }
        });
        await upsertMessageEmbedding(userMsg.id, userMsg.content);

        // 2) lấy history (đã gồm message vừa lưu) + context
        const lastMsgs = await prisma.aiChatMessage.findMany({
            where: { sessionId: session.id },
            orderBy: { id: "desc" },
            take: 12
        });
        const history = lastMsgs.reverse().map(m => ({ role: m.role.toLowerCase() as any, content: m.content }));
        const summary = session.summary || "";
        const memories = await retrieveContext({ userId, sessionId: session.id, query: message, topK: 8 });

        const context = [
            summary ? `# TÓM TẮT TRƯỚC: ${summary}` : "",
            memories.length ? `# GỢI NHỚ LIÊN QUAN:\n- ${memories.map(m => m.text).join("\n- ")}` : ""
        ].filter(Boolean).join("\n\n");

        // 3) build messages (KHÔNG đẩy lại message riêng)
        const sys = { role: "system" as const, content: SYSTEM_PROMPT };
        const ctxMsg = context ? [{ role: "system" as const, content: `NGỮ CẢNH:\n${context}` }] : [];
        const msgs = [sys, ...ctxMsg, ...history];

        // 4) gọi LLM
        const out = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: msgs,
            temperature: 0.3
        });

        let answer = out.choices[0].message.content || "";

        // 5) answer-check
        const check = await answerCheck(message, context, answer);
        if (!check.pass && check.revised) answer = check.revised;

        // 6) lưu assistant msg + usage
        const usage = out.usage;
        const asMsg = await prisma.aiChatMessage.create({
            data: {
                sessionId: session.id,
                role: "ASSISTANT",
                content: answer,
                tokens: usage?.total_tokens ?? null,
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null
            }
        });
        await upsertMessageEmbedding(asMsg.id, asMsg.content);

        // 7) cân nhắc lưu memory (snippet từ 8 turns gần nhất)
        const histSnippet = history.slice(-8).map(m => `${m.role}: ${m.content}`).join("\n");
        await maybeStoreMemories({
            userId, sessionId: session.id, historySnippet: histSnippet, userMsg: message, assistantMsg: answer
        });

        // 8) update lastUsedAt
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

        res.json({ answer, sessionId: session.id });
    } catch (e) {
        console.error("[aiChat]", e);
        return res.status(500).json({ message: "server error" });
    }
};
