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
    const { id } = req.params;
    const product = await getProductById(+id);
    if (!product) {
        return res.status(404).render("status/404.ejs", { user: (req as any).user || null });
    }

    // ====== 🔽 CODE 2: cập nhật cookie recent_products 🔽
    const KEY = "recent_products";

    let ids: number[] = [];
    try {
        ids = JSON.parse((req as any).cookies?.[KEY] || "[]");
    } catch {
        ids = [];
    }
    // loại bỏ id hiện tại nếu đã có, rồi đưa lên đầu
    ids = ids.filter((x) => x !== product.id);
    ids.unshift(product.id);
    // giữ tối đa 20 id (tuỳ bạn)
    ids = ids.slice(0, 20);

    res.cookie(KEY, JSON.stringify(ids), {
        httpOnly: false,     // để client JS đọc được (nếu cần)
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
        path: "/",
    });
    // ====== 🔼 CODE 2: cập nhật cookie recent_products 🔼
    return res.render("product/detail", {
        product
    });
}

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

// const postPlaceOrder = async (req: Request, res: Response) => {
//     const user = (req as any).user;
//     if (!user) return res.redirect("/login");

//     const {
//         receiverName,
//         receiverAddress,
//         receiverPhone,
//         receiverNote,
//         couponCode,
//         mode, // <-- thêm mode từ form: 'buy' | 'cart'
//     } = req.body;

//     // Chuẩn hoá coupon
//     const coupon = (couponCode || "").trim() || null;

//     try {
//         // ===== BUY MODE: đặt hàng trực tiếp theo session.buyNow =====
//         if (mode === "buy") {
//             const ticket = req.session?.buyNow;
//             if (!ticket) {
//                 // Không có "vé" mua ngay -> trả về checkout buy-mode để user thao tác lại
//                 (req.session as any).messages = [
//                     { type: "warning", text: "Phiên 'Mua ngay' đã hết hạn. Vui lòng thao tác lại." },
//                 ];
//                 return res.redirect("/checkout?mode=buy");
//             }

//             // Bạn có thể truyền trực tiếp mảng items vào service
//             // (Cần cập nhật handlePlaceOrder để hỗ trợ 'items' & 'mode')
//             const result = await handlePlaceOrder({
//                 userId: Number(user.id),
//                 receiverName,
//                 receiverAddress,
//                 receiverPhone,
//                 receiverNote,
//                 couponCode: coupon,
//                 mode: "buy", // <-- gợi ý thêm param cho service
//                 items: [
//                     {
//                         productId: Number(ticket.productId),
//                         quantity: Math.max(1, Number(ticket.quantity) || 1),
//                     },
//                 ],
//             } as any); // nếu TS kêu gào do chưa mở rộng type thì tạm any

//             if (!result?.success) {
//                 (req.session as any).messages = [
//                     { type: "danger", text: result?.error || "Đặt hàng thất bại. Vui lòng thử lại!" },
//                 ];
//                 return res.redirect("/checkout?mode=buy");
//             }

//             // Xoá vé 'Mua ngay' để tránh reuse
//             req.session.buyNow = undefined;

//             // ✅ Emit cho ADMIN
//             try {
//                 const io = getIO();
//                 const payload = {
//                     orderId: result.orderId,
//                     userId: Number(user.id),
//                     customerName: user.fullName || user.username || `User #${user.id}`,
//                     totalPrice: result.totalPrice ?? null, // khuyến nghị service trả về
//                     mode: "buy",
//                     createdAt: new Date().toISOString(),
//                 };
//                 io.to("admins").emit("new-order", payload);
//             } catch (e) {
//                 console.error("emit new-order error:", e);
//             }

//             return res.redirect(`/thanks`);
//         }

//         // ===== CART MODE: logic cũ =====
//         const result = await handlePlaceOrder({
//             userId: Number(user.id),
//             receiverName,
//             receiverAddress,
//             receiverPhone,
//             receiverNote,
//             couponCode: coupon,
//             mode: "cart", // <-- gợi ý thêm param cho service (không bắt buộc)
//         } as any);

//         if (!result?.success) {
//             (req.session as any).messages = [
//                 { type: "danger", text: result?.error || "Đặt hàng thất bại. Vui lòng thử lại!" },
//             ];
//             return res.redirect("/checkout");
//         }

//         // ✅ Emit cho ADMIN biết có đơn mới (giữ nguyên)
//         try {
//             const io = getIO();
//             const payload = {
//                 orderId: result.orderId,
//                 userId: Number(user.id),
//                 customerName: user.fullName || user.username || `User #${user.id}`,
//                 totalPrice: result.totalPrice ?? null,
//                 mode: "cart",
//                 createdAt: new Date().toISOString(),
//             };
//             io.to("admins").emit("new-order", payload);
//         } catch (e) {
//             console.error("emit new-order error:", e);
//         }

//         return res.redirect(`/thanks`);
//     } catch (e) {
//         console.error("postPlaceOrder error:", e);
//         (req.session as any).messages = [{ type: "danger", text: "Có lỗi hệ thống. Thử lại sau." }];
//         // Khi lỗi trong buy-mode thì quay lại buy-mode cho đúng trải nghiệm
//         return res.redirect(mode === "buy" ? "/checkout?mode=buy" : "/checkout");
//     }
// };



const toInt = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
};
// bản chính
// const postPlaceOrder = async (req: Request, res: Response) => {
//     const user: any = (req as any).user;
//     if (!user) return res.redirect("/login");

//     const {
//         receiverName,
//         receiverAddress,
//         receiverPhone,
//         receiverNote,
//         couponCode,
//         mode: modeRaw, // 'buy' | 'cart'
//     } = req.body;

