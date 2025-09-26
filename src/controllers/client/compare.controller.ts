import { Request, Response } from "express";
import { prisma } from "config/client";

export const getComparePage = async (req: Request, res: Response) => {
    try {
        const idsRaw = String(req.query.ids || "").trim();
        const ids: number[] = [];
        if (idsRaw.length > 0) {
            const parts = idsRaw.split(",");
            let i = 0;
            for (i = 0; i < parts.length; i++) {
                const n = Number(parts[i]);
                if (Number.isInteger(n) && n > 0) {
                    if (ids.indexOf(n) === -1) ids.push(n);
                }
            }
        }

        if (ids.length === 0) {
            return res.render("product/compare.ejs", { products: [], ids: [] });
        }

        // tối đa 4 để bảng gọn
        const idsLimited = ids.slice(0, 4);

        const products = await prisma.product.findMany({
            where: { id: { in: idsLimited } },
            select: {
                id: true, name: true, image: true, price: true, discount: true, shortDesc: true,
                factory: true, target: true, cpu: true, ramGB: true, storageGB: true, storageType: true,
                screenSizeInch: true, screenResolution: true, featureTags: true, quantity: true
            }
        });

        // giữ thứ tự theo ids
        const map = new Map<number, any>();
        products.forEach((p) => map.set(p.id, p));
        const ordered: any[] = [];
        let j = 0;
        for (j = 0; j < idsLimited.length; j++) {
            const it = map.get(idsLimited[j]);
            if (it) ordered.push(it);
        }

        return res.render("product/compare.ejs", { products: ordered, ids: idsLimited });
    } catch (e) {
        console.error("getComparePage error:", e);
        return res.render("product/compare.ejs", { products: [], ids: [] });
    }
};
