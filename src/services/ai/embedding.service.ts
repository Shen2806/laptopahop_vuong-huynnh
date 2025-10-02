// src/services/ai/embedding.service.ts
import OpenAI from "openai";
import { prisma } from "config/client";
import 'dotenv/config';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export async function embed(text: string, model = DEFAULT_EMBEDDING_MODEL) {
    const res = await openai.embeddings.create({ model, input: text });
    return { vector: res.data[0].embedding as number[], model };
}

async function safeUpsertEmbedding(
    where: any,
    createData: any,
    updateData: any,
    fallbackFilter: any
) {
    try {
        return await prisma.aiEmbedding.upsert({ where, create: createData, update: updateData });
    } catch {
        const exist = await prisma.aiEmbedding.findFirst({ where: fallbackFilter });
        if (exist) return prisma.aiEmbedding.update({ where: { id: exist.id }, data: updateData });
        return prisma.aiEmbedding.create({ data: createData });
    }
}

export async function upsertMessageEmbedding(messageId: number, text: string, model = DEFAULT_EMBEDDING_MODEL) {
    const { vector } = await embed(text, model);
    const dim = vector.length;
    // Unique: @@unique([messageId, model])
    return safeUpsertEmbedding(
        { messageId_model: { messageId, model } },
        { messageId, model, vector, dim },
        { vector, dim, model },
        { messageId, model }
    );
}

export async function upsertMemoryEmbedding(memoryId: number, text: string, model = DEFAULT_EMBEDDING_MODEL) {
    const { vector } = await embed(text, model);
    const dim = vector.length;
    // Unique: @@unique([memoryId, model])
    return safeUpsertEmbedding(
        { memoryId_model: { memoryId, model } },
        { memoryId, model, vector, dim },
        { vector, dim, model },
        { memoryId, model }
    );
}

export function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-9;
    return dot / denom;
}
