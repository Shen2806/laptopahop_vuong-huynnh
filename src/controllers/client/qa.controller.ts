import { Request, Response } from "express";
import { prisma } from "config/client";
import { getIO } from "src/socket"; // dùng để bắn socket

// GET /products/:id/questions  (public)
export async function getProductQuestionsAPI(req: Request, res: Response) {
    try {
        const productId = Number(req.params.id);
        if (!Number.isFinite(productId)) {
            return res.status(400).json({ message: "invalid productId" });
        }

        const list = await prisma.productQuestion.findMany({
            where: { productId },
            orderBy: { createdAt: "desc" },
            include: {
                user: true,
                replies: { orderBy: { createdAt: "asc" } },
            },
        });

        // Chuẩn hoá dữ liệu trả ra FE
        const data = list.map((q) => ({
            id: q.id,
            productId: q.productId,
            content: q.content,
            createdAt: q.createdAt,
            user: {
                id: q.userId,
                name: q.user?.fullName || q.user?.username || `User #${q.userId}`,
                avatar: q.user?.avatar || null,
            },
            replies: q.replies.map((r) => ({
                id: r.id,
                role: r.role, // "ADMIN"
                content: r.content,
                createdAt: r.createdAt,
            })),
        }));

        res.json(data);
    } catch (err) {
        console.error("getProductQuestionsAPI error:", err);
        res.status(500).json({ message: "server error" });
    }
}

// POST /products/:id/questions  (user hỏi; admin KHÔNG được hỏi)
export async function postProductQuestionAPI(req: any, res: Response) {
    try {
        const productId = Number(req.params.id);
        const content = String(req.body?.content || "").trim();

        if (!Number.isFinite(productId)) {
            return res.status(400).json({ message: "invalid productId" });
        }
        if (!content) return res.status(400).json({ message: "content required" });

        // chặn admin đặt câu hỏi
        if (req.user?.role?.name === "ADMIN") {
            return res.status(403).json({ message: "Admin không được đặt câu hỏi" });
        }

        const q = await prisma.productQuestion.create({
            data: { productId, userId: req.user.id, content },
            include: { user: true, replies: true },
        });

        // Thông báo cho admin có câu hỏi mới
        try {
            const io = getIO();
            io.to("admins").emit("qa:new_question", {
                id: q.id,
                productId: q.productId,
                preview: q.content.slice(0, 100),
                by: q.user?.fullName || q.user?.username || `User #${q.userId}`,
                at: new Date().toISOString(),
            });
        } catch (e) {
            // socket optional
            console.warn("socket emit qa:new_question failed:", e);
        }

        return res.json({
            id: q.id,
            productId: q.productId,
            content: q.content,
            createdAt: q.createdAt,
            user: {
                id: q.userId,
                name: q.user?.fullName || q.user?.username || `User #${q.userId}`,
                avatar: q.user?.avatar || null,
            },
            replies: [],
        });
    } catch (err) {
        console.error("postProductQuestionAPI error:", err);
        res.status(500).json({ message: "server error" });
    }
}

// POST /questions/:id/replies  (chỉ ADMIN trả lời, mỗi câu hỏi chỉ 1 reply)
export async function postAdminReplyAPI(req: any, res: Response) {
    try {
        const questionId = Number(req.params.id);
        const content = String(req.body?.content || "").trim();

        if (!Number.isFinite(questionId)) {
            return res.status(400).json({ message: "invalid questionId" });
        }
        if (req.user?.role?.name !== "ADMIN") {
            return res.status(403).json({ message: "Chỉ Admin được trả lời câu hỏi" });
        }
        if (!content) return res.status(400).json({ message: "content required" });

        // mỗi câu hỏi chỉ 1 trả lời
        const existed = await prisma.productQuestionReply.count({ where: { questionId } });
        if (existed > 0) {
            return res.status(409).json({ message: "Câu hỏi này đã có câu trả lời" });
        }

        const q = await prisma.productQuestion.findUnique({
            where: { id: questionId },
            select: { id: true, productId: true, userId: true },
        });
        if (!q) return res.status(404).json({ message: "Question not found" });

        const rep = await prisma.productQuestionReply.create({
            data: { questionId, userId: req.user.id, role: "ADMIN", content },
        });

        // Bắn socket: báo admin panel + báo về user đã hỏi
        try {
            const io = getIO();
            io.to("admins").emit("qa:answered", {
                questionId: q.id,
                productId: q.productId!,
                contentPreview: rep.content.slice(0, 100),
                at: new Date().toISOString(),
            });
            if (q.userId) {
                io.to(`user-${q.userId}`).emit("qa:answer_available", {
                    questionId: q.id,
                    productId: q.productId!,
                    at: new Date().toISOString(),
                });
            }
        } catch (e) {
            console.warn("socket emit qa:answered/qa:answer_available failed:", e);
        }

        return res.json({
            id: rep.id,
            role: rep.role,
            content: rep.content,
            createdAt: rep.createdAt,
        });
    } catch (err) {
        console.error("postAdminReplyAPI error:", err);
        res.status(500).json({ message: "server error" });
    }
}
