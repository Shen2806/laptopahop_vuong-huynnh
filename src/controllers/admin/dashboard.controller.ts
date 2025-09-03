import { prisma } from 'config/client';
import { Request, Response } from 'express';
import { getDashBoardInfo } from 'services/admin/dashboard.service';
import { getOrderAdmin, getOrderDetailAdmin } from 'services/admin/order.service';
import { getProductList } from 'services/admin/product.service';
import { countTotalOrderPages, countTotalProductPages, countTotalUserPages, getAllUsers } from 'services/user.service';

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

// const getAdminOrderPage = async (req: Request, res: Response) => {
//     const { page } = req.query;

//     let currentPage = page ? +page : 1;
//     if (currentPage <= 0) currentPage = 1;
//     const orders = await getOrderAdmin(currentPage);
//     const totalPages = await countTotalOrderPages();

//     return res.render('admin/order/show.ejs', {
//         orders,
//         totalPages: +totalPages,
//         page: +currentPage
//     })
// }
// const getAdminOrderDetailPage = async (req: Request, res: Response) => {
//     const { id } = req.params;
//     const orderDetails = await getOrderDetailAdmin(+id)

//     return res.render("admin/order/detail.ejs", {
//         orderDetails, id
//     })
// }

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
    // const orderDetails = await getOrderDetailAdmin(+id);
    // const order = await prisma.order.findUnique({
    //     where: { id: +id },
    //     include: { user: true }
    // });

    // return res.render("admin/order/detail.ejs", {
    //     orderDetails,
    //     order,
    //     id
    // });
    const order = await prisma.order.findUnique({
        where: { id: +id },
        include: {
            user: true,
            orderDetails: {
                include: { product: true }
            }
        }
    });

    if (!order) {
        return res.status(404).send("Order not found");
    }

    return res.render("admin/order/detail.ejs", {
        order,
        orderDetails: order.orderDetails,
        id
    });
};

const postConfirmOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await prisma.order.update({
            where: { id: +id },
            data: { status: "COMPLETE" }
        });
        return res.redirect("/admin/order");
    } catch (err) {
        console.error(err);
        return res.status(500).send("Lỗi xác nhận đơn");
    }
};

const postCancelOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await prisma.order.update({
            where: { id: +id },
            data: { status: "CANCELED" }
        });
        return res.redirect("/admin/order");
    } catch (err) {
        console.error(err);
        return res.status(500).send("Lỗi hủy đơn");
    }
};

export { getDashboardPage, getAdminUserPage, getAdminProductPage, getAdminOrderPage, getAdminOrderDetailPage, postConfirmOrder, postCancelOrder };