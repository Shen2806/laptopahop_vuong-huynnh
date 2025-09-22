// src/middleware/auth.ts (FULL FILE)
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getUserWithRoleById } from "services/client/auth.service";

// Xác định request kỳ vọng JSON (API) hay HTML (web)
function wantJSON(req: Request) {
    return req.xhr || req.originalUrl.startsWith("/api");
}

// Đảm bảo đã đăng nhập: ưu tiên session (Passport), fallback JWT (cookie access_token)
export const ensureAuthenticated = async (req: any, res: Response, next: NextFunction) => {
    // 1) Session
    if (req.isAuthenticated?.() && req.user?.id) return next();

    // 2) JWT từ cookie
    const token = req.cookies?.access_token;
    if (token) {
        try {
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
            const full = await getUserWithRoleById(decoded.id);
            if (full) {
                req.user = full; // gắn user đầy đủ (có role)
                return next();
            }
        } catch {
            // ignore
        }
    }
    if (wantJSON(req)) return res.status(401).json({ message: "Unauthorized" });
    return res.redirect("/login");
};

// Chỉ cho phép ADMIN
export const isAdmin = async (req: any, res: Response, next: NextFunction) => {
    await ensureAuthenticated(req, res, async () => {
        const roleName = String(req.user?.role?.name || req.user?.roleName || "").toUpperCase();
        if (roleName !== "ADMIN") {
            return wantJSON(req)
                ? res.status(403).json({ message: "Forbidden" })
                : res.status(403).render("status/403.ejs");
        }
        next();
    });
};

// Nếu đã login thì không cho vào /login, /register
export const isLogin = (req: any, res: Response, next: NextFunction) => {
    if (req.isAuthenticated?.() && req.user) return res.redirect("/");
    if (req.cookies?.access_token) return res.redirect("/");
    next();
};
