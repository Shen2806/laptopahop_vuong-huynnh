import { Router } from 'express';
import { reindexProductsToKB, dropKB, seedCanonicalQA } from 'services/ai/indexer.service';
import { runTurtleAgent } from 'services/ai/agent.service';
import { retrieveContext } from 'services/ai/retrieve.service';

const router = Router();

function assertToken(req: any) {
    const header = req.headers['x-ai-admin'] || req.query.token;
    if (!process.env.AI_ADMIN_TOKEN || header !== process.env.AI_ADMIN_TOKEN) {
        const err: any = new Error('Forbidden'); err.status = 403; throw err;
    }
}

/** Reindex toàn bộ product -> KB:PRODUCT */
router.post('/ai/admin/reindex', async (req, res) => {
    try {
        assertToken(req);
        const out = await reindexProductsToKB();
        res.json({ ok: true, ...out });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

/** Xoá KB theo prefix (mặc định KB:PRODUCT:) */
router.post('/ai/admin/drop-kb', async (req, res) => {
    try {
        assertToken(req);
        const prefix = (req.body && req.body.prefix) || 'KB:PRODUCT:';
        const out = await dropKB(prefix);
        res.json({ ok: true, ...out });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

/** Seed KB canonical Q&A (đổi trả/bảo hành/vận chuyển...) -> KB:CANONICAL:QA: */
router.post('/ai/admin/seed-canonical', async (req, res) => {
    try {
        assertToken(req);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!items.length) return res.status(400).json({ message: 'items[] required' });
        const out = await seedCanonicalQA(items);
        res.json({ ok: true, ...out });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

/**
 * Đánh giá nhanh chất lượng:
 * body.tests: Array<{ query: string, labelBudgetMidVnd?: number, goldDocs?: string[] }>
 *  - budget MAE: sai số tuyệt đối giữa ngân sách mid trích xuất và nhãn
 *  - latency: ms xử lý trung bình
 *  - hitAt1/hitAt5: tỷ lệ context top-1/top-5 chứa 1 trong goldDocs
 */
router.post('/ai/admin/eval', async (req, res) => {
    try {
        assertToken(req);
        const tests = Array.isArray(req.body?.tests) ? req.body.tests : [];
        if (!tests.length) return res.status(400).json({ message: 'tests[] required' });

        let seBudget = 0, nBudget = 0;
        let sumInfer = 0, cnt = 0;
        let hitAt1 = 0, hitAt5 = 0;

        for (const t of tests) {
            const t0 = Date.now();
            const ans = await runTurtleAgent({ userId: null, message: t.query });
            const inferMs = Date.now() - t0;
            sumInfer += inferMs; cnt++;

            const af = ans?.body?.activeFilters || {};
            const mid = af?.budget
                ? ((af.budget.min ?? af.budget.max ?? 0) + (af.budget.max ?? af.budget.min ?? 0)) /
                (af.budget.min && af.budget.max ? 2 : 1)
                : undefined;
            if (t.labelBudgetMidVnd != null && mid != null) {
                seBudget += Math.abs(mid - t.labelBudgetMidVnd);
                nBudget++;
            }

            if (Array.isArray(t.goldDocs) && t.goldDocs.length) {
                const ctx = await retrieveContext({ userId: null, sessionId: ans.body.sessionId, query: t.query, topK: 10 });
                const texts = ctx.map((x: any) => x.text || '');
                const top1 = texts.slice(0, 1);
                const top5 = texts.slice(0, 5);
                if (top1.some(tx => t.goldDocs!.some((g: string) => tx.includes(g)))) hitAt1++;
                if (top5.some(tx => t.goldDocs!.some((g: string) => tx.includes(g)))) hitAt5++;
            }
        }

        const budgetMAE = nBudget ? Math.round(seBudget / nBudget) : null;
        const avgInferMs = cnt ? Math.round(sumInfer / cnt) : null;
        return res.json({
            ok: true,
            samples: cnt,
            avgInferMs,
            budgetMAE,
            hitAt1: cnt ? +(hitAt1 / cnt).toFixed(3) : null,
            hitAt5: cnt ? +(hitAt5 / cnt).toFixed(3) : null
        });
    } catch (e: any) {
        res.status(e?.status || 500).json({ message: e?.message || 'error' });
    }
});

export default router;
