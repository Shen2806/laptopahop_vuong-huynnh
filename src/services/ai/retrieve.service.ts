import { prisma } from 'config/client';
import { LocalProvider } from './vendor/local';

const provider = new LocalProvider();

function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
}

export async function retrieveContext(opts: {
    userId: number | null, sessionId: number, query: string, topK?: number
}) {
    const { userId, sessionId, query } = opts;
    const topK = opts.topK ?? 8;
    const { embedding: qvec } = await provider.embed(query);

    // Messages trong phiên
    const msgEms = await prisma.aiEmbedding.findMany({
        where: { messageId: { not: null }, message: { sessionId } },
        include: { message: true }, orderBy: { id: 'desc' }, take: 400
    });

    // Memories: user, session, và KB toàn cục (userId=null & sessionId=null)
    const memEms = await prisma.aiEmbedding.findMany({
        where: {
            memoryId: { not: null },
            OR: [
                { memory: { userId: userId ?? undefined } },
                { memory: { sessionId } },
                { memory: { userId: null, sessionId: null } }
            ]
        },
        include: { memory: true }, orderBy: { id: 'desc' }, take: 1000
    });

    type Hit = { text: string; score: number; kind: 'message' | 'memory' };
    const hits: Hit[] = [];

    for (const e of msgEms) {
        const v = e.vector as unknown as number[];
        const s = cosine(qvec, v);
        hits.push({ text: e.message?.content || '', score: s + 0.01, kind: 'message' });
    }
    for (const e of memEms) {
        const v = e.vector as unknown as number[];
        const s = cosine(qvec, v);
        let txt = e.memory?.value || '';
        // khi push hit memory:
        const k = e.memory?.key || '';
        let bonus = 0;
        if (k.startsWith('KB:CANONICAL:QA:')) bonus += 0.08;   // ưu tiên cao hơn
        if (k.startsWith('KB:PRODUCT:')) bonus += 0.02;

        hits.push({ text: e.memory?.value || '', score: s + bonus, kind: 'memory' });

    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK).map(h => ({ text: h.text, score: h.score, kind: h.kind }));
}
