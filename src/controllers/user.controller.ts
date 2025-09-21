import { prisma } from 'config/client';
import { Request, Response } from 'express';
import { countTotalProductClientPages, getProducts } from 'services/client/item.service';
import { getProductWithFilter, getSortIncProduct, userFilter } from 'services/client/product.filter';
import { attachRatings, getRatingMap } from 'services/client/review.service';
import { getAllRoles, getAllUsers, getUserById, handleCreateUser, handleDeleteUser, updateUserById } from 'services/user.service';


// const getHomePage = async (req: Request, res: Response) => {
//     const { page } = req.query;

//     let currentPage = page ? +page : 1;
//     if (currentPage <= 0) currentPage = 1;

//     // Phân trang sản phẩm
//     const totalPages = await countTotalProductClientPages(8);
//     const products = await getProducts(currentPage, 8);

//     // Sản phẩm khuyến mãi
//     const promoProducts = await prisma.product.findMany({
//         where: { discount: { gt: 0 } },
//         take: 6,
//         select: { id: true, name: true, price: true, discount: true, image: true }
//     });

//     // === Tin tức công nghệ (blog) ===
//     const latestBlogs = await prisma.blog.findMany({
//         where: { published: true },
//         orderBy: { createdAt: "desc" },
//         take: 8,
//         select: {
//             id: true,
//             title: true,
//             slug: true,
//             thumbnail: true,
//             author: true,
//             createdAt: true,
//             content: true, // dùng để rút gọn nếu không có summary
//         },
//     });

//     return res.render("client/home/show.ejs", {
//         products,
//         totalPages: +totalPages,
//         page: +currentPage,
//         promoProducts,
//         latestBlogs,
//     });
// };


const getHomePage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;

    // Phân trang sản phẩm
    const pageSize = 8;
    const totalPages = await countTotalProductClientPages(pageSize);
    const products = await getProducts(currentPage, pageSize);

    // Sản phẩm khuyến mãi (giữ field view đang dùng)
    const promoProducts = await prisma.product.findMany({
        where: { discount: { gt: 0 } },
        take: 6,
        select: { id: true, name: true, price: true, discount: true, image: true, shortDesc: true, quantity: true },
    });

    // Blog
    const latestBlogs = await prisma.blog.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, title: true, slug: true, thumbnail: true, author: true, createdAt: true, content: true },
    });

    // ====== LẤY RATING ĐỘNG CHO TẤT CẢ SẢN PHẨM 1 LẦN ======
    const ids = Array.from(new Set([
        ...products.map(p => Number(p.id)),
        ...promoProducts.map(p => Number(p.id)),
    ])).filter(Number.isFinite);

    type ReviewRow = { productId: number; rating: number };
    const reviews: ReviewRow[] = ids.length
        ? await prisma.review.findMany({
            where: { productId: { in: ids } },
            select: { productId: true, rating: true },
        })
        : [];

    // Gom nhóm -> sum & count -> avg
    const agg: Record<number, { sum: number; count: number }> = {};
    for (const r of reviews) {
        const k = r.productId;
        if (!agg[k]) agg[k] = { sum: 0, count: 0 };
        agg[k].sum += Number(r.rating) || 0;
        agg[k].count += 1;
    }
    const attach = <T extends { id: number }>(arr: T[]) =>
        arr.map(p => {
            const a = agg[p.id];
            const count = a?.count ?? 0;
            const avg = count ? a!.sum / count : 0;
            return { ...p, ratingAvg: avg, ratingCount: count };
        });

    const productsWithRating = attach(products);
    const promoWithRating = attach(promoProducts);

    return res.render("client/home/show.ejs", {
        products: productsWithRating,   // ⬅️ đã có ratingAvg & ratingCount
        totalPages,
        page: currentPage,
        promoProducts: promoWithRating, // nếu view dùng tới
        latestBlogs,
    });
};




