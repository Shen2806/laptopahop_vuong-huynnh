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

/* =========================
   Place Order (cart-mode / buy-mode)
========================= */

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
};

type PlaceOrderResult = {
    success: boolean;
    orderId?: number;
    totalPrice?: number;
    error?: string;
};

// async function handlePlaceOrder(args: PlaceOrderArgs): Promise<PlaceOrderResult> {
//     const {
//         userId,
//         receiverName,
//         receiverAddress,
//         receiverPhone,
//         receiverNote,
//         couponCode,
//         mode = "cart",
//         items = [],
//     } = args;

//     // ==== BUY MODE: đặt đơn từ "items", không đụng giỏ ====
//     if (mode === "buy") {
//         if (!items.length) return { success: false, error: "Thiếu dữ liệu sản phẩm mua ngay." };

//         // Lấy sản phẩm & tính toán
//         const pids = Array.from(new Set(items.map(i => fmtInt(i.productId)))).filter(Boolean);
//         const products = await prisma.product.findMany({
//             where: { id: { in: pids } },
//             select: { id: true, name: true, price: true, discount: true, quantity: true },
//         });
//         const map = new Map(products.map(p => [p.id, p]));

//         // Validate & tính base
//         let base = 0;
//         for (const it of items) {
//             const pid = fmtInt(it.productId);
//             const qty = Math.max(1, fmtInt(it.quantity));
//             const p = map.get(pid);
//             if (!p) return { success: false, error: `Sản phẩm #${pid} không tồn tại.` };
//             if (fmtInt(p.quantity) < qty) return { success: false, error: `Sản phẩm "${p.name}" không đủ tồn kho.` };
//             base += unitAfterDiscount(p.price, p.discount || 0) * qty;
//         }

//         // Áp mã coupon (nếu có) + ngưỡng
//         let appliedCode: string | null = null;
//         let discountAmount = 0;
//         if (couponCode) {
//             const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
//             const valid = coupon && coupon.expiryDate >= new Date();
//             if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };
//             if (base < COUPON_THRESHOLD) {
//                 return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
//             }
//             discountAmount = Math.round(base * Number(coupon!.discount) / 100);
//             appliedCode = coupon!.code;
//         }

//         const finalTotal = Math.max(0, base - discountAmount);

//         // Transaction: tạo order + orderDetails + trừ kho (KHÔNG động vào giỏ)
//         const created = await prisma.$transaction(async (tx) => {
//             const order = await tx.order.create({
//                 data: {
//                     userId,
//                     totalPrice: finalTotal,
//                     discountAmount,
//                     couponCode: appliedCode,

//                     receiverAddress,
//                     receiverName,
//                     receiverPhone,
//                     receiverNote: receiverNote || "",

//                     status: "PENDING",
//                     paymentMethod: "COD",
//                     paymentStatus: "UNPAID",
//                 },
//             });

//             // Tạo orderDetails + trừ kho
//             for (const it of items) {
//                 const pid = fmtInt(it.productId);
//                 const qty = Math.max(1, fmtInt(it.quantity));
//                 const p = map.get(pid)!;

//                 const priceUnit = unitAfterDiscount(p.price, p.discount || 0);

//                 // Kiểm tra tồn kho lần nữa trong transaction
//                 const fresh = await tx.product.findUnique({
//                     where: { id: pid },
//                     select: { quantity: true },
//                 });
//                 if (!fresh || fmtInt(fresh.quantity) < qty) {
//                     throw new Error(`Sản phẩm "${p.name}" không đủ tồn kho.`);
//                 }

//                 await tx.orderDetail.create({
//                     data: {
//                         orderId: order.id,
//                         productId: pid,
//                         price: priceUnit,
//                         quantity: qty,
//                     },
//                 });

//                 await tx.product.update({
//                     where: { id: pid },
//                     data: { quantity: { decrement: qty } },
//                 });
//             }

//             return order;
//         });

//         return { success: true, orderId: created.id, totalPrice: finalTotal };
//     }

