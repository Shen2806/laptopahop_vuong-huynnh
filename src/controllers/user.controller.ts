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

    // ===== Giá (hỗ trợ nhiều token)
    const priceTokens = parseCsv(price);
    if (priceTokens.length) {
        const OR: any[] = [];
        for (const token of priceTokens) {
            const s = token.trim();

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
            const minPlus = s.match(/^(\d+)\+$/);
            if (minPlus) {
                OR.push({ price: { gte: parseInt(minPlus[1], 10) } });
                continue;
            }
            const lte = s.match(/^<=?\s*(\d+)$/);
            if (lte) {
                OR.push({ price: { lte: parseInt(lte[1], 10) } });
                continue;
            }
            const gte = s.match(/^>=?\s*(\d+)$/);
            if (gte) {
                OR.push({ price: { gte: parseInt(gte[1], 10) } });
                continue;
            }
        }
        if (OR.length) AND.push({ OR });
    }

    // ===== Các filter mới
    const cpus = parseCsv(cpu);
    if (cpus.length) {
        AND.push({
            OR: cpus.map((c: string) => ({ cpu: { contains: c } })),
        });
    }

    const rams = parseCsv(ram).map((n: string) => parseInt(n, 10)).filter(Number.isFinite);
    if (rams.length) AND.push({ ramGB: { in: rams } });

    const storages = parseCsv(storage).map((n: string) => parseInt(n, 10)).filter(Number.isFinite);
    if (storages.length) AND.push({ storageGB: { in: storages } });

    const resos = parseCsv(reso);
    if (resos.length) AND.push({ screenResolution: { in: resos } });

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

    const features = parseCsv(feature).map((s) => s.toUpperCase());
    if (features.length) {
        AND.push({
            OR: features.map((f) => ({ featureTags: { contains: `|${f}|` } })),
        });
    }

    if (AND.length) where.AND = AND;

    // ===== Sắp xếp
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
        prisma.product.findMany({ where, orderBy, skip, take: pageSize }),
        prisma.product.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // ===== Ratings
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
        return { ...p, ratingAvg: avg, ratingCount: count, starsArr: makeStars(avg) };
    });

    // ===== NEW: build query-string KHÔNG gồm page để gắn vào link phân trang
    const { page: _p, ...rest } = req.query as any;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(rest)) {
        if (v == null || v === "") continue;
        if (Array.isArray(v)) {
            v.forEach((x) => {
                if (x != null && String(x).trim() !== "") sp.append(k, String(x));
            });
        } else {
            sp.append(k, String(v));
        }
    }
    const qsNoPage = sp.toString(); // ví dụ: "factory=ASUS&cpu=i5&price=10000000-15000000"

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
        qsNoPage, // <-- thêm biến này để view dùng khi render phân trang
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
    // Lấy user từ passport (hoặc middleware auth của bạn)
    const authUser = (req as any).user;
    const userId = authUser?.id ? Number(authUser.id) : null;

    // Nếu chưa đăng nhập hoặc id không hợp lệ -> cho quay về trang login (tuỳ bạn muốn redirect đi đâu)
    if (!userId || !Number.isFinite(userId)) {
        (req.session as any).errorMessage = "Bạn cần đăng nhập để xem trang này.";
        return res.redirect("/login"); // nếu route login khác thì đổi lại
    }

    // Lúc này chắc chắn đã có userId là number
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    // Lấy ra message từ session rồi clear
    const successMessage = (req.session as any).successMessage || null;
    const errorMessage = (req.session as any).errorMessage || null;
    (req.session as any).successMessage = null;
    (req.session as any).errorMessage = null;

    return res.render("client/profiles/profile", {
        user,
        successMessage,
        errorMessage,
    });
};


// Xử lý cập nhật profile
const handleUpdateProfile = async (req: Request, res: Response) => {
    const authUser = (req as any).user;
    const userId = authUser?.id ? Number(authUser.id) : null;

    console.log('--- DEBUG PROFILE UPDATE ---');
    console.log('body =', req.body);
    console.log('file =', req.file);

    if (!userId || !Number.isFinite(userId)) {
        return res.status(401).send("Bạn cần đăng nhập.");
    }

    const { fullName, phone, address } = req.body;
    const avatar = req.file?.filename;

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                fullName,
                phone,
                address,
                ...(avatar && { avatar }),
            },
        });

        (req.session as any).successMessage = "Cập nhật thông tin thành công!";
        return res.redirect("/profile");
    } catch (error) {
        console.error(error);
        (req.session as any).errorMessage = "Lỗi khi cập nhật thông tin.";
        return res.redirect("/profile");
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
        const userId = (req as any).user.id; // lấy từ passport

        // Lấy tất cả đơn theo thời gian tạo (mới nhất trước) để giữ thứ tự gốc cho "others"
        const allOrders = await prisma.order.findMany({
            where: { userId },
            include: {
                orderDetails: {
                    // cần productId và product để render
                    select: {
                        id: true,
                        productId: true,
                        quantity: true,
                        price: true,
                        product: { select: { id: true, name: true, image: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        // --- BỔ SUNG: gắn cờ đã đánh giá cho từng item ---
        // Gom tất cả productId xuất hiện trong các đơn
        const productIds: number[] = [];
        for (const o of allOrders) {
            for (const it of o.orderDetails) {
                const pid = it.productId ?? it.product?.id;
                if (pid) productIds.push(pid);
            }
        }
        const uniqProductIds = Array.from(new Set(productIds));

        // Lấy các productId mà user đã review
        let reviewedSet = new Set<number>();
        if (uniqProductIds.length) {
            const reviewed = await prisma.review.findMany({
                where: { userId, productId: { in: uniqProductIds } },
                select: { productId: true },
            });
            reviewedSet = new Set(reviewed.map(r => r.productId));
        }

        // Gắn hasReviewed vào từng orderDetail
        const ordersWithFlags = allOrders.map(o => ({
            ...o,
            orderDetails: o.orderDetails.map(it => {
                const pid = it.productId ?? it.product?.id ?? 0;
                return { ...it, hasReviewed: reviewedSet.has(pid) };
            }),
        }));

        // Helper: thời điểm ưu tiên để sort trong nhóm DELIVERED
        const getSortTime = (o: any) =>
            new Date(o.deliveredAt ?? o.updatedAt ?? o.createdAt).getTime();

        // 1) Nhóm DELIVERED và sort "mới nhất trước"
        const delivered = ordersWithFlags
            .filter(o => o.status === "DELIVERED")
            .sort((a, b) => getSortTime(b) - getSortTime(a));

        // 2) Các đơn còn lại: giữ nguyên thứ tự đã fetch (createdAt desc)
        const others = ordersWithFlags.filter(o => o.status !== "DELIVERED");

        // 3) Ghép lại: DELIVERED trước, sau đó đến các trạng thái khác
        const sortedOrders = [...delivered, ...others];

        // Render ra view (KHÔNG đổi các biến truyền xuống)
        res.render("client/order/orderuser.ejs", {
            user: (req as any).user,
            orders: sortedOrders,
        });
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