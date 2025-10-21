import { Router } from 'express';
import { reindexProductsToKB, dropKB } from 'services/ai/indexer.service';

const router = Router();

function assertToken(req: any) {
    const header = req.headers['x-ai-admin'] || req.query.token;
    if (!process.env.AI_ADMIN_TOKEN || header !== process.env.AI_ADMIN_TOKEN) {
        const err: any = new Error('Forbidden'); err.status = 403; throw err;
    }
}

router.post('/ai/admin/reindex', async (req, res) => {
    try {
        assertToken(req);
        const out = await reindexProductsToKB();
        res.json({ ok: true, ...out });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

router.post('/ai/admin/drop-kb', async (req, res) => {
    try {
        assertToken(req);
        const out = await dropKB();
        res.json({ ok: true, ...out });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

export default router;
