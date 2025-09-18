import { Request, Response, NextFunction } from "express";
import { User } from "@prisma/client";
const isLogin = (req: Request, res: Response, next: NextFunction) => {
    const isAuthenticated = req.isAuthenticated();
    if (isAuthenticated) {
        res.redirect("/");
        return;
    } else {
        next();
    }

}
const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/admin")) {
        const user = req.user;
        if (user?.role?.name === "ADMIN") {
            next();
        } else {
            res.render("status/403.ejs");
        }
        return;
    }
    //client route
    next();

}
const ensureAuthenticated = (req: any, res: any, next: any) => {
    if (req.user) {
        return next();
    }
    res.redirect("/login");

}
export { isLogin, isAdmin, ensureAuthenticated };