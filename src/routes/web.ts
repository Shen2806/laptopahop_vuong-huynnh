import express, { Express, Request, Response } from 'express';
import { getCreateUserPage, getHomePage, getProductFilterPage, getViewUser, postCreateUser, postDeleteUser, postUpdateUser, getRegisterPage, updateProfilePage, handleUpdateProfile, postCancelOrderByUser, getUserOrders } from 'controllers/user.controller';
import { getAdminOrderDetailPage, getAdminOrderPage, getAdminProductPage, getAdminUserPage, getDashboardPage, getPromoPage, postAddPromo, postCancelOrderByAdmin, postConfirmOrder, postDeletePromo, postRestockProduct, postUpdateOrderStatus, postUpdatePromo } from 'controllers/admin/dashboard.controller';
import fileUploadMiddleware from 'src/middleware/multer';
import { getCartPage, getCheckOutPage, getOrderHistoryPage, getProductPage, getThanksPage, postAddProductToCart, postAddToCartFromDetailPage, postDeleteProductInCart, postHandleCartToCheckOut, postPlaceOrder } from 'controllers/client/product.controller';
import { getAdminCreateProductPage, getViewProduct, postAdminCreateProduct, postDeleteProduct, postUpdateProduct } from 'controllers/admin/product.controller';
import { getAboutUsPage, getContactPage, getLoginPage, getPrivacyPage, getReturnPage, getSuccessRedirectPage, getSupportPage, getTermPage, getWarrantyPage, postLogin, postLogout, postRegister, refreshToken } from 'controllers/client/auth.controller';
import passport from 'passport';
import { ensureAuthenticated, isAdmin, isLogin } from 'src/middleware/auth';
import multer from 'multer';
import { prisma } from 'config/client';
import { getAdminBlogPage, getAdminCreateBlogPage, getAdminEditBlogPage, postAdminCreateBlog, postAdminUpdateBlog, postDeleteBlog } from 'controllers/admin/blog.controller';
import { getBlogDetailPage, getBlogListPage } from 'controllers/client/blog.controller';
import { deleteCoupon, getCoupons, getCreateCoupon, getEditCoupon, postCreateCoupon, postEditCoupon } from 'controllers/admin/coupon.controller';
import { generateAccessToken, generateRefreshToken } from 'services/client/token.service';

const router = express.Router();

const webRoutes = (app: Express) => {
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
    // GET /order-user
    router.get("/order-user", ensureAuthenticated, getUserOrders);
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
    // lịch sử mua hàng
    router.get("/order-history", getOrderHistoryPage)
    // hủy đơn hàng của khách hàng


    // Xử lý hủy đơn với lý do
    router.post("/order-history/:id/cancel", postCancelOrderByUser);
    // them trang chi tiet tu gio hang
    router.post("/add-to-cart-from-detail-page/:id", postAddToCartFromDetailPage)
    // admin routes
    router.get("/admin", getDashboardPage);
    // cập nhật số lượng sắp hết hàng
    router.post("/admin/product/restock", postRestockProduct);

    router.get("/admin/user", getAdminUserPage);
    router.post("/admin/handle-create-user", fileUploadMiddleware("avatar"), postCreateUser);
    router.get("/admin/create-user", getCreateUserPage);
    router.post("/admin/delete-user/:id", postDeleteUser);
    router.get("/admin/view-user/:id", getViewUser);
    router.post("/admin/update-user", fileUploadMiddleware("avatar"), postUpdateUser);

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
    app.use("/", isAdmin, router);

    // Blog routes - Client
    // Client Blog
    router.get("/blogs", getBlogListPage);
    router.get("/blogs/:slug", getBlogDetailPage);
    // routes cho client   
    app.use("/", router);


}

export default webRoutes;