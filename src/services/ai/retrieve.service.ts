// services/retriever.service.ts (hoặc file bạn đang đặt retrieveContext)

import { prisma } from "config/client";
import { embed, cosine } from "./embedding.service";
import type { AiMemory } from "@prisma/client";
import { CohereClient } from "cohere-ai";

const cohere =
    process.env.COHERE_API_KEY
        ? new CohereClient({ token: process.env.COHERE_API_KEY! })
        : null;

export async function retrieveContext(opts: {
    userId?: number;
    sessionId?: number;
    query: string;
    topK?: number;
}) {
    const { userId, sessionId, query, topK = 12 } = opts;

    // 0) embedding câu hỏi
    const q = await embed(query);

    // 1) Lấy memories liên quan: (userId OR sessionId) nếu cả 2 có; nếu chỉ có 1 thì dùng điều kiện đơn
    let where: any = undefined;
    if (userId && sessionId) {
        where = { OR: [{ userId }, { sessionId }] };
    } else if (userId) {
        where = { userId };
    } else if (sessionId) {
        where = { sessionId };
    }

    const mems = await prisma.aiMemory.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        take: 200,
    });

    if (!mems.length) return [];

    const ids = mems.map((m) => m.id);
    const embs = await prisma.aiEmbedding.findMany({
        where: { memoryId: { in: ids } },
        select: { memoryId: true, vector: true },
    });

    // 2) Tính cosine brute-force
    const scored = embs
        .map((e) => {
            const v = Array.isArray(e.vector) ? (e.vector as number[]) : [];
            const s = v.length ? cosine(q, v) : -1;
            return { id: e.memoryId!, score: s };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, topK * 2));

    if (!scored.length) return [];

    const scoredIds = new Set(scored.map((s) => s.id));
    const candidate = mems
        .filter((m) => scoredIds.has(m.id))
        .map((m) => ({
            id: m.id,
            type: m.type,
            text: m.value,
            score: scored.find((s) => s.id === m.id)?.score ?? 0,
        }));

    // 3) (Tuỳ chọn) Cohere Rerank – nhanh & chính xác hơn
    if (cohere && candidate.length) {
        const { results } = await cohere.rerank({
            model: "rerank-english-v3.0",
            query,
            documents: candidate.map((c) => c.text),
            topN: Math.min(topK, candidate.length),
        });
        // results[i].index là chỉ số trong mảng documents gốc
        return results.map((r) => candidate[r.index]);
    }

    // 4) Fallback: trả topK theo cosine
    return candidate.slice(0, topK);
}
