import { prisma } from "config/client";
import { Request, Response } from "express";
import { addProductToCart, DeleteProductInCart, getOrderHistory, getProductById, getProductInCart, handlePlaceOrder, updateCartDetailBeforeCheckOut } from "services/client/item.service";
import { getIO } from "src/socket";
import { $Enums } from "@prisma/client"; // thêm nếu chưa có
import { paymentGateway } from "services/paymentGateway";
// Nhãn tiếng Việt cho trạng thái
const STATUS_LABEL_VI: Record<string, string> = {
    PENDING: "Chờ xử lý",
    CONFIRMED: "Đã xác nhận đơn",
    SHIPPING: "Đang vận chuyển",
    OUT_FOR_DELIVERY: "Đang giao hàng",
    DELIVERED: "Đã giao hàng",
    CANCELED: "Đã hủy",
};

// Thứ tự các bước (không tính CANCELED)
const ORDER_STEPS: $Enums.OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "SHIPPING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELED"
];

const getProductPage = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.redirect("/products");

    // 1) Lấy sản phẩm chính
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
        return res.status(404).render("product/detail.ejs", {
            product: null,
            similarProducts: [],
        });
    }

    // 2) Tầm giá tương tự (±20%), làm tròn nghìn
    const round1000 = (n: number) => Math.max(0, Math.round(n / 1000) * 1000);
    const min = round1000(product.price * 0.8);
    const max = round1000(product.price * 1.2);

    // 3) Lấy ứng viên: cùng hãng + cùng tầm giá
    const [byFactoryRaw, byPriceRaw] = await prisma.$transaction([
        prisma.product.findMany({
            where: { factory: product.factory, id: { not: product.id } },
            orderBy: { id: "desc" },
            take: 16, // lấy dư rồi lọc 8 sp sau
        }),
        prisma.product.findMany({
            where: { id: { not: product.id }, price: { gte: min, lte: max } },
            orderBy: { price: "asc" },
            take: 16,
        }),
    ]);

    // 4) Gộp, khử trùng, ưu tiên cùng hãng rồi khoảng cách giá
    type P = typeof byFactoryRaw[number];
    const seen = new Set<number>();
    const joinTagged = (list: P[], tag: "factory" | "price") =>
        list.map((p) => ({ ...p, __tag: tag, __dist: Math.abs(p.price - product.price) }));

    const combined = [...joinTagged(byFactoryRaw, "factory"), ...joinTagged(byPriceRaw, "price")]
        .filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
        })
        .sort((a, b) => {
            // cùng hãng lên trước
            if (a.__tag !== b.__tag) return a.__tag === "factory" ? -1 : 1;
            // gần giá hơn lên trước
            if (a.__dist !== b.__dist) return a.__dist - b.__dist;
            // phụ: id mới trước
            return b.id - a.id;
        })
        .slice(0, 8)
        .map(({ __tag, __dist, ...rest }) => rest); // bỏ field phụ

    // 5) Rating cho danh sách tương tự
    const ids = combined.map((p) => p.id);
    type ReviewRow = { productId: number; rating: number };
    const reviews: ReviewRow[] = ids.length
        ? await prisma.review.findMany({
            where: { productId: { in: ids } },
            select: { productId: true, rating: true },
        })
        : [];

    const agg: Record<number, { sum: number; count: number }> = {};
    for (const r of reviews) {
        const k = r.productId;
        if (!agg[k]) agg[k] = { sum: 0, count: 0 };
        agg[k].sum += Number(r.rating) || 0;
        agg[k].count += 1;
    }

    const makeStars = (avg: number) => {
        const rounded = Math.round(avg * 2) / 2; // .5 step
        const full = Math.floor(rounded);
        const half = rounded - full === 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        const arr: Array<"full" | "half" | "empty"> = [];
        for (let i = 0; i < full; i++) arr.push("full");
        if (half) arr.push("half");
        for (let i = 0; i < empty; i++) arr.push("empty");
        return arr;
    };

    const similarProducts = combined.map((p: any) => {
        const a = agg[p.id];
        const count = a?.count ?? 0;
        const avg = count ? a!.sum / count : 0;
        return {
            ...p,
            ratingAvg: avg,
            ratingCount: count,
            starsArr: makeStars(avg),
        };
    });

    // 6) Render
    return res.render("product/detail.ejs", {
        product,
        similarProducts, // <<< thêm biến này
    });
};

const postAddProductToCart = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    if (user) {
        await addProductToCart(1, +id, user);
    } else {
        // not login
        return res.redirect("/login");
    }

    return res.redirect("/")
}

