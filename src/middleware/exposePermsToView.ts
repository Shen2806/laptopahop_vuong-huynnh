// src/middlewares/exposePermsToView.ts
import { Request, Response, NextFunction } from "express";

export function exposePermsToView(req: Request & { user?: any }, res: Response, next: NextFunction) {
    res.locals.user = req.user || null;
    res.locals.perms = (req.user && req.user.permissions) || [];
    res.locals.roleName = (req.user && req.user.roleName) || "";
    next();
}
