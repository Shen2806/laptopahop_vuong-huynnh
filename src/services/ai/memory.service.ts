import OpenAI from "openai";
import { prisma } from "config/client";
import { upsertMemoryEmbedding } from "./embedding.service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const MEMORY_PROMPT = `
Bạn là bộ lọc "trí nhớ" cho trợ lý. Từ cuộc hội thoại (history + user_msg + assistant_msg),
hãy trích ra những sự thật NGẮN, hữu ích cho tương lai (không trùng lặp, không riêng tư nhạy cảm).
Mỗi item gồm: {type: "PREFERENCE"|"FACT"|"EPHEMERAL", key: string, value: string, score: 0..1}.

Chỉ đưa 0-3 item, score > 0.6 mới đáng lưu.
Trả về JSON mảng, KHÔNG giải thích thêm.
`;

export async function maybeStoreMemories(opts: {
    userId?: number;
    sessionId: number;
    historySnippet: string; // tóm lược ~5-10 turns gần nhất
    userMsg: string;
    assistantMsg: string;
}) {
    const { userId, sessionId, historySnippet, userMsg, assistantMsg } = opts;

    const sys = { role: "system" as const, content: MEMORY_PROMPT };
    const usr = {
        role: "user" as const, content: JSON.stringify({
            history: historySnippet,
            user_msg: userMsg,
            assistant_msg: assistantMsg
        })
    };

    const out = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [sys, usr],
        temperature: 0.2
    });

    let items: any[] = [];
    try { items = JSON.parse(out.choices[0].message.content || "[]"); } catch { }
    if (!Array.isArray(items)) return;

    for (const it of items) {
        if (!it?.value || (it.score ?? 0) < 0.6) continue;
        const mem = await prisma.aiMemory.create({
            data: {
                userId, sessionId,
                type: String(it.type || "FACT"),
                key: String(it.key || "auto"),
                value: String(it.value),
                score: Number(it.score || 0.6),
                expiresAt: it.type === "EPHEMERAL" ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null
            }
        });
        await upsertMemoryEmbedding(mem.id, mem.value);
    }
}