const getCartPage = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.redirect("/login");

    // Lấy cart từ DB
    const cart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: { cartDetails: { include: { product: true } } } // lấy luôn sản phẩm
    });
    const cartDetails = await getProductInCart(+user.id)
    const totalPrice = cartDetails?.map(item => +item.price * +item.quantity)?.reduce((a, b) => a + b, 0)
    const cartId = cartDetails.length ? cartDetails[0].cartId : 0
    return res.render("product/cart", {
        cart, cartDetails, totalPrice, cartId
    });
}

const postDeleteProductInCart = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    if (user) {
        await DeleteProductInCart(+id, user.id, user.sumCart);
    } else {
        return res.redirect("/login");
    }
    return res.redirect("/cart")
}

// GET /checkout
const getCheckOutPage = async (req: Request, res: Response) => {
    const user: any = (req as any).user;
    if (!user) return res.redirect("/login");

    const qMode = String(asStr((req.query as any).mode)).toLowerCase();
    let mode: "cart" | "buy";

    if (qMode === "cart") {
        mode = "cart";
        if ((req as any).session) (req as any).session.buyNow = undefined; // clear vé buy
    } else if (qMode === "buy") {
        mode = "buy";
    } else {
        mode = (req as any).session?.buyNow ? "buy" : "cart";
    }

    const unitAfterDiscount = (price: number, discount: number) =>
        discount > 0 ? Math.round(price * (100 - discount) / 100) : price;

    try {
        if (mode === "buy") {
            const ticket = (req as any).session?.buyNow;
            if (!ticket) return res.redirect("/checkout?mode=cart");

            const pid = asInt(ticket.productId);
            const qty = Math.max(1, asInt(ticket.quantity));
            const product = await prisma.product.findUnique({ where: { id: pid } });
            if (!product) {
                (req as any).session.buyNow = undefined;
                return res.redirect("/checkout?mode=cart");
            }

            const unit = unitAfterDiscount(product.price, product.discount || 0);
            const totalPrice = unit * qty;

            const cartDetails = [{ product, quantity: qty }];
            const coupons = await prisma.coupon.findMany({
                where: { isActive: true, expiryDate: { gte: new Date() } },
                orderBy: { expiryDate: "asc" },
            });

            // CHỈ SỬA Ở ĐÂY:
            return res.render("product/checkout.ejs", {
                mode: "buy",
                cartDetails,
                totalPrice,
                coupons,
                user,
            });
        }

        // CART MODE
        const cartId = await getActiveCartId(Number(user.id));
        let cartDetails: any[] = [];
        let totalPrice = 0;

        if (cartId) {
            const details = await prisma.cartDetail.findMany({
                where: { cartId, quantity: { gt: 0 } },
                include: { product: true },
            });
            cartDetails = details;
            totalPrice = details.reduce(
                (s, d) => s + unitAfterDiscount(d.product.price, d.product.discount || 0) * d.quantity,
                0
            );
        }

        const coupons = await prisma.coupon.findMany({
            where: { isActive: true, expiryDate: { gte: new Date() } },
            orderBy: { expiryDate: "asc" },
        });

        // VÀ SỬA Ở ĐÂY NỮA:
        return res.render("product/checkout.ejs", {
            mode: "cart",
            cartDetails,
            totalPrice,
            coupons,
            user,
        });
    } catch (e) {
        console.error("getCheckout error:", e);
        return res.redirect("/cart");
    }
};




const asStr = (v: any) =>
    v == null ? "" : (Array.isArray(v) ? String(v[v.length - 1] ?? "") : String(v));
const asInt = (v: any) => {
    const n = Number(Array.isArray(v) ? v[0] : v);
    return Number.isFinite(n) ? n : 0;
};

async function getActiveCartId(userId: number) {
    const c = await prisma.cart.findFirst({
        where: { userId, cartDetails: { some: {} } },
        orderBy: { id: "desc" },
        select: { id: true },
    });
    return c?.id ?? null;
}

