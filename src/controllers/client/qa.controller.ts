// src/controllers/client/qa.controller.ts
import { Request, Response } from "express";
import { prisma } from "config/client";

function isAdmin(req: Request) {
    const u: any = (req as any).user;
    // JWT của bạn trước đó đã include role
    return !!u && (u.role?.name === "ADMIN" || u.accountType === "ADMIN");
}

// GET /api/products/:id/questions
export const getProductQuestionsAPI = async (req: Request, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product id" });

    const questions = await prisma.productQuestion.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" },
        include: {
            user: { select: { id: true, fullName: true, avatar: true } },
            replies: { orderBy: { createdAt: "asc" }, take: 1 }, // 1 câu trả lời tối đa
        },
    });

    const data = questions.map(q => ({
        id: q.id,
        content: q.content,
        createdAt: q.createdAt,
        user: { id: q.user.id, name: q.user.fullName || `User#${q.user.id}`, avatar: q.user.avatar || null },
        reply: q.replies[0] ? {
            id: q.replies[0].id,
            content: q.replies[0].content,
            createdAt: q.replies[0].createdAt,
            role: q.replies[0].role,
        } : null,
    }));
    return res.json(data);
};

// POST /api/products/:id/questions  (user gửi câu hỏi)
export const postProductQuestionAPI = async (req: Request, res: Response) => {
    const productId = Number(req.params.id);
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "Nội dung câu hỏi không được rỗng" });

    const q = await prisma.productQuestion.create({
        data: { productId, userId: Number(user.id), content },
        include: {
            user: { select: { id: true, fullName: true, avatar: true } },
            replies: true,
        },
    });

    // Thông báo cho admin qua socket (nếu thích)
    try {
        const { getIO } = await import("src/socket");
        const io = getIO();
        io.to("admins").emit("qa:new_question", {
            productId, questionId: q.id, preview: content.slice(0, 80)
        });
    } catch { /* socket chưa init thì bỏ qua */ }

    return res.json({
        id: q.id,
        content: q.content,
        createdAt: q.createdAt,
        user: { id: q.user.id, name: q.user.fullName || `User#${q.user.id}`, avatar: q.user.avatar || null },
        reply: null,
    });
};

// POST /api/questions/:id/replies (admin trả lời)
export const postAdminReplyAPI = async (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });

    const questionId = Number(req.params.id);
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "Nội dung trả lời không được rỗng" });

    const q = await prisma.productQuestion.findUnique({
        where: { id: questionId },
        select: { id: true, userId: true, productId: true, replies: { select: { id: true } } },
    });
    if (!q) return res.status(404).json({ error: "Question not found" });

    // Chỉ cho 1 câu trả lời
    if (q.replies.length > 0) return res.status(409).json({ error: "Câu hỏi đã được trả lời" });

    const adminUser: any = (req as any).user;

    const reply = await prisma.productQuestionReply.create({
        data: {
            questionId,
            userId: Number(adminUser.id), // lưu id admin trả lời (nếu muốn)
            role: "ADMIN",
            content,
        }
    });

    // thông báo realtime cho user đã hỏi (nếu đang online)
    try {
        const { getIO } = await import("src/socket");
        const io = getIO();
        if (q.userId) {
            io.to(`user-${q.userId}`).emit("qa:answered", {
                questionId: q.id,
                content: reply.content,
                createdAt: reply.createdAt
            });
        }
    } catch { }

    return res.json({ ok: true, reply: { id: reply.id, content: reply.content, createdAt: reply.createdAt } });
};
