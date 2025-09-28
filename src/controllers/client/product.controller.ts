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
    const user = (req as any).user;
    if (!user) return res.redirect("/login");

    try {
        // Ưu tiên "Mua ngay" khi có session buyNow hoặc query ?mode=buy
        const wantBuyMode = req.query.mode === "buy" || Boolean(req.session?.buyNow);

        if (wantBuyMode && req.session?.buyNow) {
            const { productId, quantity } = req.session.buyNow;
            const pid = Number(productId);
            const qtyReq = Math.max(1, Number(quantity) || 1);

            // Lấy sản phẩm
            const p = await prisma.product.findUnique({
                where: { id: pid },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    discount: true,
                    quantity: true,
                    image: true,
                },
            });

            if (!p) {
                // Không còn sản phẩm -> bỏ buyNow & fallback về giỏ
                req.session.buyNow = undefined;
                return res.redirect("/cart");
            }

            const stock = Number(p.quantity) || 0;
            const qty = Math.min(qtyReq, stock);
            if (qty <= 0) {
                // Hết hàng -> bỏ buyNow và quay lại trang sản phẩm
                req.session.buyNow = undefined;
                return res.redirect(`/product/${pid}`);
            }

            // Tính tiền: trước/sau KM
            const price = Number(p.price) || 0;
            const discount = Number(p.discount || 0); // %
            const unitAfter = discount > 0 ? Math.round(price * (100 - discount) / 100) : price;

            const subtotalBefore = price * qty;
            const subtotalAfter = unitAfter * qty;

            // Ngưỡng coupon giữ nguyên logic của bạn
            const coupons =
                subtotalAfter >= 25_000_000
                    ? await prisma.coupon.findMany({
                        where: { expiryDate: { gte: new Date() } },
                        orderBy: { updatedAt: "desc" },
                    })
                    : [];

            // Giả lập cấu trúc cartDetails đúng view (product + quantity)
            const cartDetails = [
                {
                    id: 0,            // dummy
                    cartId: 0,        // dummy
                    productId: p.id,
                    quantity: qty,
                    product: p,       // view dùng cd.product.*
                },
            ];

            return res.render("product/checkout", {
                cartDetails,
                subtotalBefore,
                totalPrice: subtotalAfter, // base sau KM SP
                coupons,
                mode: "buy",               // để view biết đang ở buy-mode (nếu bạn muốn hiển thị khác)
            });
        }

        // ==== Mặc định: Checkout theo GIỎ HÀNG (logic gốc của bạn) ====
        // 1) Tìm cart theo userId
        const cart = await prisma.cart.findFirst({
            where: { userId: Number(user.id) },
            select: { id: true },
        });

        if (!cart) {
            return res.render("product/checkout", {
                cartDetails: [],
                subtotalBefore: 0,
                totalPrice: 0,
                coupons: [],
                mode: "cart",
            });
        }

        const cartId = cart.id;

        // 2) Lấy chi tiết giỏ + product
        const cartDetails = await prisma.cartDetail.findMany({
            where: { cartId },
            include: { product: true },
        });

        // 3) Tổng trước KM
        const subtotalBefore = cartDetails.reduce((sum, cd) => {
            return sum + Number(cd.product.price) * Number(cd.quantity);
        }, 0);

        // 4) Tổng sau KM từng SP
        const subtotalAfter = cartDetails.reduce((sum, cd) => {
            const price = Number(cd.product.price);
            const discount = Number(cd.product.discount || 0);
            const unit = discount > 0 ? Math.round(price * (100 - discount) / 100) : price;
            return sum + unit * Number(cd.quantity);
        }, 0);

        // 5) Coupon nếu đạt ngưỡng
        let coupons: any[] = [];
        if (subtotalAfter >= 25_000_000) {
            coupons = await prisma.coupon.findMany({
                where: { expiryDate: { gte: new Date() } },
                orderBy: { updatedAt: "desc" },
            });
        }

        // 6) Render
        return res.render("product/checkout", {
            cartDetails,
            subtotalBefore,
            totalPrice: subtotalAfter,
            coupons,
            mode: "cart",
        });
    } catch (e) {
        console.error("getCheckOutPage error:", e);
        return res.redirect("/cart");
    }
};


