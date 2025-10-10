import { prisma } from 'config/client';

export async function cleanupEphemeralMemories() {
    const now = new Date();
    const list = await prisma.aiMemory.findMany({ where: { type: 'EPHEMERAL', expiresAt: { lt: now } }, take: 500 });
    for (const m of list) {
        await prisma.aiEmbedding.deleteMany({ where: { memoryId: m.id } }).catch(() => { });
        await prisma.aiMemory.delete({ where: { id: m.id } }).catch(() => { });
    }
    return { removed: list.length };
}
