import { Request, Response } from "express";
import { prisma } from "config/client";

/**
 * GỢI Ý NHANH (typeahead): /api/suggest?q=...
 * Trả về ~8 item (id, name, price, image) cho popup.
 * Lưu ý MySQL mặc định đã case-insensitive theo collation,
 * nên KHÔNG dùng { mode: "insensitive" } để tránh lỗi Prisma.
 */
export async function suggestProducts(req: Request, res: Response) {
    try {
        const q = String(req.query.q || "").trim();
        if (!q) return res.json([]);

        const items = await prisma.product.findMany({
            where: {
                OR: [
                    { name: { contains: q } },
                    { factory: { contains: q } },
                    { shortDesc: { contains: q } },
                ],
            },
            select: { id: true, name: true, price: true, image: true },
            orderBy: [{ sold: "desc" }, { id: "desc" }],
            take: 8,
        });

        res.json(items);
    } catch (err) {
        console.error("suggestProducts error:", err);
        res.status(500).json({ message: "server error" });
    }
}

/**
 * KẾT QUẢ SEARCH JSON: /api/search?q=...
 * Dùng nếu sau này bạn muốn trang kết quả riêng/SPA.
 */
export async function searchProductsJson(req: Request, res: Response) {
    try {
        const q = String(req.query.q || "").trim();
        if (!q) return res.json([]);

        const items = await prisma.product.findMany({
            where: {
                OR: [
                    { name: { contains: q } },
                    { factory: { contains: q } },
                    { shortDesc: { contains: q } },
                    { detailDesc: { contains: q } },
                ],
            },
            select: {
                id: true, name: true, price: true, discount: true,
                image: true, factory: true,
            },
            orderBy: [{ sold: "desc" }, { id: "desc" }],
            take: 30,
        });

        res.json(items);
    } catch (err) {
        console.error("searchProductsJson error:", err);
        res.status(500).json({ message: "server error" });
    }
}
