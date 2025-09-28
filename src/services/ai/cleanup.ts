// src/services/ai/cleanup.ts
import { prisma } from "config/client";

export async function cleanupAiForUser(userId: number) {
    // xoá embeddings theo message/memory của user
    await prisma.aiEmbedding.deleteMany({
        where: {
            OR: [
                { message: { session: { userId } } },
                { memory: { userId } }
            ]
        }
    });
    await prisma.aiChatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.aiMemory.deleteMany({ where: { userId } });
    await prisma.aiChatSession.deleteMany({ where: { userId } });
}
