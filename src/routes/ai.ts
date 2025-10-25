// src/routes/ai.ts
import { Router, Request, Response } from "express";
import { runTurtleAgent } from "services/ai/agent.service";
import "dotenv/config";

const router = Router();

// helper sleep
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

router.post("/ai/chat", async (req: Request, res: Response) => {
    try {
        let message = "";
        let clientSessionId: number | undefined;

        if (typeof req.body === "string") {
            message = req.body.trim();
        } else if (req.body) {
            message = (req.body.message || "").trim();
            clientSessionId = Number(req.body.sessionId) || undefined;
        }

        const userId = (req as any)?.user?.id ?? null;

        const t0 = Date.now();
        const { status, body } = await runTurtleAgent({
            userId,
            clientSessionId,
            message,
        });
        const inferMs = Date.now() - t0;

        // Delay cấu hình: ENV ưu tiên, sau đó cho phép client ghi đè qua body.delayMs
        const REPLY_DELAY_MS =
            Number(process.env.AI_REPLY_DELAY_MS ?? 0) ||
            Number((req.body && req.body.delayMs) || 0);

        if (REPLY_DELAY_MS > 0) {
            await sleep(REPLY_DELAY_MS);
        }

        // Gắn latency đo được (nếu muốn)
        (body as any)._latency = { inferMs, addedDelayMs: REPLY_DELAY_MS };

        return res.status(status).json(body);
    } catch (e: any) {
        console.error("[AI/chat] Error:", e);
        return res.status(500).json({ message: "server error", detail: e?.message });
    }
});

router.get("/ai/ping", (_req, res) => res.json({ ok: true }));

export default router;
