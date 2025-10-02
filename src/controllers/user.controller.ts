import { prisma } from 'config/client';
import { Request, Response } from 'express';
import { countTotalProductClientPages, getProducts } from 'services/client/item.service';
import { changeUserPassword, getAllRoles, getAllUsers, getUserById, handleCreateUser, handleDeleteUser, updateUserById, verifyPasswordByUserId } from 'services/user.service';
import bcrypt from 'bcrypt';


const getHomePage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;

    // Phân trang sản phẩm
    const pageSize = 8;
    const totalPages = await countTotalProductClientPages(pageSize);
    const products = await getProducts(currentPage, pageSize);

    // Sản phẩm khuyến mãi
    const promoProducts = await prisma.product.findMany({
        where: { discount: { gt: 0 } },
        take: 6,
        select: {
            id: true, name: true, price: true, discount: true,
            image: true, shortDesc: true, quantity: true
        },
    });

    // Blog
    const latestBlogs = await prisma.blog.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
            id: true, title: true, slug: true, thumbnail: true,
            author: true, createdAt: true, content: true
        },
    });

    // ===== Rating động (gom 1 lần) =====
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

    // ===== Sản phẩm đã xem (tối đa 5) + chuẩn hoá ảnh =====
    const KEY = "recent_products";
    let recentIds: number[] = [];
    try { recentIds = JSON.parse((req as any).cookies?.[KEY] || "[]"); } catch { }
    recentIds = recentIds.slice(0, 6);

    let recentProducts: Array<{ id: number; name: string; price: number; discount: number; finalPrice: number; thumb: string }> = [];
    if (recentIds.length) {
        // lấy full column để bắt mọi trường ảnh có thể có
        const rows = await prisma.product.findMany({ where: { id: { in: recentIds } } });

        const map = new Map(rows.map(r => [r.id, r]));

        const pickThumb = (r: any): string => {
            const cand =
                r?.image ||
                r?.imageUrl ||
                r?.thumbnail ||
                (Array.isArray(r?.images) ? r.images[0] : null) ||
                (typeof r?.gallery === "string"
                    ? r.gallery
                        .split(",")
                        .map((s: string) => s.trim())
                        .find(Boolean)
                    : null);

            if (!cand) return "/images/no-image.png";

            const s = String(cand).trim();

            // Giữ nguyên nếu là URL tuyệt đối hoặc đường dẫn tuyệt đối
            if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;

            // Nếu DB đã lưu dạng tương đối có thư mục (vd: "images/product/abc.jpg" hay "uploads/abc.jpg")
            if (s.includes("/")) return "/" + s.replace(/^\/+/, "");

            // 👉 Trường hợp chỉ là tên file: dùng đúng thư mục ảnh seed hiện tại
            return `/images/product/${s}`;
        };


        recentProducts = recentIds
            .map(id => {
                const r: any = map.get(id);
                if (!r) return null as any;
                const price = Number(r.price || 0);
                const discount = Number(r.discount || 0);
                const finalPrice = discount > 0
                    ? Math.max(0, price - Math.round(price * discount / 100))
                    : price;
                return {
                    id: r.id,
                    name: r.name,
                    price,
                    discount,
                    finalPrice,
                    thumb: pickThumb(r) // ✅ luôn có ảnh
                };
            })
            .filter(Boolean);
    }

    return res.render("client/home/show.ejs", {
        products: productsWithRating,
        totalPages,
        page: currentPage,
        promoProducts: promoWithRating,
        latestBlogs,
        recentProducts, // view dùng p.thumb
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
    const {
        page,
        factory = "",
        target = "",
        price = "",
        sort = "",
        q = "",
        // --- mới ---
        cpu = "",
        ram = "",
        storage = "",
        res: reso = "",
        screen = "",
        feature = "",
    } = req.query as any;

    // Pagination
    let currentPage = page ? parseInt(String(page), 10) : 1;
    if (!Number.isFinite(currentPage) || currentPage <= 0) currentPage = 1;
    const pageSize = 6;

    // helpers
    const parseCsv = (v: any) =>
        String(v || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

    const precheckedFactories = parseCsv(factory);

    // ===== Build where =====
    const where: any = {};
    const AND: any[] = [];

    // Hãng
    if (precheckedFactories.length) {
        where.factory = { in: precheckedFactories };
    }

    // Target
    if (target) {
        AND.push({ target: { contains: String(target) } });
    }

    // Tìm kiếm q
    if (q) {
        const kw = String(q).trim();
        if (kw) {
            where.OR = [
                { name: { contains: kw } },
                { factory: { contains: kw } },
                { shortDesc: { contains: kw } },
                { detailDesc: { contains: kw } },
            ];
        }
    }

    // ===== Giá: hỗ trợ nhiều khoảng (CSV) theo format controller đang dùng: "min-max", "min+", "<=max", ">=min"
    const priceTokens = parseCsv(price);
    if (priceTokens.length) {
        const OR: any[] = [];
        for (const token of priceTokens) {
            const s = token.trim();

            // "min-max"
            const range = s.match(/^(\d+)?\s*-\s*(\d+)?$/);
            if (range) {
                const min = range[1] ? parseInt(range[1], 10) : null;
                const max = range[2] ? parseInt(range[2], 10) : null;
                const cond: any = {};
                if (min !== null) cond.gte = min;
                if (max !== null) cond.lte = max;
                OR.push({ price: cond });
                continue;
            }
            // "min+"
            const minPlus = s.match(/^(\d+)\+$/);
            if (minPlus) {
                OR.push({ price: { gte: parseInt(minPlus[1], 10) } });
                continue;
            }
            // "<=max"
            const lte = s.match(/^<=?\s*(\d+)$/);
            if (lte) {
                OR.push({ price: { lte: parseInt(lte[1], 10) } });
                continue;
            }
            // ">=min"
            const gte = s.match(/^>=?\s*(\d+)$/);
            if (gte) {
                OR.push({ price: { gte: parseInt(gte[1], 10) } });
                continue;
            }
        }
        if (OR.length) AND.push({ OR });
    }

    // ======== Các filter mới ========

    // CPU (CSV token, ví dụ: I3,I5,I7,RYZEN5,M1,M2,M3...)
    const cpus = parseCsv(cpu);
    if (cpus.length) {
        AND.push({
            OR: cpus.map((c: string) => ({
                cpu: { contains: c }, // ví dụ "i5", "ryzen 7", "m2"
            })),
        });
    }

    // RAM (CSV số GB: 8,16,32...)
    const rams = parseCsv(ram)
        .map((n: string) => parseInt(n, 10))
        .filter((n: number) => Number.isFinite(n));
    if (rams.length) {
        AND.push({ ramGB: { in: rams } });
    }

    // STORAGE (CSV GB: 256,512,1024...) — tuỳ chọn: nếu bạn muốn filter theo loại, thêm param storageType
    const storages = parseCsv(storage)
        .map((n: string) => parseInt(n, 10))
        .filter((n: number) => Number.isFinite(n));
    if (storages.length) {
        AND.push({ storageGB: { in: storages } });
    }

    // RESOLUTION (CSV: FHD,QHD,4K)
    const resos = parseCsv(reso);
    if (resos.length) {
        AND.push({ screenResolution: { in: resos } });
    }

    // SCREEN SIZE bucket (CSV: "13-14","15-16","17-18")
    const screens = parseCsv(screen);
    if (screens.length) {
        const OR: any[] = [];
        for (const tk of screens) {
            const m = tk.match(/^(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)$/);
            if (m) {
                const min = parseFloat(m[1]);
                const max = parseFloat(m[3]);
                if (Number.isFinite(min) && Number.isFinite(max)) {
                    OR.push({ screenSizeInch: { gte: min, lte: max } });
                }
            }
        }
        if (OR.length) AND.push({ OR });
    }

    // FEATURES (CSV tokens: TOUCH,2IN1,TB4,FP,WEBCAM1080...)
    const features = parseCsv(feature).map((s) => s.toUpperCase());
    if (features.length) {
        AND.push({
            OR: features.map((f) => ({
                featureTags: { contains: `|${f}|` }, // an toàn do có delimiter
            })),
        });
    }

    if (AND.length) where.AND = AND;

    // ===== Sắp xếp: hỗ trợ cả "gia-tang-dan/gia-giam-dan" và "price_asc/price_desc"
    let orderBy: any = { id: "desc" as const };
    switch (String(sort).toLowerCase()) {
        case "price_asc":
        case "gia-tang-dan":
            orderBy = { price: "asc" };
            break;
        case "price_desc":
        case "gia-giam-dan":
            orderBy = { price: "desc" };
            break;
        case "best_seller":
            orderBy = [{ sold: "desc" as const }, { id: "desc" as const }];
            break;
        case "newest":
            orderBy = { id: "desc" };
            break;
    }

    // ===== Query
    const skip = (currentPage - 1) * pageSize;
    const [products, totalCount] = await prisma.$transaction([
        prisma.product.findMany({
            where,
            orderBy,
            skip,
            take: pageSize,
        }),
        prisma.product.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // ===== Ratings (giữ nguyên logic của bạn)
    const ids = products.map((p) => Number(p.id)).filter(Number.isFinite);
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
        const rounded = Math.round(avg * 2) / 2;
        const full = Math.floor(rounded);
        const half = rounded - full === 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        const arr: Array<"full" | "half" | "empty"> = [];
        for (let i = 0; i < full; i++) arr.push("full");
        if (half) arr.push("half");
        for (let i = 0; i < empty; i++) arr.push("empty");
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
            starsArr: makeStars(avg),
        };
    });

    return res.render("product/filter.ejs", {
        products: productsWithRating,
        totalPages,
        page: currentPage,
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
        q,
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
    const userId = (req as any).user?.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Lấy ra và xoá liền (success + error)
    const successMessage = (req.session as any).successMessage || null;
    const errorMessage = (req.session as any).errorMessage || null;
    (req.session as any).successMessage = null;
    (req.session as any).errorMessage = null;

    res.render("client/profiles/profile", {
        user,
        successMessage,
        errorMessage,
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

        // Lấy tất cả đơn theo thời gian tạo (mới nhất trước) để giữ thứ tự gốc cho "others"
        const allOrders = await prisma.order.findMany({
            where: { userId },
            include: {
                orderDetails: {
                    include: { product: true }, // cần có relation product trong OrderDetail
                },
            },
            orderBy: { createdAt: "desc" },
        });

        // Helper: thời điểm ưu tiên để sort trong nhóm DELIVERED
        const getSortTime = (o: any) =>
            new Date(o.deliveredAt ?? o.updatedAt ?? o.createdAt).getTime();

        // 1) Nhóm DELIVERED và sort "mới nhất trước"
        const delivered = allOrders
            .filter((o) => o.status === "DELIVERED")
            .sort((a, b) => getSortTime(b) - getSortTime(a));

        // 2) Các đơn còn lại: giữ nguyên thứ tự đã fetch (createdAt desc)
        const others = allOrders.filter((o) => o.status !== "DELIVERED");

        // 3) Ghép lại: DELIVERED trước, sau đó đến các trạng thái khác
        const sortedOrders = [...delivered, ...others];

        // Render ra view
        res.render("client/order/orderuser.ejs", { user: req.user, orders: sortedOrders });
    } catch (err) {
        console.error("Lỗi lấy đơn hàng:", err);
        res.status(500).send("Có lỗi xảy ra khi tải đơn hàng");
    }
};



const SALT_ROUNDS = 10;

// (tùy bạn đã có sẵn hay chưa)
const hashPassword = async (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
const comparePassword = async (plain: string, hashed: string) => bcrypt.compare(plain, hashed);

// ========== NEW: Đổi mật khẩu ==========
const postChangePassword = async (req: any, res: Response) => {
    try {
        const userId = req.user?.id;
        const { currentPassword, newPassword, confirmPassword } = req.body || {};

        if (!userId) return res.status(401).json({ ok: false, message: "Bạn cần đăng nhập." });

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ ok: false, message: "Thiếu dữ liệu bắt buộc." });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ ok: false, message: "Mật khẩu mới và xác nhận không khớp." });
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ ok: false, message: "Mật khẩu mới phải từ 8 ký tự trở lên." });
        }

        const user = await prisma.user.findUnique({
            where: { id: Number(userId) },
            select: { password: true },
        });
        if (!user) return res.status(404).json({ ok: false, message: "Tài khoản không tồn tại." });

        const ok = await comparePassword(String(currentPassword), String(user.password));
        if (!ok) return res.status(400).json({ ok: false, message: "Mật khẩu hiện tại không đúng." });

        const hashed = await hashPassword(String(newPassword));
        await prisma.user.update({
            where: { id: Number(userId) },
            data: { password: hashed },
        });

        // Nếu gọi bằng AJAX: trả JSON
        if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
            return res.json({ ok: true, message: "Đổi mật khẩu thành công." });
        }

        // Hoặc bạn vẫn muốn flow redirect + toast (dùng session message)
        (req.session as any).successMessage = "Đổi mật khẩu thành công!";
        return res.redirect("/profile");
    } catch (err) {
        console.error("postChangePassword error:", err);
        return res.status(500).json({ ok: false, message: "Lỗi server. Vui lòng thử lại." });
    }
};


export { getHomePage, getCreateUserPage, postCreateUser, postDeleteUser, getViewUser, postUpdateUser, getProductFilterPage, getRegisterPage, updateProfilePage, handleUpdateProfile, postCancelOrderByUser, getUserOrders, postChangePassword };