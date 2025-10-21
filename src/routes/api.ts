import {
    createUserAPI,
    deleteUserByIdAPI,
    fetchAccountAPI,
    getAllUsersAPI,
    getUsersByIdAPI,
    loginAPI,
    postAddProductToCartAPI,
    updateUserByIdAPI
} from 'controllers/client/api.controller';
import { postLogin, refreshToken } from 'controllers/client/auth.controller';
import { getProductQuestionsAPI, postAdminReplyAPI, postProductQuestionAPI } from 'controllers/client/qa.controller';
import { searchProductsJson, suggestProducts } from 'controllers/client/search.controller';
import { Express, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import express from 'express';
import { checkValidJWT } from 'src/middleware/jwt.middleware';

const router = express.Router();

const apiRoutes = (app: Express) => {
    // ------------------ Public routes ------------------
    router.post("/add-product-to-cart", checkValidJWT, postAddProductToCartAPI);
    router.post("/login", loginAPI);
    // router.post("/login", postLogin);
    router.post("/refresh", refreshToken);



    // ------------------ Protected routes ------------------
    // Các API này yêu cầu đăng nhập
    router.get("/users", checkValidJWT, getAllUsersAPI);
    router.get("/users/:id", checkValidJWT, getUsersByIdAPI);
    router.post("/users", checkValidJWT, createUserAPI);
    router.put("/users/:id", checkValidJWT, updateUserByIdAPI);
    router.delete("/users/:id", checkValidJWT, deleteUserByIdAPI);

    router.get("/account", checkValidJWT, fetchAccountAPI);

    // Q&A public GET
    router.get("/products/:id/questions", getProductQuestionsAPI);
    // Q&A: user hỏi
    router.post("/products/:id/questions", checkValidJWT, postProductQuestionAPI);
    // Q&A: admin trả lời
    router.post("/questions/:id/replies", checkValidJWT, postAdminReplyAPI);
    router.get('/cart/count', checkValidJWT, async (req: any, res) => {
        res.set('Cache-Control', 'no-store'); // 👈
        const uid = Number(req.user?.id);
        if (!uid) return res.status(401).json({ message: 'Unauthorized' });

        const cart = await prisma.cart.findFirst({
            where: { userId: uid /*, status: 'OPEN'*/ },
            orderBy: { id: 'desc' },
            select: { id: true }
        });

        let count = 0;
        if (cart) {
            const agg = await prisma.cartDetail.aggregate({
                where: { cartId: cart.id }, _sum: { quantity: true }
            });
            count = Number(agg._sum.quantity || 0);
        }
        res.json({ ok: true, count });
    });

    // 🔎 Search APIs
    app.get("/api/suggest", suggestProducts);
    app.get("/api/search", searchProductsJson);
    // API MUA NGAY: lưu "đơn tạm" vào session, không động vào giỏ
    app.post('/api/buy-now', async (req: Request, res: Response) => {
        try {
            const { productId, quantity } = req.body || {};
            const pid = Number(productId);
            const qty = Number(quantity);

            if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(qty) || qty <= 0) {
                return res.status(400).json({ message: 'Dữ liệu không hợp lệ.' });
            }

            // (Tuỳ bạn) Nếu bắt buộc đăng nhập thì kiểm tra:
            // if (!req.user) return res.status(401).json({ message: 'Bạn cần đăng nhập.' });

            const p = await prisma.product.findUnique({
                where: { id: pid },
                select: { id: true, name: true, price: true, discount: true, quantity: true, image: true }
            });
            if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });

            if (Number(p.quantity) < qty) {
                return res.status(400).json({ message: 'Số lượng vượt quá tồn kho.' });
            }

            // Lưu "ticket Mua ngay" vào session (đơn mặt hàng đơn lẻ)
            req.session.buyNow = {
                productId: p.id,
                quantity: qty,
                at: Date.now()
            };

            return res.json({ ok: true, redirect: '/checkout?mode=buy' });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    });
    // API đánh giá sản phẩm

    // ------------------ Mount router ------------------
    app.use("/api", router);
};

export default apiRoutes;