const postHandleCartToCheckOut = async (req: Request, res: Response) => {
    const user: any = (req as any).user;
    if (!user) return res.redirect("/login");

    try {
        const cartIdFromBody = asInt(req.body.cartId);

        // Thu thập (id, qty) từ dạng mảng phẳng nếu có
        const idsFlat = (req.body["cartDetailIds[]"] ?? req.body.cartDetailIds) ?? [];
        const qtysFlat = (req.body["cartDetailQtys[]"] ?? req.body.cartDetailQtys) ?? [];

        const pairs: Array<{ id: number; qty: number }> = [];

        if (idsFlat.length || qtysFlat.length) {
            const idsArr = Array.isArray(idsFlat) ? idsFlat : [idsFlat];
            const qtyArr = Array.isArray(qtysFlat) ? qtysFlat : [qtysFlat];
            const len = Math.min(idsArr.length, qtyArr.length);
            for (let i = 0; i < len; i++) {
                const id = asInt(idsArr[i]);
                const qty = Math.max(1, asInt(qtyArr[i]));
                if (id) pairs.push({ id, qty });
            }
        } else {
            // Thu thập từ dạng lồng nhau cartDetails[i][id], cartDetails[i][quantity]
            const nested: Record<string, { id?: any; quantity?: any }> = {};
            for (const key of Object.keys(req.body)) {
                const m = key.match(/^cartDetails\[(\d+)\]\[(id|quantity)\]$/);
                if (!m) continue;
                const idx = m[1]; const field = m[2] as "id" | "quantity";
                nested[idx] ??= {};
                (nested[idx] as any)[field] = (req.body as any)[key];
            }
            for (const idx of Object.keys(nested)) {
                const id = asInt(nested[idx].id);
                const qty = Math.max(1, asInt(nested[idx].quantity));
                if (id) pairs.push({ id, qty });
            }
        }

        // Helper function to calculate price after discount
        const unitAfterDiscount = (price: number, discount: number) => {
            return discount > 0 ? Math.round(price * (100 - discount) / 100) : price;
        };

        await prisma.$transaction(async (tx) => {
            const activeCartId = cartIdFromBody || (await getActiveCartId(Number(user.id)));
            if (!activeCartId) return;

            // Giới hạn update vào cart của user
            const valid = await tx.cartDetail.findMany({
                where: { cartId: activeCartId },
                select: { id: true },
            });
            const validSet = new Set(valid.map(v => v.id));

            for (const { id, qty } of pairs) {
                if (!validSet.has(id)) continue;
                await tx.cartDetail.update({ where: { id }, data: { quantity: qty } });
            }

            // (tuỳ bạn dùng) cập nhật lại sum
            const details = await tx.cartDetail.findMany({
                where: { cartId: activeCartId },
                include: { product: { select: { price: true, discount: true } } },
            });
            const sum = details.reduce((s, d) =>
                s + unitAfterDiscount(d.product.price, d.product.discount || 0) * d.quantity, 0);
            await tx.cart.update({ where: { id: activeCartId }, data: { sum } });
        });

        // QUAN TRỌNG: sang flow giỏ → xoá vé Mua ngay còn tồn trong session
        if ((req as any).session) (req as any).session.buyNow = undefined;

        // Ép mode=cart để GET /checkout tôn trọng
        return res.redirect("/checkout?mode=cart");
    } catch (e) {
        console.error("handleCartToCheckout error:", e);
        return res.redirect("/cart");
    }
};

const toInt = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
};

