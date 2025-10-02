// src/services/ai/memory.service.ts
import OpenAI from "openai";
import { prisma } from "config/client";
import { upsertMemoryEmbedding } from "./embedding.service";
import 'dotenv/config';
import crypto from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MEMORY_PROMPT = `
Bạn là bộ lọc "trí nhớ" cho trợ lý. Từ hội thoại (history + user_msg + assistant_msg),
hãy trích tối đa 0-3 FACT NGẮN, hữu ích cho tương lai (không trùng lặp, không riêng tư nhạy cảm).
Mỗi item: {type:"PREFERENCE"|"FACT"|"EPHEMERAL", key:string, value:string, score:0..1}.
Chỉ lưu khi score>0.6. Trả MẢNG JSON, không giải thích thêm.
`;

const PII_RE = /(\b\d{9,12}\b)|((\+?84|0)\d{9,10})|([\w.-]+@[\w.-]+\.[A-Za-z]{2,})/g;

function sigMem(type: string, key: string, value: string) {
    return crypto.createHash("sha256").update(`${type}\n${key}\n${value}`).digest("hex");
}

export async function maybeStoreMemories(opts: {
    userId?: number;
    sessionId: number;
    historySnippet: string;
    userMsg: string;
    assistantMsg: string;
}) {
    const { userId, sessionId, historySnippet, userMsg, assistantMsg } = opts;

    const sys = { role: "system" as const, content: MEMORY_PROMPT };
    const usr = { role: "user" as const, content: JSON.stringify({ history: historySnippet, user_msg: userMsg, assistant_msg: assistantMsg }) };

    const out = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [sys, usr],
        temperature: 0.2,
        response_format: { type: "json_object" }
    });

    let items: any[] = [];
    try { items = JSON.parse(out.choices[0].message.content || "[]"); } catch { }
    if (!Array.isArray(items)) return;

    for (const it of items) {
        const value = String(it?.value || "");
        if (!value || (it.score ?? 0) < 0.6) continue;
        if (PII_RE.test(value)) continue;

        const type = String(it.type || "FACT");
        const key = String(it.key || "auto");
        const sig = sigMem(type, key, value);

        const exist = await prisma.aiMemory.findFirst({ where: { sessionId, key: sig } });
        if (exist) {
            await prisma.aiMemory.update({
                where: { id: exist.id },
                data: { score: Math.min(1, Math.max(exist.score, Number(it.score || 0.6))), createdAt: new Date() }
            });
            continue;
        }

        const mem = await prisma.aiMemory.create({
            data: {
                userId, sessionId, type,
                key: sig,
                value,
                score: Number(it.score || 0.6),
                expiresAt: type === "EPHEMERAL" ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null
            }
        });
        await upsertMemoryEmbedding(mem.id, mem.value);
    }
}
