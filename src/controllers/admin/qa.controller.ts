import { Request, Response } from "express";
import { prisma } from "config/client";
import { qaSocket } from "src/socket";

// Trang admin Q&A (render UI)
export const getAdminQAPage = async (_req: Request, res: Response) => {
    return res.render("admin/qa/index"); // sẽ tạo file views ở bước dưới
};

// API: list Q&A cho admin
// GET /admin/api/qa/questions?status=all|answered|unanswered&search=
export const adminListQuestionsAPI = async (req: Request, res: Response) => {
    const status = String(req.query.status || "all");
    const search = String(req.query.search || "").trim();

    const where: any = {};
    if (search) {
        where.OR = [
            { content: { contains: search } },
            { user: { fullName: { contains: search } } },
            { user: { username: { contains: search } } },
            { product: { name: { contains: search } } },
        ];
    }
    if (status === "answered") where.replies = { some: {} };
    if (status === "unanswered") where.replies = { none: {} };

    const rows = await prisma.productQuestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            product: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true, username: true } },
            replies: { orderBy: { createdAt: "asc" }, take: 1 },
        },
    });

    const list = rows.map(q => ({
        id: q.id,
        product: { id: q.product.id, name: q.product.name },
        user: { id: q.user.id, name: q.user.fullName || q.user.username },
        content: q.content,
        createdAt: q.createdAt,
        replied: q.replies.length > 0,
        reply: q.replies[0] ? { id: q.replies[0].id, content: q.replies[0].content, createdAt: q.replies[0].createdAt } : null,
    }));

    return res.json(list);
};

// POST /admin/api/qa/questions/:id/answer  (admin trả lời)
export const adminAnswerQuestionAPI = async (req: Request, res: Response) => {
    const auth: any = (req as any).user;
    if (!auth) return res.status(401).json({ error: "Unauthenticated" });
    if (auth?.role?.name?.toLowerCase() !== "admin") return res.status(403).json({ error: "Forbidden" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalid" });

    const content = String((req.body?.content || "")).trim();
    if (!content) return res.status(400).json({ error: "Nội dung trả lời trống" });

    // chặn trả lời 2 lần
    const exist = await prisma.productQuestionReply.findFirst({ where: { questionId: id } });
    if (exist) return res.status(409).json({ error: "Câu hỏi đã được trả lời" });

    // lấy question để biết productId & userId
    const q = await prisma.productQuestion.findUnique({ where: { id }, select: { productId: true, userId: true } });
    if (!q) return res.status(404).json({ error: "Không tìm thấy câu hỏi" });

    const reply = await prisma.productQuestionReply.create({
        data: {
            questionId: id,
            role: "ADMIN",
            userId: auth.id, // optional
            content,
        },
    });

    // thông báo realtime
    qaSocket.notifyQAAnswered({
        questionId: id,
        productId: q.productId,
        contentPreview: content.slice(0, 100),
        at: new Date().toISOString(),
        userId: q.userId || undefined,
    });

    return res.json({ success: true, reply });
};
