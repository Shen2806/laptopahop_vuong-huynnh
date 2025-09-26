// services/embedding.service.ts

import OpenAI from "openai";
import { prisma } from "config/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const EMBEDDING_MODEL = "text-embedding-3-small"; // rẻ + đủ

export async function embed(text: string) {
    const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return res.data[0].embedding as number[];
}

/**
 * Helper upsert: cố gắng dùng upsert với unique/composite-unique;
 * nếu schema hiện TẠM CHƯA có unique đúng => fallback findFirst + update/create.
 */
async function safeUpsertEmbedding(
    where: any, // where của unique (hoặc điều kiện tìm kiếm)
    createData: any,
    updateData: any,
    fallbackFilter: any // điều kiện findFirst khi where KHÔNG phải unique
) {
    try {
        // TH1: bạn đã có @unique / @@unique đúng -> OK
        return await prisma.aiEmbedding.upsert({
            where,
            create: createData,
            update: updateData,
        });
    } catch (e) {
        // TH2: schema CHƯA unique -> fallback manual
        const exist = await prisma.aiEmbedding.findFirst({ where: fallbackFilter });
        if (exist) {
            return prisma.aiEmbedding.update({
                where: { id: exist.id },
                data: updateData,
            });
        }
        return prisma.aiEmbedding.create({ data: createData });
    }
}

/**
 * Upsert embedding gắn với message. Nếu bạn đã tạo composite unique @@unique([memoryId, messageId]),
 * truyền kèm memoryId sẽ tận dụng đúng chuẩn; nếu chưa có, code vẫn chạy nhờ fallback.
 */
export async function upsertMessageEmbedding(
    messageId: number,
    text: string,
    memoryId?: number
) {
    const vector = await embed(text);
    const dim = vector.length;

    // ƯU TIÊN: dùng composite-unique nếu bạn đã thêm trong schema:
    // @@unique([memoryId, messageId], name: "embedding_per_message_per_memory")
    if (typeof memoryId === "number") {
        // thử composite unique trước
        return safeUpsertEmbedding(
            {
                embedding_per_message_per_memory: { memoryId, messageId },
            },
            { memoryId, messageId, vector, dim },
            { vector, dim },
            { memoryId, messageId } // fallback filter
        );
    }

    // Nếu không có memoryId: thử unique theo messageId (nếu bạn đã đặt @unique cho messageId)
    return safeUpsertEmbedding(
        { messageId }, // nếu messageId là @unique sẽ OK
        { messageId, vector, dim },
        { vector, dim },
        { messageId } // fallback filter
    );
}

/**
 * Upsert embedding theo memoryId độc lập (dùng cho memory rời).
 * Nếu memoryId chưa @unique => fallback manual vẫn chạy.
 */
export async function upsertMemoryEmbedding(memoryId: number, text: string) {
    const vector = await embed(text);
    const dim = vector.length;

    return safeUpsertEmbedding(
        { memoryId }, // nếu memoryId @unique thì OK
        { memoryId, vector, dim },
        { vector, dim },
        { memoryId } // fallback filter
    );
}

export function cosine(a: number[], b: number[]) {
    let dot = 0,
        na = 0,
        nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-9;
    return dot / denom;
}