const postHandleCartToCheckOut = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) return res.redirect("/login");

    try {
        const cartId = Number(req.body.cartId);
        if (!Number.isFinite(cartId)) return res.redirect("/cart");

        // cartDetails có thể là mảng hoặc object dạng { "0": {id, quantity}, ... }
        const raw = req.body?.cartDetails ?? [];
        const items: Array<{ id: any; quantity: any }> = Array.isArray(raw) ? raw : Object.values(raw);

        await updateCartDetailBeforeCheckOut(items, cartId);

        return res.redirect("/checkout");
    } catch (err) {
        console.error("postHandleCartToCheckOut error:", err);
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

    const {
        receiverName,
        receiverAddress, // vẫn nhận từ form cũ để backward-compat
        receiverPhone,
        receiverNote,
        couponCode,
        mode: modeRaw,            // 'buy' | 'cart'
        paymentMethod: pmRaw,     // 'ONLINE' | 'COD'
    } = req.body;

    const coupon = (couponCode || "").trim() || null;
    const mode: "buy" | "cart" = modeRaw === "buy" ? "buy" : "cart";
    const paymentMethod = String(pmRaw || "").toUpperCase();

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

    // Lấy code & street từ body (đến từ 4 input mới trong checkout)
    const provinceCode = toCode(req.body.receiverProvinceCode);
    const districtCode = toCode(req.body.receiverDistrictCode);
    const wardCode = toCode(req.body.receiverWardCode);
    const receiverStreet = (req.body.receiverStreet || "").trim();

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

    // Ưu tiên chuỗi receiverAddress (nếu form cũ vẫn gửi), nếu không thì ghép từ 4 phần
    const receiverAddressRaw = (receiverAddress || "").trim();
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

            const pid = toInt(ticket.productId); // toInt của bạn đã dùng sẵn ở file này
            const qty = Math.max(1, toInt(ticket.quantity));
            if (!pid || !qty) {
                pushMsg("warning", "Dữ liệu 'Mua ngay' không hợp lệ. Vui lòng thao tác lại.");
                return res.redirect("/checkout?mode=buy");
            }

            const result = await handlePlaceOrder({
                userId: Number(user.id),
                receiverName,
                receiverAddress: finalReceiverAddress, // dùng địa chỉ đã chuẩn hoá
                receiverPhone,
                receiverNote,
                couponCode: coupon,
                mode: "buy",
                items: [{ productId: pid, quantity: qty }],
            });

            if (!result?.success) {
                pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
                return res.redirect("/checkout?mode=buy");
            }

            // Ghi thêm các trường địa chỉ mới vào Order (không thay đổi handlePlaceOrder)
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

            // Clear vé buyNow để tránh reuse
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

            // Nếu người dùng chọn ONLINE → redirect VNPAY
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
            receiverAddress: finalReceiverAddress, // dùng địa chỉ đã chuẩn hoá
            receiverPhone,
            receiverNote,
            couponCode: coupon,
            mode: "cart",
        });

        if (!result?.success) {
            pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
            return res.redirect("/checkout");
        }

        // Ghi thêm các trường địa chỉ mới vào Order
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
            province: true,   // <-- Tỉnh/Thành
            district: true,   // <-- Quận/Huyện
            ward: true,       // <-- Phường/Xã
            orderDetails: { include: { product: true } },
        },
    });
    if (!order) return res.status(404).render("status/404.ejs", { user });

    const canceled = order.status === "CANCELED";
    const currentStep = canceled ? -1 : ORDER_STEPS.indexOf(order.status as $Enums.OrderStatus);

    const items = order.orderDetails || [];
    const subTotal = items.reduce((sum: number, it: any) => sum + Number(it.price) * Number(it.quantity), 0);
    const discountAmount = Number(order.discountAmount || 0);
    const total = subTotal - discountAmount;

    // Ghép địa chỉ hiển thị: ưu tiên street + ward + district + province; fallback receiverAddress
    const addressParts = [
        order.receiverStreet || null,
        order.ward?.name || null,
        order.district?.name || null,
        order.province?.name || null,
    ].filter(Boolean) as string[];
    const addressDisplay = addressParts.length ? addressParts.join(", ") : (order.receiverAddress || "—");

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
        addressDisplay, // <-- dùng trong EJS để hiện địa chỉ đẹp
    });
};




export { getProductPage, postAddProductToCart, getCartPage, postDeleteProductInCart, getCheckOutPage, postHandleCartToCheckOut, postPlaceOrder, getThanksPage, getOrderHistoryPage, postAddToCartFromDetailPage, postCancelOrder, getOrderDetailPage };