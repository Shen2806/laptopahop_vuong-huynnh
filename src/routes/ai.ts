// src/routes/ai.ts
import { Router } from "express";
import OpenAI from "openai";
// Nếu bạn đã có hàm retrieveContext thì import vào (không có cũng OK)
// import { retrieveContext } from "../services/ai/retrieval.service";

const router = Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

router.post("/ai/chat", async (req, res) => {
    try {
        // ---- DEBUG để bắt lỗi 400 hiện tại
        console.log("[AI] content-type:", req.headers["content-type"]);
        console.log("[AI] raw body:", req.body);

        // Chấp nhận nhiều kiểu để tránh rơi vào 400
        let message = "";
        if (typeof req.body === "string") message = req.body.trim();
        else if (typeof req.body?.message === "string") message = req.body.message.trim();
        else if (typeof req.body?.q === "string") message = req.body.q.trim();

        if (!message) {
            // Đừng trả 400 nữa -> trả hướng dẫn để FE không đỏ log
            return res.json({
                reply:
                    "Bạn cho mình biết **ngân sách + nhu cầu + ràng buộc** nhé (vd: 20tr cho gaming, 15.6\" 144Hz, RAM 16GB).",
            });
        }

        // (tuỳ chọn) lấy ngữ cảnh từ vector DB
        // const ctxItems = await retrieveContext({ userId: req.user?.id, query: message, topK: 8 });
        // const ctxText = (ctxItems || []).map(m => `• ${m.text}`).join("\n");

        const system =
            "Bạn là trợ lý tư vấn laptop của LaptopShop, trả lời tiếng Việt, súc tích, có gạch đầu dòng, nêu 2–3 gợi ý cụ thể (model + lý do khớp yêu cầu).";

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: system },
            // ctxText ? { role: "system", content: `Ghi nhớ:\n${ctxText}` } : undefined,
            { role: "user", content: message },
        ].filter(Boolean) as any;

        const ai = await client.chat.completions.create({
            model: "gpt-4o-mini", // hoặc gpt-4o, gpt-4.1-mini tuỳ key
            temperature: 0.3,
            messages,
        });

        const reply = ai.choices?.[0]?.message?.content?.trim() || "Xin lỗi, hiện chưa trả lời được.";
        return res.json({ reply });
    } catch (err: any) {
        console.error("[AI] error:", err);
        return res.status(200).json({
            reply: "Có lỗi kết nối máy chủ. Bạn thử lại sau nhé.",
            error: String(err?.message || err),
        });
    }
});

export default router;
