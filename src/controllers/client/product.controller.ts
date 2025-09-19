import { prisma } from "config/client";
import { Request, Response } from "express";
import { addProductToCart, DeleteProductInCart, getOrderHistory, getProductById, getProductInCart, handlePlaceOrder, updateCartDetailBeforeCheckOut } from "services/client/item.service";
import { getIO } from "src/socket";
import { $Enums } from "@prisma/client"; // thêm nếu chưa có
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
        // 1) Tìm cart hiện tại theo userId (lấy id)
        const cart = await prisma.cart.findFirst({
            where: { userId: Number(user.id) },
            select: { id: true },
        });

        // Không có giỏ → render rỗng
        if (!cart) {
            return res.render("product/checkout", {
                cartDetails: [],
                subtotalBefore: 0,
                totalPrice: 0,
                coupons: [],
            });
        }

        const cartId = cart.id;

        // 2) Lấy chi tiết giỏ + product (cần price, discount)
        const cartDetails = await prisma.cartDetail.findMany({
            where: { cartId },
            include: { product: true },
        });

        // 3) Tính tổng trước KM (tham khảo)
        const subtotalBefore = cartDetails.reduce((sum, cd) => {
            return sum + Number(cd.product.price) * Number(cd.quantity);
        }, 0);

        // 4) ✅ Tính tổng SAU KM theo từng SP (base để áp coupon)
        const subtotalAfter = cartDetails.reduce((sum, cd) => {
            const price = Number(cd.product.price);
            const discount = Number(cd.product.discount || 0); // % trên từng SP
            const unit = discount > 0 ? Math.round(price * (100 - discount) / 100) : price;
            return sum + unit * Number(cd.quantity);
        }, 0);

        // 5) Nếu >= 25tr (sau KM SP) → show coupon còn hạn
        let coupons: any[] = [];
        if (subtotalAfter >= 25_000_000) {
            coupons = await prisma.coupon.findMany({
                where: { expiryDate: { gte: new Date() } },
                orderBy: { updatedAt: "desc" },
            });
        }

        // 6) Render: dùng subtotalAfter làm totalPrice để checkout áp coupon đúng
        return res.render("product/checkout", {
            cartDetails,
            subtotalBefore,
            totalPrice: subtotalAfter, // ✅ base sau KM SP
            coupons,
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

const postPlaceOrder = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) return res.redirect("/login");

    const {
        receiverName,
        receiverAddress,
        receiverPhone,
        receiverNote,
        couponCode,
    } = req.body;

    try {
        const result = await handlePlaceOrder({
            userId: Number(user.id),
            receiverName,
            receiverAddress,
            receiverPhone,
            receiverNote,
            couponCode: (couponCode || "").trim() || null,
        });

        if (!result.success) {
            (req as any).session = (req as any).session || {};
            (req as any).session.messages = [
                { type: "danger", text: result.error || "Đặt hàng thất bại. Vui lòng thử lại!" },
            ];
            return res.redirect("/checkout");
        }

        // ✅ Emit cho ADMIN biết có đơn mới
        try {
            const io = getIO();
            const payload = {
                orderId: result.orderId,             // handlePlaceOrder nên trả về orderId
                userId: Number(user.id),
                customerName: user.fullName || user.username || `User #${user.id}`,
                totalPrice: null, // PlaceOrderResult does not have totalPrice, set to null or update service to return it
                createdAt: new Date().toISOString(),
            };
            io.to("admins").emit("new-order", payload);
        } catch (e) {
            // không chặn luồng nếu socket lỗi
            console.error("emit new-order error:", e);
        }

        return res.redirect(`/thanks`);
    } catch (e) {
        console.error("postPlaceOrder error:", e);
        (req as any).session = (req as any).session || {};
        (req as any).session.messages = [{ type: "danger", text: "Có lỗi hệ thống. Thử lại sau." }];
        return res.redirect("/checkout");
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

    // ❌ ĐỪNG redirect("/") nếu không có order
    // ✅ Luôn render thanks.ejs (có/không có chi tiết)
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