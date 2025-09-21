import { prisma } from "config/client";

/** Lấy map { productId -> { avg, count } } cho 1 mảng productIds */
export async function getRatingMap(productIds: number[]) {
    const ids = Array.from(new Set(productIds)).filter(Number.isFinite);
    const result = new Map<number, { avg: number; count: number }>();
    if (!ids.length) return result;

    const rows = await prisma.review.groupBy({
        by: ["productId"],
        where: { productId: { in: ids } },
        _avg: { rating: true },
        _count: { rating: true },
    });

    for (const r of rows) {
        result.set(r.productId, {
            avg: Number(r._avg.rating ?? 0),
            count: r._count.rating,
        });
    }
    return result;
}

/** Gắn ratingAvg & ratingCount vào danh sách sản phẩm */
export function attachRatings<T extends { id: number }>(
    items: T[],
    ratingMap: Map<number, { avg: number; count: number }>
): (T & { ratingAvg: number; ratingCount: number })[] {
    return items.map((p) => ({
        ...p as any,
        ratingAvg: ratingMap.get(p.id)?.avg ?? 0,
        ratingCount: ratingMap.get(p.id)?.count ?? 0,
    }));
}