const getCreateUserPage = async (req: Request, res: Response) => {
    const roles = await getAllRoles();
    return res.render("admin/user/create.ejs", {
        roles: roles
    });
}
const postCreateUser = async (req: Request, res: Response) => {
    const { fullName, username, phone, role, address } = req.body;
    const file = req.file;
    const avatar = file?.filename ?? '';
    // handle create user logic
    await handleCreateUser(fullName, username, address, phone, avatar, role);
    return res.redirect("/admin/user");
}

const postDeleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle delete user logic
    await handleDeleteUser(Number(id));
    // redirect to home page
    return res.redirect("/admin/user");
}
const getViewUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle view user logic
    const user = await getUserById(Number(id));
    return res.render("admin/user/detail.ejs", {
        id: id,
        user: user,
        roles: await getAllRoles()
    });

}

const postUpdateUser = async (req: Request, res: Response) => {
    const { id, fullName, phone, role, address } = req.body;
    const file = req.file;
    const avatar = file?.filename ?? '';

    // gọi service
    await updateUserById(
        Number(id),
        fullName,
        phone,
        Number(role),   // role phải là số
        address,
        avatar
    );

    return res.redirect("/admin/user");
};

// const getProductFilterPage = async (req: Request, res: Response) => {
//     const { page, factory = "", target = "", price = "", sort = "", } = req.query as {
//         page?: string,
//         factory: string,
//         target: string,
//         price: string,
//         sort: string
//     };

//     let currentPage = page ? +page : 1;
//     if (currentPage <= 0) currentPage = 1;

//     const precheckedFactories = (req.query.factory?.toString() || '')
//         .split(',').map(s => s.trim()).filter(Boolean);
//     const data = await getProductWithFilter(currentPage, 6, factory, target, price, sort)
//     return res.render("product/filter.ejs", {
//         products: data.products,
//         totalPages: +data.totalPages,
//         page: +currentPage,
//         factoryOptions: [
//             { value: 'APPLE', name: 'Apple (MacBook)' },
//             { value: 'ASUS', name: 'Asus' },
//             { value: 'LENOVO', name: 'Lenovo' },
//             { value: 'DELL', name: 'Dell' },
//             { value: 'LG', name: 'LG' },
//             { value: 'ACER', name: 'Acer' },
//             { value: 'HP', name: 'HP' },
//             { value: 'MSI', name: 'MSI' },
//             { value: 'GIGABYTE', name: 'Gigabyte' },
//             { value: 'ALIENWARE', name: 'Alienware' },
//         ],
//         precheckedFactories,


//     });
// }
// import { prisma } from "config/client";
// import { Request, Response } from "express";
// import { getProductWithFilter } from "services/client/product.service";

const getProductFilterPage = async (req: Request, res: Response) => {
    const { page, factory = "", target = "", price = "", sort = "" } = req.query as {
        page?: string; factory: string; target: string; price: string; sort: string;
    };

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;

    const precheckedFactories = (req.query.factory?.toString() || "")
        .split(",").map(s => s.trim()).filter(Boolean);

    // Lấy sản phẩm theo filter
    const data = await getProductWithFilter(currentPage, 6, factory, target, price, sort);
    const products = data.products || [];

    // Lấy review một lần cho tất cả product
    const ids = products.map((p: any) => Number(p.id)).filter(Number.isFinite);

    type ReviewRow = { productId: number; rating: number };
    const reviews: ReviewRow[] = ids.length
        ? await prisma.review.findMany({
            where: { productId: { in: ids } },
            select: { productId: true, rating: true },
        })
        : [];

    // Gom review -> sum & count
    const agg: Record<number, { sum: number; count: number }> = {};
    for (const r of reviews) {
        const k = r.productId;
        if (!agg[k]) agg[k] = { sum: 0, count: 0 };
        agg[k].sum += Number(r.rating) || 0;
        agg[k].count += 1;
    }

    // Helper tạo mảng sao để view chỉ việc lặp (không khai báo biến)
    const makeStars = (avg: number) => {
        const rounded = Math.round(avg * 2) / 2; // làm tròn 0.5
        const full = Math.floor(rounded);
        const half = rounded - full === 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        const arr: Array<'full' | 'half' | 'empty'> = [];
        for (let i = 0; i < full; i++) arr.push('full');
        if (half) arr.push('half');
        for (let i = 0; i < empty; i++) arr.push('empty');
        return arr;
    };

    const productsWithRating = products.map((p: any) => {
        const a = agg[p.id];
        const count = a?.count ?? 0;
        const avg = count ? a!.sum / count : 0;
        return {
            ...p,
            ratingAvg: avg,
            ratingCount: count,
            starsArr: makeStars(avg), // 👈 chỉ cần dùng cái này ở view
        };
    });

    return res.render("product/filter.ejs", {
        products: productsWithRating,
        totalPages: +data.totalPages,
        page: +currentPage,
        factoryOptions: [
            { value: "APPLE", name: "Apple (MacBook)" },
            { value: "ASUS", name: "Asus" },
            { value: "LENOVO", name: "Lenovo" },
            { value: "DELL", name: "Dell" },
            { value: "LG", name: "LG" },
            { value: "ACER", name: "Acer" },
            { value: "HP", name: "HP" },
            { value: "MSI", name: "MSI" },
            { value: "GIGABYTE", name: "Gigabyte" },
            { value: "ALIENWARE", name: "Alienware" },
        ],
        precheckedFactories,
    });
};

