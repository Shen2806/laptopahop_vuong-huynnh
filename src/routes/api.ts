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

import express, { Express } from 'express';
import { checkValidJWT } from 'src/middleware/jwt.middleware';

const router = express.Router();

const apiRoutes = (app: Express) => {
    // ------------------ Public routes ------------------
    router.post("/add-product-to-cart", postAddProductToCartAPI);
    router.post("/login", loginAPI);
    router.post("/login", postLogin);
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

    // ------------------ Mount router ------------------
    app.use("/api", router);
};

export default apiRoutes;
