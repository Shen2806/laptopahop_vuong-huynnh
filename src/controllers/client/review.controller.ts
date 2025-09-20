// controllers/client/review.controller.ts
import { prisma } from "config/client";
import { Request, Response } from "express";

export const getProductReviewSummary = async (req: Request, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product id" });

    const [count, agg] = await Promise.all([
        prisma.review.count({ where: { productId } }),
        prisma.review.aggregate({ _avg: { rating: true }, where: { productId } }),
    ]);

    res.json({
        count,
        avg: Number(agg._avg.rating || 0),
    });
};

export const getProductReviews = async (req: Request, res: Response) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product id" });

    const list = await prisma.review.findMany({
        where: { productId },
        orderBy: { id: "desc" }, // tin mới lên trước
        include: { user: { select: { id: true, fullName: true, username: true } } },
    });

    const payload = list.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: { id: r.userId, name: r.user?.fullName || r.user?.username || `User#${r.userId}` },
    }));

    res.json(payload);
};

export const postCreateReview = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Bạn cần đăng nhập." });

    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "Mã sản phẩm không hợp lệ" });

    const r = Math.max(1, Math.min(5, Number(req.body?.rating)));
    const comment = (req.body?.comment || "").toString();

    try {
        // chặn nếu đã có review
        const existed = await prisma.review.findFirst({
            where: { productId, userId: user.id },
            select: { id: true },
        });
        if (existed) {
            return res.status(409).json({ ok: false, code: "ALREADY_REVIEWED", message: "Bạn đã đánh giá sản phẩm này." });
        }

        const created = await prisma.review.create({
            data: { productId, userId: user.id, rating: r, comment },
        });

        const [count, agg] = await Promise.all([
            prisma.review.count({ where: { productId } }),
            prisma.review.aggregate({ _avg: { rating: true }, where: { productId } }),
        ]);

        return res.json({
            ok: true,
            review: {
                id: created.id,
                rating: created.rating,
                comment: created.comment,
                createdAt: created.createdAt,
                user: { id: user.id, name: user.fullName || user.username },
            },
            summary: { count, avg: Number(agg._avg.rating || 0) },
        });
    } catch (e: any) {
        // nếu có unique constraint ở DB
        if (e?.code === "P2002") {
            return res.status(409).json({ ok: false, code: "ALREADY_REVIEWED", message: "Bạn đã đánh giá sản phẩm này." });
        }
        console.error("postCreateReview error:", e);
        return res.status(500).json({ ok: false, message: "Lỗi hệ thống" });
    }
};
