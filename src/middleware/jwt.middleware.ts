

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

// checkValidJWT: dùng cho API (REST)
const checkValidJWT = (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const whiteList = ["/login", "/register", "/add-product-to-cart"];
    if (whiteList.includes(path)) return next();

    // Ưu tiên lấy token từ cookie → fallback sang header
    const token =
        req.cookies?.access_token ||
        req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Không có token, vui lòng đăng nhập",
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        (req as any).user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            message: "Token không hợp lệ hoặc hết hạn",
        });
    }
};

// authenticateJWT: dành cho web routes (SSR, view)
const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ message: "Chưa đăng nhập" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        (req as any).user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token không hợp lệ" });
    }
};

export { checkValidJWT, authenticateJWT };
