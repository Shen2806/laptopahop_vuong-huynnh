import { prisma } from "config/client";
// import { TOTAL_ITEM_PER_PAGE } from "config/constant"; // (nếu không dùng thì có thể xoá)

/* =========================
   Helpers / constants
========================= */

const COUPON_THRESHOLD = 25_000_000;

const unitAfterDiscount = (price: number, discountPct: number) => {
    const p = Number(price) || 0;
    const d = Math.max(0, Number(discountPct) || 0);
    return d > 0 ? Math.round(p * (100 - d) / 100) : p;
};

const fmtInt = (n: any) => Number(n) || 0;

/* =========================
   Product queries
========================= */

const getProducts = async (page: number, pageSize: number) => {
    const skip = (page - 1) * pageSize;
    return prisma.product.findMany({ skip, take: pageSize });
};

const getProductById = async (id: number) => {
    return prisma.product.findUnique({ where: { id } });
};

/* =========================
   Cart services
========================= */

const addProductToCart = async (quantity: number, productId: number, user: Express.User) => {
    const qty = Math.max(1, fmtInt(quantity));
    const pid = fmtInt(productId);

    // Lấy product và check tồn tại
    const product = await prisma.product.findUnique({
        where: { id: pid },
        select: { id: true, price: true, quantity: true },
    });
    if (!product) throw new Error("Sản phẩm không tồn tại.");
    if (fmtInt(product.quantity) < qty) throw new Error("Số lượng vượt quá tồn kho.");

    // Lấy/ tạo cart
    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });

    if (cart) {
        // Tăng tổng số lượng
        await prisma.cart.update({
            where: { id: cart.id },
            data: { sum: { increment: qty } },
        });

        // Upsert cartDetail
        const currentCartDetail = await prisma.cartDetail.findFirst({
            where: { productId: pid, cartId: cart.id },
        });

        await prisma.cartDetail.upsert({
            where: { id: currentCartDetail?.id ?? 0 },
            update: { quantity: { increment: qty } },
            create: {
                price: product.price,
                quantity: qty,
                productId: pid,
                cartId: cart.id,
            },
        });
    } else {
        // Tạo cart + 1 dòng cartDetail
        await prisma.cart.create({
            data: {
                sum: qty,
                userId: user.id,
                cartDetails: {
                    create: [
                        {
                            price: product.price,
                            quantity: qty,
                            productId: pid,
                        },
                    ],
                },
            },
        });
    }
};

const getProductInCart = async (userId: number) => {
    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) return [];
    return prisma.cartDetail.findMany({
        where: { cartId: cart.id },
        include: { product: true },
    });
};

const DeleteProductInCart = async (cartDetailId: number, userId: number, sumCart: number) => {
    const row = await prisma.cartDetail.findUnique({ where: { id: cartDetailId } });
    if (!row) throw new Error(`CartDetail with id ${cartDetailId} does not exist`);

    const qty = fmtInt(row.quantity);

    // Xoá chi tiết
    await prisma.cartDetail.delete({ where: { id: cartDetailId } });

    if (sumCart === 1) {
        await prisma.cart.delete({ where: { userId } });
    } else {
        await prisma.cart.update({
            where: { userId },
            data: { sum: { decrement: qty } },
        });
    }
};

const updateCartDetailBeforeCheckOut = async (
    data: Array<{ id: any; quantity: any }>,
    cartId: number
) => {
    const sanitized = data
        .map(d => ({ id: fmtInt(d.id), quantity: Math.max(1, fmtInt(d.quantity)) }))
        .filter(d => Number.isFinite(d.id) && Number.isFinite(d.quantity));

    if (sanitized.length === 0) return;

    await prisma.$transaction(async (tx) => {
        const validRows = await tx.cartDetail.findMany({
            where: { cartId, id: { in: sanitized.map(s => s.id) } },
            select: { id: true },
        });
        const validIds = new Set(validRows.map(r => r.id));

        for (const { id, quantity } of sanitized) {
            if (!validIds.has(id)) continue;
            await tx.cartDetail.update({ where: { id }, data: { quantity } });
        }

        // ✅ Tính lại tổng sum từ toàn bộ cartDetails (tránh sai khi chỉ cập nhật 1 phần)
        const agg = await tx.cartDetail.aggregate({
            where: { cartId },
            _sum: { quantity: true },
        });
        const newSum = fmtInt(agg._sum.quantity);

        await tx.cart.update({ where: { id: cartId }, data: { sum: newSum } });
    });
};