const getRegisterPage = async (req: Request, res: Response) => {
    return res.render("client/auth/register.ejs",
        {
            errors: [],
            oldData: {}
        }
    );
}
// Hiển thị trang profile
const updateProfilePage = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Lấy ra và xoá liền
    const successMessage = req.session.successMessage || null;
    req.session.successMessage = null; // ✅ xoá ngay để reload lại không hiện nữa

    res.render("client/profiles/profile", {
        user,
        successMessage
    });
};

// Xử lý cập nhật profile
const handleUpdateProfile = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { fullName, phone, address } = req.body;
    let avatar = req.file ? req.file.filename : undefined;

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                fullName,
                phone,
                address,
                ...(avatar && { avatar })
            }
        });

        // Lưu thông báo vào session
        req.session.successMessage = "Cập nhật thông tin thành công!";

        res.redirect("/profile");
    } catch (error) {
        console.error(error);
        res.status(500).send("Lỗi khi cập nhật thông tin.");
    }
};

const ALLOW_USER_CANCEL = ["PENDING", "CONFIRMED"] as const;

const postCancelOrderByUser = async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    const reason = (req.body?.reason || req.body?.cancelReason || "").toString().trim();

    const order = await prisma.order.findFirst({
        where: { id: orderId, userId: (req.user as any).id },
        select: { id: true, status: true },
    });
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    if (!ALLOW_USER_CANCEL.includes(order.status as any)) {
        return res.status(400).json({ message: "Trạng thái hiện tại không cho phép hủy đơn" });
    }
    if (!reason) {
        return res.status(400).json({ message: "Vui lòng nhập lý do hủy" });
    }

    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: "CANCELED",
            cancelReason: reason,
        },
    });

    return res.json({ message: "Hủy đơn hàng thành công" });
};

const getUserOrders = async (req: Request, res: Response) => {
    try {
        const userId = req.user.id; // lấy từ passport
        const orders = await prisma.order.findMany({
            where: { userId },
            include: {
                orderDetails: {
                    include: { product: true }, // cần có relation product trong OrderDetail
                },
            },
            orderBy: { createdAt: "desc" },
        });

        res.render("client/order/orderuser.ejs", { user: req.user, orders });
    } catch (err) {
        console.error(" Lỗi lấy đơn hàng:", err);
        res.status(500).send("Có lỗi xảy ra khi tải đơn hàng");
    }
};

export { getHomePage, getCreateUserPage, postCreateUser, postDeleteUser, getViewUser, postUpdateUser, getProductFilterPage, getRegisterPage, updateProfilePage, handleUpdateProfile, postCancelOrderByUser, getUserOrders };