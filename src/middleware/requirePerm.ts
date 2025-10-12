// middlewares/requirePerm.ts
import { Request, Response, NextFunction } from "express";

function hasPerm(perms: string[] = [], required: string) {
    if (perms.includes("*")) return true;                 // full access
    if (perms.includes(required)) return true;            // exact match
    const [res] = required.split(".");
    return perms.includes(`${res}.*`);                    // resource.*
}

export const requirePerm =
    (required: string) =>
        (req: Request & { user?: any }, res: Response, next: NextFunction) => {
            const user = req.user || {};

            // 👇 Bypass nếu role admin (dù là 'ADMIN', 'Admin', 'administrator'...) 
            const roleName =
                String(user.roleName || user.role?.name || user.role || "").toLowerCase();
            const rolesArr = Array.isArray(user.roles) ? user.roles : [];
            const isAdminRole =
                ["admin", "administrator", "superadmin"].includes(roleName) ||
                rolesArr.some((r: any) =>
                    ["admin", "administrator", "superadmin"].includes(
                        String(r?.name || r).toLowerCase()
                    )
                );
            if (isAdminRole) return next();

            // Kiểm tra theo permission
            const perms: string[] = user.permissions || user.perms || [];
            if (hasPerm(perms, required)) return next();

            // Từ chối
            if (req.xhr) return res.status(403).json({ ok: false, message: "Forbidden" });
            return res
                .status(403)
                .render("errors/403.ejs", { message: "Bạn không có quyền truy cập" });
        };
