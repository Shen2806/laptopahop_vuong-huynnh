import { prisma } from 'config/client';
import { LocalProvider } from './vendor/local';
import { upsertMemoryEmbedding } from './embedding.service';

const provider = new LocalProvider();

type Mem = { type: 'PREFERENCE' | 'FACT' | 'EPHEMERAL', key: string, value: string, score?: number, ttl_hours?: number };

const SYS = `
Bạn là module TRÍCH XUẤT KÝ ỨC cho chatbot bán laptop.
Trả về duy nhất JSON:
{"items":[{"type":"PREFERENCE|FACT|EPHEMERAL","key":"...", "value":"...", "score":0.5, "ttl_hours": 2}]}
- PREFERENCE: sở thích (hãng, cân nặng, kích cỡ, ngân sách quen thuộc…)
- FACT: dữ kiện bền vững (chuyên ngành, nghề…)
- EPHEMERAL: tạm thời (filter lần này), cần ttl_hours.
Không thêm chữ ngoài JSON.
`;

export async function maybeStoreMemories(params: {
    userId: number | null, sessionId: number, historySnippet: string, userMsg: string, assistantMsg: string
}) {
    const { userId, sessionId, historySnippet, userMsg, assistantMsg } = params;
    const prompt = `HỘI THOẠI:\n${historySnippet}\n\nUSER: ${userMsg}\nASSISTANT: ${assistantMsg}`;

    let obj: { items?: Mem[] } = {};
    try {
        const { content } = await provider.chat([
            { role: 'system', content: SYS },
            { role: 'user', content: prompt }
        ], { temperature: 0.1 });
        obj = JSON.parse(content || '{}');
    } catch { }

    const items = Array.isArray(obj.items) ? obj.items : [];
    for (const it of items) {
        const type = (it.type || 'EPHEMERAL') as Mem['type'];
        const score = typeof it.score === 'number' ? it.score : (type === 'PREFERENCE' ? 0.8 : type === 'FACT' ? 0.7 : 0.5);
        const ttlH = typeof it.ttl_hours === 'number' ? it.ttl_hours : (type === 'EPHEMERAL' ? 2 : undefined);
        const expiresAt = ttlH ? new Date(Date.now() + ttlH * 3600 * 1000) : null;

        const mem = await prisma.aiMemory.create({
            data: {
                userId: userId ?? undefined,
                sessionId,
                type,
                key: it.key?.slice(0, 255) || 'info',
                value: it.value || '',
                score,
                expiresAt: expiresAt ?? undefined
            }
        });
        await upsertMemoryEmbedding(mem.id, `${mem.key}: ${mem.value}`);
    }
}
