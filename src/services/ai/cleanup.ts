// src/services/ai/cleanup.ts
import { prisma } from "config/client";

export async function cleanupAiForUser(userId: number) {
    await prisma.aiEmbedding.deleteMany({
        where: {
            OR: [{ message: { session: { userId } } }, { memory: { userId } }]
        }
    });
    await prisma.aiChatMessage.deleteMany({ where: { session: { userId } } });
    await prisma.aiMemory.deleteMany({ where: { userId } });
    await prisma.aiChatSession.deleteMany({ where: { userId } });
}

export async function cleanupExpiredMemories() {
    const expired = await prisma.aiMemory.findMany({
        where: { expiresAt: { lt: new Date() } },
        select: { id: true }
    });
    const ids = expired.map(m => m.id);
    if (!ids.length) return;
    await prisma.aiEmbedding.deleteMany({ where: { memoryId: { in: ids } } });
    await prisma.aiMemory.deleteMany({ where: { id: { in: ids } } });
}
