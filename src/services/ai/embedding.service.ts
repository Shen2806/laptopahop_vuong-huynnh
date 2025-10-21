import { prisma } from 'config/client';
import { LocalProvider } from './vendor/local';

const provider = new LocalProvider();

function sanitize(vec: number[]) {
    return vec.map(v => (Number.isFinite(v) ? +v : 0));
}

export async function upsertMessageEmbedding(messageId: number, content: string) {
    const { embedding, dim } = await provider.embed(content);
    const json = sanitize(embedding);

    const exist = await prisma.aiEmbedding.findFirst({ where: { messageId } });
    if (exist) {
        await prisma.aiEmbedding.update({ where: { id: exist.id }, data: { dim, vector: json, model: 'local-embed' } });
    } else {
        await prisma.aiEmbedding.create({ data: { messageId, dim, vector: json, model: 'local-embed' } });
    }
}

export async function upsertMemoryEmbedding(memoryId: number, text: string) {
    const { embedding, dim } = await provider.embed(text);
    const json = sanitize(embedding);

    const exist = await prisma.aiEmbedding.findFirst({ where: { memoryId } });
    if (exist) {
        await prisma.aiEmbedding.update({ where: { id: exist.id }, data: { dim, vector: json, model: 'local-embed' } });
    } else {
        await prisma.aiEmbedding.create({ data: { memoryId, dim, vector: json, model: 'local-embed' } });
    }
}