const postPlaceOrder = async (req: Request, res: Response) => {
    const user: any = (req as any).user;
    if (!user) return res.redirect("/login");

    // === Helpers ép kiểu an toàn (string/array/undefined -> string, number) ===
    const asStr = (v: any): string =>
        v == null ? "" : (Array.isArray(v) ? String(v[0] ?? "") : String(v));

    const asUpper = (v: any): string => asStr(v).toUpperCase();

    const asIntOrNull = (v: any): number | null => {
        const raw = Array.isArray(v) ? v[0] : v;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    };

    // Lấy body (giữ nguyên destructure để không đổi tên biến ở dưới)
    const {
        receiverName,
        receiverAddress, // vẫn nhận từ form cũ để backward-compat
        receiverPhone,
        receiverNote,
        couponCode,
        mode: modeRaw,            // 'buy' | 'cart'
        paymentMethod: pmRaw,     // 'ONLINE' | 'COD'
    } = req.body;

    // ==== CHỈNH Ở ĐÂY: chuẩn hoá input ====
    const coupon = (asStr(couponCode).trim() || null);                    // <== hết lỗi .trim()
    const mode: "buy" | "cart" = asStr(modeRaw).toLowerCase() === "buy" ? "buy" : "cart";
    const paymentMethod = asUpper(pmRaw) === "ONLINE" ? "ONLINE" : "COD";

    const pushMsg = (type: "danger" | "warning" | "success", text: string) => {
        const sess: any = (req as any).session || ((req as any).session = {});
        if (!Array.isArray(sess.messages)) sess.messages = [];
        sess.messages.push({ type, text });
    };

    // Helper build absolute return URL + IP
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const returnUrl = `${baseUrl}/payment/return`;
    const ipAddr =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.socket as any)?.remoteAddress ||
        req.ip ||
        "127.0.0.1";

    // ===== Helpers địa chỉ (Cách A) =====
    // (giữ lại nếu bạn còn dùng nơi khác; không bắt buộc dùng dưới)
    const toCode = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    const composeAddress = (
        street?: string | null,
        wardName?: string | null,
        distName?: string | null,
        provName?: string | null
    ) => [street, wardName, distName, provName].filter(Boolean).join(", ");

    // Lấy code & street từ body (đã chuẩn hoá chống array)
    const provinceCode = asIntOrNull(req.body.receiverProvinceCode);
    const districtCode = asIntOrNull(req.body.receiverDistrictCode);
    const wardCode = asIntOrNull(req.body.receiverWardCode);
    const receiverStreet = asStr(req.body.receiverStreet).trim();

    // Tra tên qua Prisma (chỉ tra khi có mã)
    let provinceName: string | null = null;
    let districtName: string | null = null;
    let wardName: string | null = null;
    try {
        const [p, d, w] = await Promise.all([
            provinceCode ? prisma.province.findUnique({ where: { code: provinceCode } }) : Promise.resolve(null),
            districtCode ? prisma.district.findUnique({ where: { code: districtCode } }) : Promise.resolve(null),
            wardCode ? prisma.ward.findUnique({ where: { code: wardCode } }) : Promise.resolve(null),
        ]);
        provinceName = p?.name ?? null;
        districtName = d?.name ?? null;
        wardName = w?.name ?? null;
    } catch (e) {
        console.warn("Lookup province/district/ward failed:", e);
    }

    // Ưu tiên chuỗi từ form cũ nếu có; không thì ghép từ 4 phần mới
    const receiverAddressRaw = asStr(receiverAddress).trim();
    const finalReceiverAddress =
        receiverAddressRaw || composeAddress(receiverStreet, wardName, districtName, provinceName);

    try {
        // =========================
        // ======== BUY MODE =======
        // =========================
        if (mode === "buy") {
            const ticket: any = (req as any).session?.buyNow;
            if (!ticket) {
                pushMsg("warning", "Phiên 'Mua ngay' đã hết hạn. Vui lòng thao tác lại.");
                return res.redirect("/checkout?mode=buy");
            }

            const pid = toInt(ticket.productId); // helper cũ của bạn
            const qty = Math.max(1, toInt(ticket.quantity));
            if (!pid || !qty) {
                pushMsg("warning", "Dữ liệu 'Mua ngay' không hợp lệ. Vui lòng thao tác lại.");
                return res.redirect("/checkout?mode=buy");
            }

            const result = await handlePlaceOrder({
                userId: Number(user.id),
                receiverName,
                receiverAddress: finalReceiverAddress,
                receiverPhone,
                receiverNote,
                couponCode: coupon,
                mode: "buy",
                items: [{ productId: pid, quantity: qty }],

                // bổ sung để tính ship (không đổi logic tính)
                paymentMethod: paymentMethod === "ONLINE" ? "ONLINE" : "COD",
                receiverProvinceCode: provinceCode,
                receiverDistrictCode: districtCode,
                receiverWardCode: wardCode,
                receiverStreet: receiverStreet || null,
            });

            if (!result?.success) {
                pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
                return res.redirect("/checkout?mode=buy");
            }

            // Vẫn update các field địa chỉ mới (backward-safe)
            try {
                await prisma.order.update({
                    where: { id: result.orderId! },
                    data: {
                        receiverAddress: finalReceiverAddress || null,
                        receiverStreet: receiverStreet || null,
                        receiverProvinceCode: provinceCode,
                        receiverDistrictCode: districtCode,
                        receiverWardCode: wardCode,
                    },
                });
            } catch (err) {
                console.warn("Update order address (buy) failed:", err);
            }

            // Clear vé buyNow
            (req as any).session.buyNow = undefined;

            // Emit cho admin
            try {
                const io = getIO();
                io.to("admins").emit("new-order", {
                    orderId: result.orderId,
                    userId: Number(user.id),
                    customerName: user.fullName || user.username || `User #${user.id}`,
                    totalPrice: result.totalPrice ?? null,
                    mode: "buy",
                    createdAt: new Date().toISOString(),
                });
            } catch (e) {
                console.error("emit new-order error:", e);
            }

            // ONLINE → redirect VNPAY
            if (paymentMethod === "ONLINE") {
                try {
                    const gw = paymentGateway();
                    const amount = Number(result.totalPrice || 0);
                    await prisma.order.update({
                        where: { id: result.orderId! },
                        data: { paymentMethod: "ONLINE", paymentStatus: "PENDING" },
                    });
                    const { url } = await gw.createPaymentSession({
                        orderId: result.orderId!,
                        amount,
                        returnUrl,
                        ipAddr: String(ipAddr),
                    });
                    return res.redirect(url);
                } catch (err) {
                    console.error("start payment (buy) error:", err);
                    return res.redirect(`/thanks?orderId=${result.orderId}`);
                }
            }

            // COD → thanks
            return res.redirect(`/thanks?orderId=${result.orderId}`);
        }

        // =========================
        // ======= CART MODE =======
        // =========================
        const result = await handlePlaceOrder({
            userId: Number(user.id),
            receiverName,
            receiverAddress: finalReceiverAddress,
            receiverPhone,
            receiverNote,
            couponCode: coupon,
            mode: "cart",

            // bổ sung để tính ship (không đổi logic tính)
            paymentMethod: paymentMethod === "ONLINE" ? "ONLINE" : "COD",
            receiverProvinceCode: provinceCode,
            receiverDistrictCode: districtCode,
            receiverWardCode: wardCode,
            receiverStreet: receiverStreet || null,
        });

        if (!result?.success) {
            pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
            return res.redirect("/checkout");
        }

        // Update địa chỉ mới
        try {
            await prisma.order.update({
                where: { id: result.orderId! },
                data: {
                    receiverAddress: finalReceiverAddress || null,
                    receiverStreet: receiverStreet || null,
                    receiverProvinceCode: provinceCode,
                    receiverDistrictCode: districtCode,
                    receiverWardCode: wardCode,
                },
            });
        } catch (err) {
            console.warn("Update order address (cart) failed:", err);
        }

        // Emit cho admin
        try {
            const io = getIO();
            io.to("admins").emit("new-order", {
                orderId: result.orderId,
                userId: Number(user.id),
                customerName: user.fullName || user.username || `User #${user.id}`,
                totalPrice: result.totalPrice ?? null,
                mode: "cart",
                createdAt: new Date().toISOString(),
            });
        } catch (e) {
            console.error("emit new-order error:", e);
        }

        // ONLINE → redirect VNPAY
        if (paymentMethod === "ONLINE") {
            try {
                const gw = paymentGateway();
                const amount = Number(result.totalPrice || 0);
                await prisma.order.update({
                    where: { id: result.orderId! },
                    data: { paymentMethod: "ONLINE", paymentStatus: "PENDING" },
                });
                const { url } = await gw.createPaymentSession({
                    orderId: result.orderId!,
                    amount,
                    returnUrl,
                    ipAddr: String(ipAddr),
                });
                return res.redirect(url);
            } catch (err) {
                console.error("start payment (cart) error:", err);
                return res.redirect(`/thanks?orderId=${result.orderId}`);
            }
        }

        return res.redirect(`/thanks?orderId=${result.orderId}`);
    } catch (e) {
        console.error("postPlaceOrder error:", e);
        const back = mode === "buy" ? "/checkout?mode=buy" : "/checkout";
        const sess: any = (req as any).session || ((req as any).session = {});
        sess.messages = [{ type: "danger", text: "Có lỗi hệ thống. Thử lại sau." }];
        return res.redirect(back);
    }
};




