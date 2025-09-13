
// import { Request, Response, NextFunction } from "express";
// import jwt from "jsonwebtoken";
// import "dotenv/config"
// const checkValidJWT = (req: Request, res: Response, next: NextFunction) => {
//     const token = req.headers['authorization']?.split(' ')[1];
//     const path = req.path;
//     const whiteList = [
//         "/add-product-to-cart",
//         "/login"
//     ];
//     const isWhiteList = whiteList.some(route => route === path)
//     if (isWhiteList) {
//         next()
//         return;
//     }
//     try {
//         const dataDecoded: any = jwt.verify(token, process.env.JWT_SECRET)
//         req.user = {
//             id: dataDecoded.id,
//             username: dataDecoded.username,
//             password: "",
//             fullName: "",
//             address: "",
//             phone: "",
//             accountType: dataDecoded.accountType,
//             avatar: dataDecoded.avatar,
//             roleId: dataDecoded.roleId,
//             role: dataDecoded.role

//         }
//         next()
//     } catch (error) {
//         res.status(401).json({
//             data: null,
//             message: "Token không hợp lệ hoặc có thể token hết hạn"
//         })
//     }

// }
// const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
//     const token = req.cookies.access_token;
//     if (!token) return res.status(401).json({ message: "Chưa đăng nhập" });

//     try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
//         (req as any).user = decoded;
//         next();
//     } catch (err) {
//         return res.status(403).json({ message: "Token không hợp lệ" });
//     }
// };

// export { checkValidJWT, authenticateJWT }

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
