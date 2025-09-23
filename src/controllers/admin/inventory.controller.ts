import { Request, Response } from "express";
import { prisma } from "config/client";
import { getIO } from "src/socket";

const DEFAULT_REORDER_LEVEL = 10;

// Trang Inventory
export async function adminInventoryPage(_req: Request, res: Response) {
    return res.render("admin/inventory/index");
}

// GET /admin/api/inventory?search=&filter=all|low|oos
export async function adminInventoryListAPI(req: Request, res: Response) {
    const search = String(req.query.search || "").trim();
    const filter = String(req.query.filter || "all");

    const where: any = {};
    if (search) where.name = { contains: search };

    // chỉ lấy cột an toàn (schema cũ)
    const rows = await prisma.product.findMany({
        where,
        select: { id: true, name: true, quantity: true, price: true },
        orderBy: { id: "asc" },
    });

    // Nếu schema đã có cột reorderLevel, FE có thể set qua API /reorder
    // Ở API list này ta dùng mặc định 5 để tránh phụ thuộc schema.
    const list = rows.map((p) => {
        const onHand = Number(p.quantity) || 0;
        const reorderLevel = DEFAULT_REORDER_LEVEL;
        let status: "OK" | "LOW" | "OOS" = "OK";
        if (onHand <= 0) status = "OOS";
        else if (reorderLevel > 0 && onHand <= reorderLevel) status = "LOW";

        return {
            id: p.id,
            name: p.name,
            onHand,
            reserved: 0,
            available: onHand,
            reorderLevel,
            status,
            price: p.price,
        };
    });

    const filtered = list.filter((row) => {
        if (filter === "low") return row.status === "LOW";
        if (filter === "oos") return row.status === "OOS";
        return true;
    });

    return res.json(filtered);
}

// POST /admin/api/inventory/adjust { productId, qty, type, note }
export async function adminInventoryAdjustAPI(req: any, res: Response) {
    if (req.user?.role?.name !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

    const productId = Number(req.body?.productId);
    const qtyRaw = Number(req.body?.qty);
    const type = String(req.body?.type || "ADJUST"); // IN | OUT | ADJUST
    const note = String(req.body?.note || "").slice(0, 255);

    if (!Number.isFinite(productId) || !Number.isFinite(qtyRaw) || !qtyRaw) {
        return res.status(400).json({ error: "Invalid payload" });
    }

    // chuẩn hoá delta theo type
    let delta = qtyRaw;
    if (type === "IN") delta = Math.abs(qtyRaw);
    else if (type === "OUT") delta = -Math.abs(qtyRaw);

    try {
        await prisma.$transaction(async (tx) => {
            const p = await tx.product.findUnique({
                where: { id: productId },
                select: { id: true, name: true, quantity: true },
            });
            if (!p) throw new Error("Product not found");

            const newQty = Number(p.quantity) + delta;
            if (newQty < 0) throw new Error("Xuất vượt tồn");

            await tx.product.update({ where: { id: productId }, data: { quantity: newQty } });

            // (tuỳ chọn) ghi sổ nếu bạn đã có bảng StockMovement
            // const hasStock = (await tx.$queryRawUnsafe<any[]>(`SHOW TABLES LIKE 'StockMovement'`)).length > 0
            // if (hasStock) { ... }

            // cảnh báo low/oos (dùng DEFAULT_REORDER_LEVEL)
            const rl = DEFAULT_REORDER_LEVEL;
            const was = p.quantity <= 0 ? "OOS" : (p.quantity <= rl ? "LOW" : "OK");
            const now = newQty <= 0 ? "OOS" : (newQty <= rl ? "LOW" : "OK");

            if ((was === "OK" && (now === "LOW" || now === "OOS")) || (was === "LOW" && now === "OOS")) {
                const io = getIO();
                const payload = {
                    productId,
                    name: p.name,
                    quantity: newQty,
                    reorderLevel: rl,
                    status: now as "LOW" | "OOS",
                    at: new Date().toISOString(),
                    reason: "ADJUST",
                };
                io.to("admins").emit("inventory:low", payload);
                io.to("admins").emit("inventory:low_stock", payload); // tương thích tên cũ
            }
        });

        return res.json({ ok: true });
    } catch (e: any) {
        return res.status(400).json({ error: e?.message || "Adjust failed" });
    }
}

// POST /admin/api/inventory/reorder { productId, level }
export async function adminInventorySetReorderAPI(req: any, res: Response) {
    if (req.user?.role?.name !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

    const productId = Number(req.body?.productId);
    const level = Math.max(0, Number(req.body?.level) || 0);

    try {
        // chỉ chạy được khi schema đã có column reorderLevel
        await (prisma as any).product.update({ where: { id: productId }, data: { reorderLevel: level } });
        return res.json({ ok: true, productId, level });
    } catch {
        // FE sẽ hiện modal + toast “cần migrate”
        return res.status(400).json({ error: "Schema chưa hỗ trợ reorderLevel (cần migrate DB trước)." });
    }
}
