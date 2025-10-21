// src/routes/ai.ts
import { Router, Request, Response } from "express";
import { runTurtleAgent } from "services/ai/agent.service";
import "dotenv/config";

const router = Router();

router.post("/ai/chat", async (req: Request, res: Response) => {
    try {
        let message = "";
        let clientSessionId: number | undefined;

        if (typeof req.body === "string") {
            message = req.body.trim();
        } else if (req.body) {
            if (typeof req.body.message === "string") {
                message = String(req.body.message).trim();
            }
            if (req.body.sessionId) clientSessionId = Number(req.body.sessionId);
        }

        if (!message) {
            return res.json({
                reply:
                    'Bạn cho mình **ngân sách + nhu cầu + hãng** nhé (vd: "ASUS gaming ~20tr", "mỏng nhẹ dưới 15tr").',
                products: [],
                suggestions: ["Tư vấn theo ngân sách", "Gợi ý gaming", "Máy mỏng nhẹ < 1.3kg"],
            });
        }

        const userId = (req as any)?.user?.id ?? null;

        const { status, body } = await runTurtleAgent({
            userId,
            clientSessionId,
            message,
        });

        return res.status(status).json(body);
    } catch (e: any) {
        console.error("[AI/chat] Error:", e);
        return res.status(500).json({ message: "server error", detail: e?.message });
    }
});

router.get("/ai/ping", (_req, res) => res.json({ ok: true }));

export default router;
