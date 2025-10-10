import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from 'config/client';
import { upsertMemoryEmbedding } from 'services/ai/embedding.service';

const router = Router();

function assertToken(req: any) {
    const key = req.headers['x-ai-admin'] || req.query.token;
    if (!process.env.AI_ADMIN_TOKEN || key !== process.env.AI_ADMIN_TOKEN) {
        const err: any = new Error('Forbidden'); err.status = 403; throw err;
    }
}

/**
 * POST /api/ai/admin/teach
 * body: { question: string, answer: string, tags?: string[] }
 */
router.post('/ai/admin/teach', async (req, res) => {
    try {
        assertToken(req);
        const { question, answer, tags } = req.body || {};
        if (!question || !answer) return res.status(400).json({ message: 'question & answer required' });

        const h = crypto.createHash('sha1').update(question.trim().toLowerCase()).digest('hex').slice(0, 16);
        const key = `KB:CANONICAL:QA:${h}`;

        const value = [
            `CÂU HỎI MẪU: ${question.trim()}`,
            `CÂU TRẢ LỜI CHUẨN: ${answer.trim()}`,
            Array.isArray(tags) && tags.length ? `TAGS: ${tags.join(', ')}` : ''
        ].filter(Boolean).join('\n');

        const exist = await prisma.aiMemory.findFirst({ where: { key, userId: null, sessionId: null } });
        let memId: number;
        if (exist) {
            const m = await prisma.aiMemory.update({
                where: { id: exist.id },
                data: { value, type: 'FACT', score: 0.95 }
            });
            memId = m.id;
        } else {
            const m = await prisma.aiMemory.create({
                data: { key, value, type: 'FACT', score: 0.95 }
            });
            memId = m.id;
        }
        await upsertMemoryEmbedding(memId, `${key}: ${value}`);
        res.json({ ok: true, key });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

export default router;
