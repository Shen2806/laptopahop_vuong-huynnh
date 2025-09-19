import { prisma } from 'config/client';
import { Request, Response } from 'express';
import { countTotalProductClientPages, getProducts } from 'services/client/item.service';
import { getProductWithFilter, getSortIncProduct, userFilter } from 'services/client/product.filter';
import { getAllRoles, getAllUsers, getUserById, handleCreateUser, handleDeleteUser, updateUserById } from 'services/user.service';


// const getHomePage = async (req: Request, res: Response) => {
//     const { page } = req.query;

//     let currentPage = page ? +page : 1;
//     if (currentPage <= 0) currentPage = 1;

//     // Lấy phân trang sản phẩm thường
//     const totalPages = await countTotalProductClientPages(8);
//     const products = await getProducts(currentPage, 8);

//     // Lấy sản phẩm khuyến mãi
//     const promoProducts = await prisma.product.findMany({
//         where: { discount: { gt: 0 } },
//         take: 6, // ví dụ: chỉ lấy 6 sp nổi bật
//         select: { id: true, name: true, price: true, discount: true, image: true }
//     });

//     return res.render("client/home/show.ejs", {
//         products,
//         totalPages: +totalPages,
//         page: +currentPage,
//         promoProducts // 👈 truyền thêm
//     });
// };

// getHomePage (bổ sung phần lấy blog & truyền vào render)
const getHomePage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;

    // Phân trang sản phẩm
    const totalPages = await countTotalProductClientPages(8);
    const products = await getProducts(currentPage, 8);

    // Sản phẩm khuyến mãi
    const promoProducts = await prisma.product.findMany({
        where: { discount: { gt: 0 } },
        take: 6,
        select: { id: true, name: true, price: true, discount: true, image: true }
    });

    // === Tin tức công nghệ (blog) ===
    const latestBlogs = await prisma.blog.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
            id: true,
            title: true,
            slug: true,
            thumbnail: true,
            author: true,
            createdAt: true,
            content: true, // dùng để rút gọn nếu không có summary
        },
    });

    return res.render("client/home/show.ejs", {
        products,
        totalPages: +totalPages,
        page: +currentPage,
        promoProducts,
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

const getProductFilterPage = async (req: Request, res: Response) => {
    const { page, factory = "", target = "", price = "", sort = "", } = req.query as {
        page?: string,
        factory: string,
        target: string,
        price: string,
        sort: string
    };

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    // const totalPages = await countTotalProductClientPages(6);
    // const products = await getProducts(currentPage, 6);
    const data = await getProductWithFilter(currentPage, 6, factory, target, price, sort)
    return res.render("product/filter.ejs", {
        products: data.products,
        totalPages: +data.totalPages,
        page: +currentPage

    });


    // const { username } = req.query;
    // const users = await userFilter(username as string)

    // const { minPrice, maxPrice, factory, price, sort } = req.query

    // const products = await getMinPrice(+minPrice);
    // const products = await getMaxPrice(+maxPrice);
    // const products = await getFactory(factory as string);
    // const products = await getManyFactory((factory as string).split(","));
    // const products = await getAboutPrice(10000000, 15000000);
    // const products = await getRangePrice();
    // const products = await getSortIncProduct();
    // res.status(200).json({
    //     data: products
    // })
}
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
// const postCancelOrderByUser = async (req: Request, res: Response) => {
//     const { id } = req.params;
//     const { reason } = req.body; // lấy lý do từ fetch

//     try {
//         await prisma.order.update({
//             where: { id: +id },
//             data: {
//                 status: "CANCELED",
//                 cancelReason: reason || "Không có lý do"
//             }
//         });
//         return res.json({ success: true, message: "Hủy đơn hàng thành công!" });
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ success: false, message: "Lỗi hủy đơn" });
//     }
// };

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