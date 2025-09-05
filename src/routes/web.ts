import express, { Express, Request, Response } from 'express';
import { getCreateUserPage, getHomePage, getProductFilterPage, getViewUser, postCreateUser, postDeleteUser, postUpdateUser, getRegisterPage, updateProfilePage, handleUpdateProfile, postCancelOrderByUser } from 'controllers/user.controller';
import { getAdminOrderDetailPage, getAdminOrderPage, getAdminProductPage, getAdminUserPage, getDashboardPage, postCancelOrderByAdmin, postConfirmOrder, postRestockProduct } from 'controllers/admin/dashboard.controller';
import fileUploadMiddleware from 'src/middleware/multer';
import { getCartPage, getCheckOutPage, getOrderHistoryPage, getProductPage, getThanksPage, postAddProductToCart, postAddToCartFromDetailPage, postDeleteProductInCart, postHandleCartToCheckOut, postPlaceOrder } from 'controllers/client/product.controller';
import { getAdminCreateProductPage, getViewProduct, postAdminCreateProduct, postDeleteProduct, postUpdateProduct } from 'controllers/admin/product.controller';
import { getAboutUsPage, getContactPage, getLoginPage, getPrivacyPage, getReturnPage, getSuccessRedirectPage, getSupportPage, getTermPage, getWarrantyPage, postLogout, postRegister } from 'controllers/client/auth.controller';
import passport from 'passport';
import { isAdmin, isLogin } from 'src/middleware/auth';
import multer from 'multer';
import { prisma } from 'config/client';

const router = express.Router();

const webRoutes = (app: Express) => {
    router.get("/", getHomePage);
    router.get('/products', getProductFilterPage)
    router.get("/success-redirect", getSuccessRedirectPage);
    router.get("/product/:id", getProductPage);
    router.get("/login", getLoginPage);
    router.post('/login', passport.authenticate('local', {
        successRedirect: '/success-redirect',
        failureRedirect: '/login',
        failureMessage: true
    }));
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
    router.get("/admin/order", getAdminOrderPage);
    router.get("/admin/order/:id", getAdminOrderDetailPage);
    // xác nhận trạng thái đơn hàng
    router.post("/admin/order/:id/confirm", postConfirmOrder);
    router.post("/admin/order/:id/cancel", postCancelOrderByAdmin);
    app.use("/", isAdmin, router);
    // routes cho client
    app.use("/", router);


}

export default webRoutes;