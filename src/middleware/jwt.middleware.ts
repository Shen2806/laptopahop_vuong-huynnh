
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config"
const checkValidJWT = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];
    const path = req.path;
    const whiteList = [
        "/add-product-to-cart",
        "/login"
    ];
    const isWhiteList = whiteList.some(route => route === path)
    if (isWhiteList) {
        next()
        return;
    }
    try {
        const dataDecoded: any = jwt.verify(token, process.env.JWT_TOKEN)
        req.user = {
            id: dataDecoded.id,
            username: dataDecoded.username,
            password: "",
            fullName: "",
            address: "",
            phone: "",
            accountType: dataDecoded.accountType,
            avatar: dataDecoded.avatar,
            roleId: dataDecoded.roleId,
            role: dataDecoded.role

        }
        next()
    } catch (error) {
        res.status(401).json({
            data: null,
            message: "Token không hợp lệ hoặc có thể token hết hạn"
        })
    }

}

export { checkValidJWT }