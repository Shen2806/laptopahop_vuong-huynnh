import express, { CookieOptions, Express } from 'express';
import { getCreateUserPage, getHomePage, getProductFilterPage, getViewUser, postCreateUser, postDeleteUser, postUpdateUser, getRegisterPage, updateProfilePage, handleUpdateProfile, postCancelOrderByUser, getUserOrders, postChangePassword } from 'controllers/user.controller';
import 'dotenv/config';
import { getAdminOrderDetailPage, getAdminOrderPage, getAdminProductPage, getAdminUserPage, getDashboardPage, getPromoPage, postAddPromo, postCancelOrderByAdmin, postConfirmOrder, postDeletePromo, postRestockProduct, postUpdateOrderStatus, postUpdatePromo } from 'controllers/admin/dashboard.controller';
import fileUploadMiddleware from 'src/middleware/multer';
import { getCartPage, getCheckOutPage, getOrderDetailPage, getOrderHistoryPage, getProductPage, getThanksPage, postAddProductToCart, postAddToCartFromDetailPage, postDeleteProductInCart, postHandleCartToCheckOut, postPlaceOrder } from 'controllers/client/product.controller';
import { getAdminCreateProductPage, getViewProduct, postAdminCreateProduct, postDeleteProduct, postUpdateProduct } from 'controllers/admin/product.controller';
import { getAboutUsPage, getContactPage, getLoginPage, getPrivacyPage, getReturnPage, getSuccessRedirectPage, getSupportPage, getTermPage, getWarrantyPage, postLogin, postLogout, postRegister, refreshToken } from 'controllers/client/auth.controller';
import passport from 'passport';
import { ensureAuthenticated, isAdmin, isAdminOrStaff, isLogin } from 'src/middleware/auth';
import multer from 'multer';
import { prisma } from 'config/client';
import { getAdminBlogPage, getAdminCreateBlogPage, getAdminEditBlogPage, postAdminCreateBlog, postAdminUpdateBlog, postDeleteBlog } from 'controllers/admin/blog.controller';
import { getBlogDetailPage, getBlogListPage } from 'controllers/client/blog.controller';
import { deleteCoupon, getCoupons, getCreateCoupon, getEditCoupon, postCreateCoupon, postEditCoupon } from 'controllers/admin/coupon.controller';
import { generateAccessToken, generateRefreshToken } from 'services/client/token.service';
import { getAdminChatSessions, getChatMessages } from 'controllers/admin/chat.controller';
import { getProductReviews, getProductReviewSummary, postCreateReview } from 'controllers/client/review.controller';
import { adminAnswerQuestionAPI, adminListQuestionsAPI, getAdminQAPage } from 'controllers/admin/qa.controller';
import { getUserWithRoleById } from 'services/client/auth.service';
import { adminInventoryAdjustAPI, adminInventoryListAPI, adminInventoryPage, adminInventorySetReorderAPI } from 'controllers/admin/inventory.controller';
import { getComparePage } from 'controllers/client/compare.controller';
import { getAdminStaffPage, getCreateStaffPage, getViewStaff, postCreateStaff, postDeleteStaff, postUpdateStaff } from 'controllers/admin/staff.controller';
import { requirePerm } from 'src/middleware/requirePerm';
import { exposePermsToView } from 'src/middleware/exposePermsToView';
import { attachPermissions } from 'src/middleware/attachPermissions';
import { assignShipper } from 'services/admin/staff.service';

const router = express.Router();

