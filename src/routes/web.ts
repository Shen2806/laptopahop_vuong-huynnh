import express, { Express } from 'express';
import { getCreateUserPage, getHomePage, getViewUser, postCreateUser, postDeleteUser, postUpdateUser } from 'controllers/user.controller';
import { getAdminOrderDetailPage, getAdminOrderPage, getAdminProductPage, getAdminUserPage, getDashboardPage } from 'controllers/admin/dashboard.controller';
import fileUploadMiddleware from 'src/middleware/multer';
import { getCartPage, getCheckOutPage, getOrderHistoryPage, getProductPage, getThanksPage, postAddProductToCart, postDeleteProductInCart, postHandleCartToCheckOut, postPlaceOrder } from 'controllers/client/product.controller';
import { getAdminCreateProductPage, getViewProduct, postAdminCreateProduct, postDeleteProduct, postUpdateProduct } from 'controllers/admin/product.controller';
import { getLoginPage, getRegisterPage, getSuccessRedirectPage, postLogout, postRegister } from 'controllers/client/auth.controller';
import passport from 'passport';
import { isAdmin, isLogin } from 'src/middleware/auth';

const router = express.Router();

const webRoutes = (app: Express) => {
    router.get("/", getHomePage);
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
    // admin routes
    router.get("/admin", getDashboardPage);
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
    app.use("/", isAdmin, router);
}

export default webRoutes;