const getThanksPage = async (req: Request, res: Response) => {
    let order: any = null;

    // Nếu bạn có orderId (param/query/session) thì thử load, không có cũng OK
    const orderId = Number(req.params.orderId || req.query.orderId || 0);
    if (Number.isFinite(orderId) && orderId > 0) {
        try {
            order = await prisma.order.findUnique({
                where: { id: orderId },
                include: { orderDetails: { include: { product: true } } },
            });
        } catch (e) {
            console.error("getThanksPage load order error:", e);
        }
    }
    return res.render("product/thanks", { order });
}
const getOrderHistoryPage = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.redirect("/login")

    const orders = await getOrderHistory(user.id)

    return res.render("product/order.history.ejs", {
        orders
    })
}
const postAddToCartFromDetailPage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { quantity } = req.body;
    const user = req.user;
    if (!user) return res.redirect("/login")

    await addProductToCart(+quantity, +id, user)

    return res.redirect(`/product/${id}`)
}

// Xử lý hủy đơn
const postCancelOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id; // lấy user từ session (passport)

    try {
        const order = await prisma.order.findUnique({ where: { id: +id } });
        if (!order) {
            return res.status(404).json({ message: "Đơn hàng không tồn tại" });
        }

        // check quyền: user chỉ hủy đơn của chính mình
        if (order.userId !== userId) {
            return res.status(403).json({ message: "Bạn không có quyền hủy đơn này" });
        }

        // chỉ cho phép hủy khi đang chờ xác nhận
        if (order.status !== "PENDING") {
            return res.status(400).json({ message: "Chỉ có thể hủy đơn đang chờ xác nhận" });
        }

        await prisma.order.update({
            where: { id: +id },
            data: {
                status: "CANCELED",
                receiverNote: reason,
            },
        });

        return res.json({ success: true, message: "Hủy đơn hàng thành công" });
    } catch (err) {
        console.error("Cancel order error:", err);
        return res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
    }
};