const webRoutes = (app: Express) => {

    const isProd = process.env.NODE_ENV === 'production';
    const cookieBase: CookieOptions = {
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        path: '/',
    };


    // Step 1: redirect to Google via Passport
    router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));


    // Step 2: Google callback → req.user is set by Passport
    router.get('/auth/google/callback', (req, res, next) => {
        passport.authenticate('google', async (err, user: any) => {
            if (err || !user) {
                console.error('[Google OAuth ERROR]', err);
                return res.redirect('/login');
            }
            req.logIn(user, async (err2) => {
                if (err2) return next(err2);
                const full = await getUserWithRoleById(user.id);
                const safe = full || user;
                const at = generateAccessToken(safe);
                const rt = generateRefreshToken(safe);
                res.cookie('access_token', at, { ...cookieBase, maxAge: 15 * 60 * 1000 });
                res.cookie('refresh_token', rt, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
                return res.redirect('/success-redirect');
            });
        })(req, res, next);
    });

    // các route web khác
    router.get("/", getHomePage);
    router.get('/products', getProductFilterPage)
    router.get("/success-redirect", getSuccessRedirectPage);
    router.get("/product/:id", getProductPage);
    // GET /login
    router.get("/login", getLoginPage);
    router.post("/api/refresh", refreshToken);
    // POST /login (custom callback để save session trước redirect)
    // web.ts

    router.post("/login", (req, res, next) => {
        passport.authenticate("local", async (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                const msg = (info && (info as any).message) || "Tài khoản/Mật khẩu không hợp lệ !";
                (req.session as any).messages = [msg];
                (req.session as any).oldData = { username: req.body.username || "" };
                return req.session.save(() => res.redirect("/login"));
            }

            req.logIn(user, async (err2) => {
                if (err2) return next(err2);

                // Lấy user đầy đủ (có role) nếu cần
                const fullUser = await prisma.user.findUnique({
                    where: { id: (user as any).id },
                    include: { role: true },
                });

                const accessToken = generateAccessToken(fullUser);
                const refreshToken = generateRefreshToken(fullUser);

                const baseCookie = {
                    httpOnly: true,
                    path: "/",
                    // Dev cùng origin: dùng 'lax'; nếu FE khác origin, dùng 'none' + secure: true
                    sameSite: "lax" as const,
                    secure: false, // đổi true khi dùng HTTPS hoặc cross-site
                };

                res.cookie("access_token", accessToken, { ...baseCookie, maxAge: 15 * 60 * 1000 });
                res.cookie("refresh_token", refreshToken, { ...baseCookie, maxAge: 7 * 24 * 60 * 60 * 1000 });

                return res.redirect("/success-redirect");
            });
        })(req, res, next);
    });


    // (Tùy chọn) Mount API login trả JSON ở endpoint khác, tránh đụng form
    router.post("/api/login", postLogin);

    router.post("/logout", postLogout)
    router.get("/register", getRegisterPage);
    router.post("/register", postRegister);

    //cập nhật thông tin hồ sơ
    const storage = multer.diskStorage({
        destination: function (req, file, callback) {
            callback(null, "public/images"); // thư mục lưu avatar
        },
        filename: function (req, file, callback) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
            callback(null, uniqueSuffix + "-" + file.originalname);
        }
    });

    const upload = multer({ storage: storage });
    // GET profile page
    router.get("/profile", updateProfilePage);

    // POST update profile
    router.post("/profile/update", upload.single("avatar"), handleUpdateProfile);
    // NEW: đổi mật khẩu (cần đăng nhập)
    router.post("/profile/change-password", ensureAuthenticated, postChangePassword);
    //  lịch sử mua hàng
    router.get("/order-history", ensureAuthenticated, getUserOrders);
    // Chính sách sử dụng
    router.get("/terms", getTermPage);
    // Chính sách bảo hành
    router.get("/warranty", getWarrantyPage);
    // Chính sách đổi trả
    router.get("/return", getReturnPage);
    // Chính sách bảo mật 
    router.get("/privacy", getPrivacyPage);

    // Liên hệ
    router.get("/contact", getContactPage);

    // Giới thiệu
    router.get("/about", getAboutUsPage);
    // Hỗ trợ
    router.get("/support", getSupportPage);

    // Them san pham vao gio hang
    router.post("/add-product-to-cart/:id", postAddProductToCart)
    // Xoa san pham tu gio hang
    router.post("/delete-product-in-cart/:id", postDeleteProductInCart)
    // Xac nhan dat hang
    router.get("/checkout", getCheckOutPage)
    // Cap nhat gio hang truoc khi thanh toan
    router.post("/handle-cart-to-checkout", postHandleCartToCheckOut)
    //xem gio hang
    router.get("/cart", getCartPage)
    // thanh toan san pham
    router.post("/place-order", postPlaceOrder)
    // cam on mua hang
    router.get("/thanks", getThanksPage)
    // GET /order-user
    router.get("/order-user", getOrderHistoryPage)
    // chi tiết đơn hàng của user
    router.get("/order/:id", ensureAuthenticated, getOrderDetailPage);

    // Blog routes - Client
    router.get("/blogs", getBlogListPage);
    router.get("/blogs/:slug", getBlogDetailPage);

    // Xử lý hủy đơn với lý do
    router.post("/order-history/:id/cancel", postCancelOrderByUser);
    // them trang chi tiet tu gio hang
    router.post("/add-to-cart-from-detail-page/:id", postAddToCartFromDetailPage)

    // Lấy avg rating + count + Q&A (public)
    router.get("/api/products/:productId/meta", async (req, res) => {
        const productId = Number(req.params.productId);
        if (!Number.isFinite(productId)) return res.status(400).json({ message: "invalid productId" });

        const [agg, dist, qna] = await Promise.all([
            prisma.review.aggregate({
                _avg: { rating: true },
                _count: true,
                where: { productId },
            }),
            prisma.review.groupBy({
                by: ["rating"],
                _count: { rating: true },
                where: { productId },
            }),
            prisma.productQuestion.findMany({
                where: { productId },
                orderBy: { createdAt: "desc" },
                include: { user: true, replies: { orderBy: { createdAt: "asc" } } },
            }),
        ]);

        res.json({
            ratingAvg: Number(agg._avg.rating ?? 0).toFixed(1),
            ratingCount: agg._count,
            distribution: Object.fromEntries(dist.map(d => [d.rating, d._count.rating])),
            qna,
        });
    });

    // Gửi review (cần login)
    router.post("/api/products/:productId/reviews", ensureAuthenticated, async (req: any, res) => {
        const productId = Number(req.params.productId);
        const { rating, comment } = req.body || {};
        if (!Number.isFinite(productId) || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "rating 1..5" });
        }
        await prisma.review.create({
            data: { productId, userId: req.user.id, rating: Number(rating), comment: String(comment || "") },
        });
        const agg = await prisma.review.aggregate({
            _avg: { rating: true }, _count: true, where: { productId },
        });
        res.json({
            ratingAvg: Number(agg._avg.rating ?? 0).toFixed(1),
            ratingCount: agg._count,
        });
    });

    // Đặt câu hỏi (cần login)
    router.post("/api/products/:productId/questions", ensureAuthenticated, async (req: any, res) => {
        const productId = Number(req.params.productId);
        const content = String(req.body?.content || "").trim();
        if (!content) return res.status(400).json({ message: "content required" });
        const q = await prisma.productQuestion.create({
            data: { productId, userId: req.user.id, content },
            include: { user: true, replies: true },
        });
        res.json(q);
    });

    // Trả lời câu hỏi (CHỈ ADMIN)
    router.post("/api/products/questions/:questionId/replies", ensureAuthenticated, async (req: any, res) => {
        const questionId = Number(req.params.questionId);
        const content = String(req.body?.content || "").trim();
        // chỉ admin
        if (req.user?.role?.name !== "ADMIN") {
            return res.status(403).json({ message: "Chỉ Admin được trả lời câu hỏi" });
        }
        if (!content) return res.status(400).json({ message: "content required" });

        const rep = await prisma.productQuestionReply.create({
            data: { questionId, userId: req.user.id, role: "ADMIN", content },
        });
        res.json(rep);
    });


    // Lấy lịch sử tin nhắn (user & admin dùng chung)
    router.get("/api/chat/sessions/:id/messages", async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });
        const messages = await prisma.chatMessage.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: "asc" },
        });
        res.json(messages);
    });


    // Lấy danh sách review (ai đăng nhập cũng thấy)
    router.get("/api/products/:productId/reviews", async (req, res) => {
        const productId = Number(req.params.productId);
        const reviews = await prisma.review.findMany({
            where: { productId },
            orderBy: { createdAt: "desc" },
            include: { user: true },
        });
        res.json(reviews.map(r => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
            user: {
                id: r.userId,
                name: r.user?.fullName || r.user?.username || `User #${r.userId}`,
                avatar: r.user?.avatar || null,
            }
        })));
    });

    // Upsert review (nếu đã có -> update; chưa có -> create)
    router.post("/api/products/:productId/reviews", ensureAuthenticated, async (req: any, res) => {
        const productId = Number(req.params.productId);
        const { rating, comment } = req.body || {};
        if (!Number.isFinite(productId) || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "rating 1..5" });
        }
        const existing = await prisma.review.findFirst({
            where: { productId, userId: req.user.id },
            select: { id: true },
        });
        if (existing) {
            await prisma.review.update({
                where: { id: existing.id },
                data: { rating: Number(rating), comment: String(comment || "") },
            });
        } else {
            await prisma.review.create({
                data: { productId, userId: req.user.id, rating: Number(rating), comment: String(comment || "") },
            });
        }
        const agg = await prisma.review.aggregate({
            _avg: { rating: true }, _count: true, where: { productId },
        });
        res.json({
            ok: true,
            ratingAvg: Number(agg._avg.rating ?? 0).toFixed(1),
            ratingCount: agg._count,
        });
    });

    router.get("/api/products/:id/reviews", getProductReviews);
    router.get("/api/products/:id/reviews/summary", getProductReviewSummary);
    router.post("/api/products/:id/reviews", ensureAuthenticated, postCreateReview);

    // So sánh sản phẩm
    router.get("/compare", getComparePage);
    // API lấy danh sách tỉnh/thành


    // ====== ADMIN GUARD CHO TOÀN NHÁNH /admin ======
    // ====== ADMIN GUARD CHO TOÀN NHÁNH /admin ======
    router.use('/admin', isAdminOrStaff, attachPermissions, exposePermsToView);

    // Dashboard
    router.get("/admin", /* tuỳ bạn muốn requirePerm hay miễn */ getDashboardPage);

    // Chat admin demo
    router.get("/admin/chat", requirePerm("chat.view"), (req, res) => res.render("admin/chat/index.ejs"));
    router.get("/admin/api/chat/sessions", requirePerm("chat.view"), async (req, res) => {
        const sessions = await prisma.chatSession.findMany({
            where: { status: "OPEN" },
            orderBy: { createdAt: "desc" },
        });
        // tính unread theo góc nhìn ADMIN (tin từ USER, isRead=false)
        const result = await Promise.all(sessions.map(async s => {
            const unread = await prisma.chatMessage.count({
                where: { sessionId: s.id, sender: "USER", isRead: false },
            });
            return { ...s, unread };
        }));
        res.json(result);
    });

    // cập nhật số lượng sắp hết hàng
    router.post("/admin/product/restock", postRestockProduct);

    // Users (khách hàng)
    router.get("/admin/user", requirePerm("customer.view"), getAdminUserPage);
    router.post("/admin/handle-create-user", requirePerm("customer.update"), fileUploadMiddleware("avatar"), postCreateUser);
    router.get("/admin/create-user", requirePerm("customer.update"), getCreateUserPage);
    router.post("/admin/delete-user/:id", requirePerm("customer.update"), postDeleteUser);
    router.get("/admin/view-user/:id", requirePerm("customer.update"), getViewUser);
    router.post("/admin/update-user", requirePerm("customer.update"), fileUploadMiddleware("avatar"), postUpdateUser);

    // Staff (chỉ role có staff.* — ADMIN mặc định có "*")
    router.get("/admin/staff", requirePerm("staff.view"), getAdminStaffPage);
    router.get("/admin/create-staff", requirePerm("staff.create"), getCreateStaffPage);
    router.post("/admin/handle-create-staff", requirePerm("staff.create"), fileUploadMiddleware("avatar"), postCreateStaff);
    router.get("/admin/view-staff/:id", requirePerm("staff.update"), getViewStaff);
    router.post("/admin/update-staff", requirePerm("staff.update"), fileUploadMiddleware("avatar"), postUpdateStaff);
    router.post("/admin/delete-staff/:id", requirePerm("staff.delete"), postDeleteStaff);

    // bên sản phẩm
    router.get("/admin/product", getAdminProductPage);
    router.get('/admin/create-product', getAdminCreateProductPage)
    router.post('/admin/create-product', fileUploadMiddleware("image", "images/product"), postAdminCreateProduct)
    router.post("/admin/delete-product/:id", postDeleteProduct);
    router.get("/admin/view-product/:id", getViewProduct);
    router.post("/admin/update-product", fileUploadMiddleware("image", "images/product"), postUpdateProduct);
    // Blog routes - Admin
    router.get("/admin/blog", getAdminBlogPage);
    router.get("/admin/create-blog", getAdminCreateBlogPage);
    router.post("/admin/create-blog", fileUploadMiddleware("thumbnail", "images/blog"), postAdminCreateBlog);
    router.get("/admin/edit-blog/:id", getAdminEditBlogPage);
    router.post("/admin/update-blog", fileUploadMiddleware("thumbnail", "images/blog"), postAdminUpdateBlog);
    router.post("/admin/delete-blog/:id", postDeleteBlog);

    // Promo routes - Admin
    router.get("/admin/promo", getPromoPage);
    router.post("/admin/promo/add", postAddPromo);
    router.post("/admin/promo/update/:id", postUpdatePromo);
    router.post("/admin/promo/delete/:id", postDeletePromo);

    // coupon route - admin
    router.get("/admin/coupon", getCoupons);
    router.get("/admin/coupon/create", getCreateCoupon);
    router.post("/admin/coupon/create", postCreateCoupon);
    router.get("/admin/coupon/edit/:id", getEditCoupon);
    router.post("/admin/coupon/edit/:id", postEditCoupon);
    router.get("/admin/coupon/delete/:id", deleteCoupon);


    router.get("/admin/order", getAdminOrderPage);
    router.get("/admin/order/:id", getAdminOrderDetailPage);
    // xác nhận trạng thái đơn hàng
    router.post("/admin/order/:id/confirm", postConfirmOrder);
    router.post("/admin/order/:id/cancel", postCancelOrderByAdmin);
    router.post("/admin/order/:id/status", postUpdateOrderStatus);
    router.post("/admin/order/:id/assign-shipper", assignShipper);
    // app.use("/", isAdmin, router);
    // Admin chat
    router.get("/admin/chat", isAdmin, (req, res) => res.render("admin/chat/index.ejs"));
    router.get("/admin/api/chat/sessions", isAdmin, async (req, res) => {
        const list = await prisma.chatSession.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } });
        res.json(list);
    });
    // API lấy danh sách phiên chat (cần login & là admin)
    router.get("/admin/api/chat/sessions", getAdminChatSessions); // add isAdmin nếu muốn
    router.get("/api/chat/sessions/:id/messages", getChatMessages); // có thể thêm isAdmin nếu muốn

    // ... bên dưới các route admin khác:
    router.get("/admin/qa", getAdminQAPage);
    router.get("/admin/api/qa/questions", adminListQuestionsAPI);
    router.post("/admin/api/qa/questions/:id/answer", adminAnswerQuestionAPI);

    // quản lý tồn kho
    router.get("/admin/inventory", adminInventoryPage);
    // APIs quản lý tồn kho (admin)
    router.get("/admin/api/inventory", adminInventoryListAPI);
    router.post("/admin/api/inventory/adjust", adminInventoryAdjustAPI);
    router.post("/admin/api/inventory/reorder", adminInventorySetReorderAPI);

    // routes cho client   
    app.use("/", router);


}

export default webRoutes;