// src/routes/ai.router.ts
import { Router } from "express";
import { runTurtleAgent } from "../services/ai/agent.service"; // dùng đường dẫn tương đối cho chắc

const router = Router();

router.post("/ai/chat", async (req, res) => {
    try {
        let message = "", clientSessionId: number | undefined;
        if (typeof req.body === "string") message = req.body.trim();
        else if (req.body) {
            if (typeof req.body.message === "string") message = req.body.message.trim();
            if (req.body.sessionId) clientSessionId = Number(req.body.sessionId);
        }
        if (!message) {
            return res.json({
                reply:
                    'Bạn cho mình biết **ngân sách + nhu cầu + hãng** nhé (vd: "ASUS gaming ~20tr", "dưới 15tr mỏng nhẹ").',
                products: [],
            });
        }

        const userId = (req as any)?.user?.id ?? null;
        const out = await runTurtleAgent({ userId, clientSessionId, message });
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[AI]", err);
        return res.status(500).json({ message: "server error" });
    }
});

export default router;