// xem chi tiết đơn hàng ở phần trạng thái
const getOrderDetailPage = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user) return res.redirect("/login");
    if (!Number.isFinite(id)) return res.status(400).send("Mã đơn không hợp lệ");

    const order = await prisma.order.findFirst({
        where: { id, userId: user.id },
        include: {
            user: true,
            province: true,
            district: true,
            ward: true,
            orderDetails: { include: { product: true } },

            // Nếu bạn đã thêm relation trong Prisma:
            // assignedShipper   Staff?  @relation(fields: [assignedShipperId], references: [id])
            // => nhớ include để EJS đọc được:
            assignedShipper: { select: { fullName: true, phone: true } } as any,
        },
    });
    if (!order) return res.status(404).render("status/404.ejs", { user });

    const canceled = order.status === "CANCELED";
    const currentStep = canceled ? -1 : ORDER_STEPS.indexOf(order.status as $Enums.OrderStatus);

    const items = order.orderDetails || [];
    const subTotal = items.reduce((s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0);
    const discountAmount = Number(order.discountAmount || 0);
    const total = subTotal - discountAmount;

    const addressParts = [
        order.receiverStreet || null,
        order.ward?.name || null,
        order.district?.name || null,
        order.province?.name || null,
    ].filter(Boolean) as string[];
    const addressDisplay = addressParts.length ? addressParts.join(", ") : (order.receiverAddress || "—");

    // ==== Lấy thông tin shipper (ưu tiên cache -> relation) ====
    let shipperName: string | null =
        (order as any).shipperNameCache ?? (order as any).shipperName ?? null;
    let shipperPhone: string | null =
        (order as any).shipperPhoneCache ?? (order as any).shipperPhone ?? null;

    if (!shipperName || !shipperPhone) {
        const relName = (order as any).assignedShipper?.fullName ?? null;
        const relPhone = (order as any).assignedShipper?.phone ?? null;
        shipperName = shipperName || relName;
        shipperPhone = shipperPhone || relPhone;
    }

    // Log để kiểm tra nhanh nguyên nhân không hiện:
    console.log("[OrderDetail]", {
        id: order.id,
        status: order.status,
        assignedShipperId: (order as any).assignedShipperId,
        shipperNameCache: (order as any).shipperNameCache,
        shipperPhoneCache: (order as any).shipperPhoneCache,
        relShipper: (order as any).assignedShipper,
        resolvedName: shipperName,
        resolvedPhone: shipperPhone,
    });

    return res.render("client/order/orderdetail.ejs", {
        user,
        order,
        items,
        subTotal,
        discountAmount,
        total,
        ORDER_STEPS,
        STATUS_LABEL_VI,
        currentStep,
        canceled,
        addressDisplay,
        shipperName,
        shipperPhone,
    });
};



const handleBuyNow = (req: Request, res: Response) => {
    const user: any = (req as any).user;
    if (!user) return res.redirect("/login");
    const pid = asInt(req.body.productId);
    const qty = Math.max(1, asInt(req.body.quantity));
    (req as any).session.buyNow = { productId: pid, quantity: qty };
    return res.redirect("/checkout?mode=buy"); // ép mode=buy
};




export { getProductPage, postAddProductToCart, getCartPage, postDeleteProductInCart, getCheckOutPage, postHandleCartToCheckOut, postPlaceOrder, getThanksPage, getOrderHistoryPage, postAddToCartFromDetailPage, postCancelOrder, getOrderDetailPage, handleBuyNow };