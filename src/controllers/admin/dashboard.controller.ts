import { prisma } from 'config/client';
import { $Enums, OrderStatus } from "@prisma/client";
import { Request, Response } from 'express';
import { getDashBoardInfo } from 'services/admin/dashboard.service';
import { getOrderAdmin, getOrderDetailAdmin } from 'services/admin/order.service';
import { getProductList } from 'services/admin/product.service';
import { countTotalOrderPages, countTotalProductPages, countTotalUserPages, getAllUsers } from 'services/user.service';
import { format, toZonedTime } from 'date-fns-tz';
import { getIO } from 'src/socket';

export const STATUS_LABEL_VI: Record<$Enums.OrderStatus, string> = {
    PENDING: "Chờ xử lý",
    CONFIRMED: "Đã xác nhận đơn",
    SHIPPING: "Đang vận chuyển",
    OUT_FOR_DELIVERY: "Đang giao hàng",
    DELIVERED: "Đã giao hàng",
    CANCELED: "Đã hủy",
};

export const ALLOWED_NEXT: Record<$Enums.OrderStatus, $Enums.OrderStatus[]> = {
    PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELED],
    CONFIRMED: [OrderStatus.SHIPPING, OrderStatus.CANCELED],
    SHIPPING: [OrderStatus.OUT_FOR_DELIVERY],
    OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
    DELIVERED: [],
    CANCELED: [],
};

/** ================================== */

const getDashboardPage = async (req: Request, res: Response) => {
    const info = await getDashBoardInfo();
    return res.render("admin/dashboard/show.ejs", { info });
};

const getAdminUserPage = async (req: Request, res: Response) => {
    const { page } = req.query;
    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const users = await getAllUsers(currentPage);
    const totalPages = await countTotalUserPages();
    return res.render("admin/user/show.ejs", {
        users, totalPages: +totalPages, page: +currentPage
    });
};

const getAdminProductPage = async (req: Request, res: Response) => {
    const { page } = req.query;
    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const totalPages = await countTotalProductPages();
    const products = await getProductList(currentPage);
    return res.render("admin/product/show.ejs", {
        products, totalPages: +totalPages, page: +currentPage
    });
};

const getAdminOrderPage = async (req: Request, res: Response) => {
    const { page } = req.query;
    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const orders = await getOrderAdmin(currentPage);
    const totalPages = await countTotalOrderPages();

    return res.render('admin/order/show.ejs', {
        orders, totalPages: +totalPages, page: +currentPage
    });
};

const getAdminOrderDetailPage = async (req: Request, res: Response) => {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
        where: { id: +id },
        include: {
            user: true,
            orderDetails: { include: { product: true } }
        }
    });

    if (!order) return res.status(404).send("Order not found");

    // VN time
    const timeZone = 'Asia/Ho_Chi_Minh';
    const orderCreatedAtVN = toZonedTime(order.createdAt, timeZone);
    const formattedCreatedAtVN = format(orderCreatedAtVN, "dd/MM/yyyy HH:mm:ss", { timeZone });

    // allowed transitions cho view
    const allowedNext = ALLOWED_NEXT[order.status] || [];

    return res.render("admin/order/detail.ejs", {
        order,
        orderDetails: order.orderDetails,
        id,
        formattedCreatedAtVN,
        STATUS_LABEL_VI,
        // ORDER_STATUS,
        allowedNext
    });
};


/** XÁC NHẬN ĐƠN */
const postConfirmOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const order = await prisma.order.update({
            where: { id: +id },
            data: { status: OrderStatus.CONFIRMED },
        });

        await prisma.notification.create({
            data: {
                userId: order.userId,
                message: `Đơn hàng #${order.id} đã được xác nhận`,
            },
        });

        // ✅ Emit cho user
        try {
            const io = getIO();
            console.log("[SOCKET] confirming order -> emit to user room:", `user-${order.userId}`);
            io.to(`user-${order.userId}`).emit("order-confirmed", {
                orderId: order.id,
                status: OrderStatus.CONFIRMED,
                message: `Đơn hàng #${order.id} đã được xác nhận`,
            });

            // (tuỳ) Cũng có thể báo lại cho admins để cập nhật list
            io.to("admins").emit("order-updated", { orderId: order.id, status: OrderStatus.CONFIRMED });
        } catch (e) {
            console.error("emit order-confirmed error:", e);
        }

        return res.redirect("/admin/order");
    } catch (err) {
        console.error(err);
        return res.status(500).send("Lỗi xác nhận đơn");
    }
};

