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

import express, { Express } from 'express';
import { checkValidJWT } from 'src/middleware/jwt.middleware';

const router = express.Router();

const apiRoutes = (app: Express) => {
    // ------------------ Public routes ------------------
    router.post("/add-product-to-cart", postAddProductToCartAPI);
    router.post("/login", loginAPI);



    // ------------------ Protected routes ------------------
    // Các API này yêu cầu đăng nhập
    router.get("/users", checkValidJWT, getAllUsersAPI);
    router.get("/users/:id", checkValidJWT, getUsersByIdAPI);
    router.post("/users", checkValidJWT, createUserAPI);
    router.put("/users/:id", checkValidJWT, updateUserByIdAPI);
    router.delete("/users/:id", checkValidJWT, deleteUserByIdAPI);

    router.get("/account", checkValidJWT, fetchAccountAPI);

    // ------------------ Mount router ------------------
    app.use("/api", checkValidJWT, router);
};

export default apiRoutes;