//     // ==== CART MODE: đặt đơn từ giỏ hàng ====
//     const cart = await prisma.cart.findFirst({
//         where: { userId },
//         select: { id: true },
//     });
//     if (!cart) return { success: false, error: "Giỏ hàng trống." };

//     const cartDetails = await prisma.cartDetail.findMany({
//         where: { cartId: cart.id },
//         include: { product: true },
//     });
//     if (cartDetails.length === 0) return { success: false, error: "Giỏ hàng trống." };

//     // Tính base (sau KM từng SP)
//     let base = 0;
//     for (const cd of cartDetails) {
//         const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);
//         base += unit * fmtInt(cd.quantity);
//     }

//     // Áp coupon (nếu có) + ngưỡng
//     let appliedCode: string | null = null;
//     let discountAmount = 0;
//     if (couponCode) {
//         const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
//         const valid = coupon && coupon.expiryDate >= new Date();
//         if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };
//         if (base < COUPON_THRESHOLD) {
//             return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
//         }
//         discountAmount = Math.round(base * Number(coupon!.discount) / 100);
//         appliedCode = coupon!.code;
//     }

//     const finalTotal = Math.max(0, base - discountAmount);

//     // Transaction: tạo order + orderDetails + trừ kho + clear cart
//     const order = await prisma.$transaction(async (tx) => {
//         // Kiểm tra tồn kho cho tất cả item
//         for (const cd of cartDetails) {
//             const fresh = await tx.product.findUnique({
//                 where: { id: cd.productId },
//                 select: { name: true, quantity: true },
//             });
//             if (!fresh || fmtInt(fresh.quantity) < fmtInt(cd.quantity)) {
//                 throw new Error(`Sản phẩm "${fresh?.name || cd.productId}" không đủ tồn kho.`);
//             }
//         }

//         const created = await tx.order.create({
//             data: {
//                 userId,
//                 totalPrice: finalTotal,
//                 discountAmount,
//                 couponCode: appliedCode,

//                 receiverAddress,
//                 receiverName,
//                 receiverPhone,
//                 receiverNote: receiverNote || "",

//                 status: "PENDING",
//                 paymentMethod: "COD",
//                 paymentStatus: "UNPAID",
//             },
//         });

//         for (const cd of cartDetails) {
//             const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);
//             const qty = fmtInt(cd.quantity);

//             await tx.orderDetail.create({
//                 data: {
//                     orderId: created.id,
//                     productId: cd.productId,
//                     price: unit,
//                     quantity: qty,
//                 },
//             });

//             await tx.product.update({
//                 where: { id: cd.productId },
//                 data: { quantity: { decrement: qty } },
//             });
//         }

//         await tx.cartDetail.deleteMany({ where: { cartId: cart.id } });
//         await tx.cart.update({ where: { id: cart.id }, data: { sum: 0 } });

//         return created;
//     });