const postCancelOrderByAdmin = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { cancelReason } = req.body;

    try {
        const order = await prisma.order.update({
            where: { id: +id },
            data: {
                status: OrderStatus.CANCELED,
                cancelReason,
            },
        });

        await prisma.notification.create({
            data: {
                userId: order.userId,
                message: `Đơn hàng #${order.id} đã bị hủy. Lý do: ${cancelReason}`,
            },
        });

        // ✅ Emit cho user
        try {
            const io = getIO();
            io.to(`user-${order.userId}`).emit("order-canceled", {
                orderId: order.id,
                status: OrderStatus.CANCELED,
                message: `Đơn hàng #${order.id} đã bị hủy. Lý do: ${cancelReason}`,
            });
            io.to("admins").emit("order-updated", { orderId: order.id, status: OrderStatus.CANCELED });
        } catch (e) {
            console.error("emit order-canceled error:", e);
        }

        return res.redirect("/admin/order/" + id);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Lỗi hủy đơn");
    }
};

/** Cập nhật sang trạng thái tiếp theo (giữ logic kiểm tra hợp lệ) */
const postUpdateOrderStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const nextRaw = String(req.body.status || "");
    const isValid = Object.values(OrderStatus).includes(nextRaw as OrderStatus);
    if (!isValid) return res.status(400).send("Trạng thái không hợp lệ");

    const next = nextRaw as $Enums.OrderStatus;

    const order = await prisma.order.findUnique({ where: { id: +id } });
    if (!order) return res.status(404).send("Order not found");

    const allow = ALLOWED_NEXT[order.status] || [];
    if (!allow.includes(next)) {
        return res
            .status(400)
            .send(`Không thể chuyển từ ${STATUS_LABEL_VI[order.status]} → ${STATUS_LABEL_VI[next]}`);
    }

    const updated = await prisma.order.update({
        where: { id: +id },
        data: { status: next },
    });

    // (tuỳ) Lưu notification cho user:
    try {
        await prisma.notification.create({
            data: {
                userId: updated.userId,
                message: `Đơn #${updated.id} cập nhật: ${STATUS_LABEL_VI[next] || next}`,
            },
        });
    } catch { }

    // ✅ Emit cho user & admins
    try {
        const io = getIO();
        io.to(`user-${updated.userId}`).emit("order-updated", {
            orderId: updated.id,
            status: next,
            message: `Đơn #${updated.id} cập nhật: ${STATUS_LABEL_VI[next] || next}`,
        });
        io.to("admins").emit("order-updated", { orderId: updated.id, status: next });
    } catch (e) {
        console.error("emit order-updated error:", e);
    }

    return res.redirect(`/admin/order/${id}`);
};

const postRestockProduct = async (req: Request, res: Response) => {
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity, 10);
    if (!productId || isNaN(qty) || qty <= 0) {
        return res.status(400).send("Dữ liệu không hợp lệ");
    }
    await prisma.product.update({
        where: { id: Number(productId) },
        data: { quantity: { increment: qty } }
    });
    res.redirect("/admin");
};

/** Promo */
const getPromoPage = async (req: Request, res: Response) => {
    const promoProducts = await prisma.product.findMany({
        where: { discount: { gt: 0 } },
        select: { id: true, name: true, price: true, discount: true, image: true }
    });

    const allProducts = await prisma.product.findMany({ select: { id: true, name: true } });
    res.render("admin/promotion/promo", { promoProducts, allProducts });
};

const postAddPromo = async (req: Request, res: Response) => {
    const { productId, discount } = req.body;
    await prisma.product.update({
        where: { id: Number(productId) },
        data: { discount: Number(discount) }
    });
    res.redirect("/admin/promo");
};

const postUpdatePromo = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { discount } = req.body;
    await prisma.product.update({
        where: { id: Number(id) },
        data: { discount: Number(discount) }
    });
    res.redirect("/admin/promo");
};

const postDeletePromo = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.product.update({
        where: { id: Number(id) },
        data: { discount: 0 }
    });
    res.redirect("/admin/promo");
};

export {
    getDashboardPage,
    getAdminUserPage,
    getAdminProductPage,
    getAdminOrderPage,
    getAdminOrderDetailPage,
    postConfirmOrder,
    postRestockProduct,
    postCancelOrderByAdmin,
    getPromoPage, postAddPromo, postUpdatePromo, postDeletePromo,
    postUpdateOrderStatus
};