// ---------- Helpers phí ship (nhúng ngay trong file này để không phải import) ----------
type RegionKey = 'HN_INNER' | 'HCM_INNER' | 'NEAR' | 'FAR';
const HN_PROVINCE = 1;
const HCM_PROVINCE = 79;
// Nếu bạn có danh sách quận nội thành thật, điền vào Set; nếu chưa có thì để rỗng → sẽ rơi về NEAR/FAR
const HN_INNER_DIST = new Set<number>([]);
const HCM_INNER_DIST = new Set<number>([]);

const SHIPPING_RULES: Record<RegionKey, { base: number; codSurcharge?: number }> = {
    HN_INNER: { base: 15000, codSurcharge: 0 },
    HCM_INNER: { base: 15000, codSurcharge: 0 },
    NEAR: { base: 25000, codSurcharge: 5000 },
    FAR: { base: 35000, codSurcharge: 5000 },
};

function classifyRegion(provinceCode?: number | null, districtCode?: number | null): RegionKey {
    if (provinceCode === HN_PROVINCE && districtCode && HN_INNER_DIST.has(districtCode)) return 'HN_INNER';
    if (provinceCode === HCM_PROVINCE && districtCode && HCM_INNER_DIST.has(districtCode)) return 'HCM_INNER';
    // chưa có map đầy đủ → tạm coi là NEAR
    return 'NEAR';
}

function calcShippingFee(paymentMethod: 'COD' | 'ONLINE', provinceCode?: number | null, districtCode?: number | null) {
    const region = classifyRegion(provinceCode, districtCode);
    const rule = SHIPPING_RULES[region];
    const fee = rule.base + (paymentMethod === 'COD' ? (rule.codSurcharge ?? 0) : 0);
    return fee;
}

// ---------- Types ----------
type PlaceOrderArgs = {
    userId: number;
    receiverName: string;
    receiverAddress: string;
    receiverPhone: string;
    receiverNote?: string;
    couponCode?: string | null;

    // Mở rộng cho buy-mode
    mode?: "cart" | "buy";
    items?: Array<{ productId: number; quantity: number }>;

    // NEW: để tính ship chính xác
    paymentMethod?: "COD" | "ONLINE";
    receiverProvinceCode?: number | null;
    receiverDistrictCode?: number | null;
    receiverWardCode?: number | null;
    receiverStreet?: string | null;
};

type PlaceOrderResult = {
    success: boolean;
    orderId?: number;
    totalPrice?: number;
    error?: string;

    // optional trả thêm cho tiện debug
    shippingFee?: number;
    shippingDiscount?: number;
    discountAmount?: number;
};