//     return { success: true, orderId: order.id, totalPrice: finalTotal };
// }
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
    } = args;

    // =========================
    // ======= BUY MODE ========
    // =========================
    if (mode === "buy") {
        if (!items.length) return { success: false, error: "Thiếu dữ liệu sản phẩm mua ngay." };

        // Lấy sản phẩm & build map
        const pids = Array.from(new Set(items.map(i => fmtInt(i.productId)))).filter(Boolean);
        const products = await prisma.product.findMany({
            where: { id: { in: pids } },
            select: { id: true, name: true, price: true, discount: true, quantity: true },
        });
        const map = new Map(products.map(p => [p.id, p]));

        // Validate & tính base
        let base = 0;
        for (const it of items) {
            const pid = fmtInt(it.productId);
            const qty = Math.max(1, fmtInt(it.quantity));
            const p = map.get(pid);
            if (!p) return { success: false, error: `Sản phẩm #${pid} không tồn tại.` };
            if (fmtInt(p.quantity) < qty) return { success: false, error: `Sản phẩm "${p.name}" không đủ tồn kho.` };
            base += unitAfterDiscount(p.price, p.discount || 0) * qty;
        }

        // Coupon (nếu có) + ngưỡng
        let appliedCode: string | null = null;
        let discountAmount = 0;
        if (couponCode) {
            const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
            const valid = coupon && coupon.expiryDate >= new Date();
            if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };
            if (base < COUPON_THRESHOLD) return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
            discountAmount = Math.round(base * Number(coupon!.discount) / 100);
            appliedCode = coupon!.code;
        }

        const finalTotal = Math.max(0, base - discountAmount);

        // Transaction: tạo order + orderDetails + trừ kho
        const created = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    userId,
                    totalPrice: finalTotal,
                    discountAmount,
                    couponCode: appliedCode,

                    receiverAddress,
                    receiverName,
                    receiverPhone,
                    receiverNote: receiverNote || "",

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

                // Check tồn kho lại trong transaction
                const fresh = await tx.product.findUnique({
                    where: { id: pid },
                    select: { name: true, quantity: true },
                });
                if (!fresh || fmtInt(fresh.quantity) < qty) {
                    throw new Error(`Sản phẩm "${fresh?.name || p.name}" không đủ tồn kho.`);
                }

                await tx.orderDetail.create({
                    data: { orderId: order.id, productId: pid, price: priceUnit, quantity: qty },
                });

                await tx.product.update({
                    where: { id: pid },
                    data: { quantity: { decrement: qty } },
                });
            }

            return order;
        });

        return { success: true, orderId: created.id, totalPrice: finalTotal };
    }

    // =========================
    // ======= CART MODE =======
    // =========================
    const cart = await prisma.cart.findFirst({
        where: { userId },
        select: { id: true },
    });
    if (!cart) return { success: false, error: "Giỏ hàng trống." };

    const cartDetails = await prisma.cartDetail.findMany({
        where: { cartId: cart.id },
        include: { product: true },
    });
    if (cartDetails.length === 0) return { success: false, error: "Giỏ hàng trống." };

    // base sau KM từng SP
    let base = 0;
    for (const cd of cartDetails) {
        const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);
        base += unit * fmtInt(cd.quantity);
    }

    // Coupon (nếu có)
    let appliedCode: string | null = null;
    let discountAmount = 0;
    if (couponCode) {
        const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
        const valid = coupon && coupon.expiryDate >= new Date();
        if (!valid) return { success: false, error: "Mã giảm giá không hợp lệ hoặc đã hết hạn." };
        if (base < COUPON_THRESHOLD) return { success: false, error: "Đơn chưa đạt ngưỡng áp mã giảm giá." };
        discountAmount = Math.round(base * Number(coupon!.discount) / 100);
        appliedCode = coupon!.code;
    }

    const finalTotal = Math.max(0, base - discountAmount);

    // Transaction: tạo order + trừ kho + clear cart
    const order = await prisma.$transaction(async (tx) => {
        // Check tồn kho tất cả item
        for (const cd of cartDetails) {
            const fresh = await tx.product.findUnique({
                where: { id: cd.productId },
                select: { name: true, quantity: true },
            });
            if (!fresh || fmtInt(fresh.quantity) < fmtInt(cd.quantity)) {
                throw new Error(`Sản phẩm "${fresh?.name || cd.productId}" không đủ tồn kho.`);
            }
        }

        const created = await tx.order.create({
            data: {
                userId,
                totalPrice: finalTotal,
                discountAmount,
                couponCode: appliedCode,

                receiverAddress,
                receiverName,
                receiverPhone,
                receiverNote: receiverNote || "",

                status: "PENDING",
                paymentMethod: "COD",
                paymentStatus: "UNPAID",
            },
        });

        for (const cd of cartDetails) {
            const unit = unitAfterDiscount(cd.product.price, cd.product.discount || 0);
            const qty = fmtInt(cd.quantity);

            await tx.orderDetail.create({
                data: { orderId: created.id, productId: cd.productId, price: unit, quantity: qty },
            });

            await tx.product.update({
                where: { id: cd.productId },
                data: { quantity: { decrement: qty } },
            });
        }

        await tx.cartDetail.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { sum: 0 } });

        return created;
    });

    return { success: true, orderId: order.id, totalPrice: finalTotal };
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