//     // sanitize
//     const coupon = (couponCode || "").trim() || null;
//     const mode: "buy" | "cart" = modeRaw === "buy" ? "buy" : "cart";

//     // helper push message
//     const pushMsg = (type: "danger" | "warning" | "success", text: string) => {
//         const sess: any = (req as any).session || ((req as any).session = {});
//         if (!Array.isArray(sess.messages)) sess.messages = [];
//         sess.messages.push({ type, text });
//     };

//     try {
//         // =========================
//         // ======== BUY MODE =======
//         // =========================
//         if (mode === "buy") {
//             const ticket: any = (req as any).session?.buyNow;
//             if (!ticket) {
//                 pushMsg("warning", "Phiên 'Mua ngay' đã hết hạn. Vui lòng thao tác lại.");
//                 return res.redirect("/checkout?mode=buy");
//             }

//             const pid = toInt(ticket.productId);
//             const qty = Math.max(1, toInt(ticket.quantity));
//             if (!pid || !qty) {
//                 pushMsg("warning", "Dữ liệu 'Mua ngay' không hợp lệ. Vui lòng thao tác lại.");
//                 return res.redirect("/checkout?mode=buy");
//             }

//             const result = await handlePlaceOrder({
//                 userId: Number(user.id),
//                 receiverName,
//                 receiverAddress,
//                 receiverPhone,
//                 receiverNote,
//                 couponCode: coupon,
//                 mode: "buy",
//                 items: [{ productId: pid, quantity: qty }],
//             });

//             if (!result?.success) {
//                 pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
//                 return res.redirect("/checkout?mode=buy");
//             }

//             // Clear vé buyNow để tránh reuse
//             (req as any).session.buyNow = undefined;

//             // Emit cho admin
//             try {
//                 const io = getIO();
//                 io.to("admins").emit("new-order", {
//                     orderId: result.orderId,
//                     userId: Number(user.id),
//                     customerName: user.fullName || user.username || `User #${user.id}`,
//                     totalPrice: result.totalPrice ?? null,
//                     mode: "buy",
//                     createdAt: new Date().toISOString(),
//                 });
//             } catch (e) {
//                 console.error("emit new-order error:", e);
//             }

//             return res.redirect("/thanks");
//         }

//         // =========================
//         // ======= CART MODE =======
//         // =========================
//         const result = await handlePlaceOrder({
//             userId: Number(user.id),
//             receiverName,
//             receiverAddress,
//             receiverPhone,
//             receiverNote,
//             couponCode: coupon,
//             mode: "cart",
//         });

//         if (!result?.success) {
//             pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
//             return res.redirect("/checkout");
//         }

//         // Emit cho admin
//         try {
//             const io = getIO();
//             io.to("admins").emit("new-order", {
//                 orderId: result.orderId,
//                 userId: Number(user.id),
//                 customerName: user.fullName || user.username || `User #${user.id}`,
//                 totalPrice: result.totalPrice ?? null,
//                 mode: "cart",
//                 createdAt: new Date().toISOString(),
//             });
//         } catch (e) {
//             console.error("emit new-order error:", e);
//         }

//         return res.redirect("/thanks");
//     } catch (e) {
//         console.error("postPlaceOrder error:", e);
//         const back = mode === "buy" ? "/checkout?mode=buy" : "/checkout";
//         const sess: any = (req as any).session || ((req as any).session = {});
//         sess.messages = [{ type: "danger", text: "Có lỗi hệ thống. Thử lại sau." }];
//         return res.redirect(back);
//     }
// };
const postPlaceOrder = async (req: Request, res: Response) => {
    const user: any = (req as any).user;
    if (!user) return res.redirect("/login");

    const {
        receiverName,
        receiverAddress,
        receiverPhone,
        receiverNote,
        couponCode,
        mode: modeRaw,            // 'buy' | 'cart'
        paymentMethod: pmRaw,     // 'ONLINE' | 'COD' (từ form)
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

            const pid = toInt(ticket.productId);
            const qty = Math.max(1, toInt(ticket.quantity));
            if (!pid || !qty) {
                pushMsg("warning", "Dữ liệu 'Mua ngay' không hợp lệ. Vui lòng thao tác lại.");
                return res.redirect("/checkout?mode=buy");
            }

            const result = await handlePlaceOrder({
                userId: Number(user.id),
                receiverName,
                receiverAddress,
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
            receiverAddress,
            receiverPhone,
            receiverNote,
            couponCode: coupon,
            mode: "cart",
        });

        if (!result?.success) {
            pushMsg("danger", result?.error || "Đặt hàng thất bại. Vui lòng thử lại!");
            return res.redirect("/checkout");
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
            orderDetails: { include: { product: true } },
            user: true,
        },
    });
    if (!order) return res.status(404).render("status/404.ejs", { user });

    const canceled = order.status === "CANCELED";
    const currentStep = canceled ? -1 : ORDER_STEPS.indexOf(order.status as $Enums.OrderStatus);

    const items = order.orderDetails || [];
    // nếu orderDetail có field price/quantity:
    const subTotal = items.reduce((sum, it: any) => sum + Number(it.price) * Number(it.quantity), 0);
    const discountAmount = Number(order.discountAmount || 0);
    const total = subTotal - discountAmount;

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
    });
};



export { getProductPage, postAddProductToCart, getCartPage, postDeleteProductInCart, getCheckOutPage, postHandleCartToCheckOut, postPlaceOrder, getThanksPage, getOrderHistoryPage, postAddToCartFromDetailPage, postCancelOrder, getOrderDetailPage };