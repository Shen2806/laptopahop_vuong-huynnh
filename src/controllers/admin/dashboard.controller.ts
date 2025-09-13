import { prisma } from 'config/client';
import { Request, Response } from 'express';
import { getDashBoardInfo } from 'services/admin/dashboard.service';
import { getOrderAdmin, getOrderDetailAdmin } from 'services/admin/order.service';
import { getProductList } from 'services/admin/product.service';
import { countTotalOrderPages, countTotalProductPages, countTotalUserPages, getAllUsers } from 'services/user.service';
import { format, toZonedTime } from 'date-fns-tz';

const getDashboardPage = async (req: Request, res: Response) => {
    const info = await getDashBoardInfo();
    return res.render("admin/dashboard/show.ejs", {
        info
    });
}
const getAdminUserPage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const users = await getAllUsers(currentPage);
    const totalPages = await countTotalUserPages();
    return res.render("admin/user/show.ejs", {
        users: users,
        totalPages: +totalPages,
        page: +currentPage

    });
}
const getAdminProductPage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const totalPages = await countTotalProductPages();
    const products = await getProductList(currentPage);
    return res.render("admin/product/show.ejs", {
        products,
        totalPages: +totalPages,
        page: +currentPage

    });
}

const getAdminOrderPage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const orders = await getOrderAdmin(currentPage);
    const totalPages = await countTotalOrderPages();

    return res.render('admin/order/show.ejs', {
        orders,
        totalPages: +totalPages,
        page: +currentPage
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

    // Chuyển sang giờ Việt Nam
    const timeZone = 'Asia/Ho_Chi_Minh';
    const orderCreatedAtVN = toZonedTime(order.createdAt, timeZone);
    const formattedCreatedAtVN = format(orderCreatedAtVN, "dd/MM/yyyy HH:mm:ss", { timeZone });

    return res.render("admin/order/detail.ejs", {
        order,
        orderDetails: order.orderDetails,
        id,
        formattedCreatedAtVN
    });
};

const postConfirmOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const order = await prisma.order.update({
            where: { id: +id },
            data: { status: "COMPLETE" }
        });

        // Tạo notification cho user
        await prisma.notification.create({
            data: {
                userId: order.userId,
                message: `Đơn hàng #${order.id} của bạn đã được xác nhận`
            }
        });

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
                status: "CANCELED",
                cancelReason
            }
        });

        // Tạo notification cho user
        await prisma.notification.create({
            data: {
                userId: order.userId,
                message: `Đơn hàng #${order.id} của bạn đã bị hủy. Lý do: ${cancelReason}`
            }
        });

        return res.redirect("/admin/order/" + id);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Lỗi hủy đơn");
    }
};

const postRestockProduct = async (req: Request, res: Response) => {
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!productId || isNaN(qty) || qty <= 0) {
        return res.status(400).send("Dữ liệu không hợp lệ");
    }

    await prisma.product.update({
        where: { id: Number(productId) },
        data: {
            quantity: { increment: qty }
        }
    });

    res.redirect("/admin"); // quay lại dashboard sau khi nhập thêm
};

// Trang quản lý khuyến mãi
// Trang khuyến mãi
const getPromoPage = async (req: Request, res: Response) => {
    const promoProducts = await prisma.product.findMany({
        where: { discount: { gt: 0 } },
        select: { id: true, name: true, price: true, discount: true, image: true }
    });

    const allProducts = await prisma.product.findMany({
        select: { id: true, name: true }
    });

    res.render("admin/promotion/promo", { promoProducts, allProducts });
};

// Thêm khuyến mãi
const postAddPromo = async (req: Request, res: Response) => {
    const { productId, discount } = req.body;

    await prisma.product.update({
        where: { id: Number(productId) },
        data: { discount: Number(discount) }
    });

    res.redirect("/admin/promo");
};

// Sửa khuyến mãi
const postUpdatePromo = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { discount } = req.body;

    await prisma.product.update({
        where: { id: Number(id) },
        data: { discount: Number(discount) }
    });

    res.redirect("/admin/promo");
};

// Xóa khuyến mãi (đặt discount = 0)
const postDeletePromo = async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.product.update({
        where: { id: Number(id) },
        data: { discount: 0 }
    });

    res.redirect("/admin/promo");
};
export { getDashboardPage, getAdminUserPage, getAdminProductPage, getAdminOrderPage, getAdminOrderDetailPage, postConfirmOrder, postRestockProduct, postCancelOrderByAdmin, getPromoPage, postAddPromo, postUpdatePromo, postDeletePromo };