// ---------- Core ----------
async function handlePlaceOrder(args: PlaceOrderArgs): Promise<PlaceOrderResult> {
    const {
        userId,
        receiverName,
        receiverAddress,
        receiverPhone,
        receiverNote,
        couponCode,
        mode = "cart",
        items = [],

        paymentMethod = "COD",
        receiverProvinceCode = null,
        receiverDistrictCode = null,
        receiverWardCode = null,
        receiverStreet = null,
    } = args;

    const pm: "COD" | "ONLINE" = (paymentMethod === "ONLINE") ? "ONLINE" : "COD";

    // ========= BUY MODE =========
    if (mode === "buy") {
        if (!items.length) return { success: false, error: "Thiếu dữ liệu sản phẩm mua ngay." };

        const pids = Array.from(new Set(items.map(i => fmtInt(i.productId)))).filter(Boolean);
        const products = await prisma.product.findMany({
            where: { id: { in: pids } },
            select: { id: true, name: true, price: true, discount: true, quantity: true },
        });
        const map = new Map(products.map(p => [p.id, p]));

        // Tính base để áp mã (pre-check cho UX sớm; chống race nằm ở transaction)
        let base = 0;
        for (const it of items) {
            const pid = fmtInt(it.productId);
            const qty = Math.max(1, fmtInt(it.quantity));
            const p = map.get(pid);
            if (!p) return { success: false, error: `Sản phẩm #${pid} không tồn tại.` };
            if (fmtInt(p.quantity) < qty) return { success: false, error: `Sản phẩm "${p.name}" không đủ tồn kho.` };
            base += unitAfterDiscount(p.price, p.discount || 0) * qty;
        }

        // Phí ship
        const shippingFee = calcShippingFee(pm, receiverProvinceCode, receiverDistrictCode);

        // Coupon
        let appliedCode: string | null = null;
        let discountAmount = 0;
        let shippingDiscount = 0;

        if (couponCode) {
            const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
            const valid = coupon && (!!coupon.isActive) && coupon.expiryDate >= new Date();
            if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };

            if (coupon.freeShip) {
                if ((coupon.minOrder ?? 0) > base) {
                    return { success: false, error: "Đơn chưa đạt ngưỡng áp mã freeship." };
                }
                const cap = coupon.shipDiscountCap ?? shippingFee;
                shippingDiscount = Math.min(shippingFee, cap);
                appliedCode = coupon.code;
            } else {
                if (base < COUPON_THRESHOLD) return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
                discountAmount = Math.round(base * Number(coupon!.discount) / 100);
                appliedCode = coupon!.code;
            }
        }

        const finalTotal = Math.max(0, base - discountAmount + shippingFee - shippingDiscount);

        // Transaction: tạo order + details + TRỪ KHO có điều kiện (anti-oversell)
        try {
            const created = await prisma.$transaction(async (tx) => {
                const order = await tx.order.create({
                    data: {
                        userId,
                        totalPrice: finalTotal,
                        discountAmount,
                        couponCode: appliedCode,

                        shippingFee,
                        shippingDiscount,

                        receiverAddress,
                        receiverName,
                        receiverPhone,
                        receiverNote: receiverNote || "",

                        receiverProvinceCode,
                        receiverDistrictCode,
                        receiverWardCode,
                        receiverStreet,

                        status: "PENDING",
                        paymentMethod: "COD",
                        paymentStatus: "UNPAID",
                    },
                });

                for (const it of items) {
                    const pid = fmtInt(it.productId);
                    const qty = Math.max(1, fmtInt(it.quantity));
                    const p = map.get(pid)!;
                    const priceUnit = unitAfterDiscount(p.price, p.discount || 0);

                    // 🔒 Anti-oversell: chỉ trừ khi còn đủ tồn
                    const updated = await tx.product.updateMany({
                        where: { id: pid, quantity: { gte: qty } },
                        data: { quantity: { decrement: qty } },
                    });
                    if (updated.count !== 1) {
                        // Lỗi do có người khác vừa mua mất tồn
                        throw new Error(`Sản phẩm "${p.name}" không đủ tồn kho.`);
                    }

                    await tx.orderDetail.create({
                        data: { orderId: order.id, productId: pid, price: priceUnit, quantity: qty },
                    });
                }

                return order;
            });

            return {
                success: true,
                orderId: created.id,
                totalPrice: finalTotal,
                discountAmount,
                shippingFee,
                shippingDiscount,
            };
        } catch (e: any) {
            // 👉 Trả lỗi thân thiện cho controller hiển thị
            const msg = typeof e?.message === "string" && e.message.includes("không đủ tồn kho")
                ? e.message
                : "Hệ thống đang bận, vui lòng thử lại.";
            return { success: false, error: msg };
        }
    }

    // ========= CART MODE =========
    const cart = await prisma.cart.findFirst({
        where: { userId, cartDetails: { some: {} } },
        orderBy: { id: 'desc' },
        select: { id: true },
    });
    if (!cart) return { success: false, error: "Giỏ hàng trống." };

    const cartDetails = await prisma.cartDetail.findMany({
        where: { cartId: cart.id, quantity: { gt: 0 } },
        include: { product: true },
    });
    if (cartDetails.length === 0) return { success: false, error: "Giỏ hàng trống." };

    // base sau KM
    let base = 0;
    for (const cd of cartDetails) {
        const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);
        base += unit * fmtInt(cd.quantity);
    }

    const shippingFee = calcShippingFee(pm, receiverProvinceCode, receiverDistrictCode);

    let appliedCode: string | null = null;
    let discountAmount = 0;
    let shippingDiscount = 0;

    if (couponCode) {
        const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
        const valid = coupon && (!!coupon.isActive) && coupon.expiryDate >= new Date();
        if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };

        if (coupon.freeShip) {
            if ((coupon.minOrder ?? 0) > base) {
                return { success: false, error: "Đơn chưa đạt ngưỡng áp mã freeship." };
            }
            const cap = coupon.shipDiscountCap ?? shippingFee;
            shippingDiscount = Math.min(shippingFee, cap);
            appliedCode = coupon.code;
        } else {
            if (base < COUPON_THRESHOLD) return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
            discountAmount = Math.round(base * Number(coupon!.discount) / 100);
            appliedCode = coupon!.code;
        }
    }

    const finalTotal = Math.max(0, base - discountAmount + shippingFee - shippingDiscount);

    try {
        const order = await prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    userId,
                    totalPrice: finalTotal,
                    discountAmount,
                    couponCode: appliedCode,

                    shippingFee,
                    shippingDiscount,

                    receiverAddress,
                    receiverName,
                    receiverPhone,
                    receiverNote: receiverNote || "",

                    receiverProvinceCode,
                    receiverDistrictCode,
                    receiverWardCode,
                    receiverStreet,

                    status: "PENDING",
                    paymentMethod: "COD",
                    paymentStatus: "UNPAID",
                },
            });

            // Lần lượt trừ kho có điều kiện – fail cái nào rollback toàn bộ
            for (const cd of cartDetails) {
                const qty = fmtInt(cd.quantity);
                const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);

                const updated = await tx.product.updateMany({
                    where: { id: cd.productId, quantity: { gte: qty } },
                    data: { quantity: { decrement: qty } },
                });
                if (updated.count !== 1) {
                    throw new Error(`Sản phẩm "${cd.product.name}" không đủ tồn kho.`);
                }

                await tx.orderDetail.create({
                    data: { orderId: created.id, productId: cd.productId, price: unit, quantity: qty },
                });
            }

            await tx.cartDetail.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.update({ where: { id: cart.id }, data: { sum: 0 } });

            return created;
        });

        return {
            success: true,
            orderId: order.id,
            totalPrice: finalTotal,
            discountAmount,
            shippingFee,
            shippingDiscount,
        };
    } catch (e: any) {
        const msg = typeof e?.message === "string" && e.message.includes("không đủ tồn kho")
            ? e.message
            : "Hệ thống đang bận, vui lòng thử lại.";
        return { success: false, error: msg };
    }
}


/* =========================
   Misc queries
========================= */

const countTotalProductClientPages = async (pageSize: number) => {
    const totalItems = await prisma.product.count();
    return Math.ceil(totalItems / pageSize);
};

const getOrderHistory = async (userId: number) => {
    return prisma.order.findMany({
        where: { userId },
        include: {
            orderDetails: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
    });
};

export {
    getProducts,
    getProductById,
    addProductToCart,
    getProductInCart,
    DeleteProductInCart,
    updateCartDetailBeforeCheckOut,
    handlePlaceOrder,
    getOrderHistory,
    countTotalProductClientPages,
};
