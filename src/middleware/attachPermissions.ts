// src/middlewares/attachPermissions.ts
import { Request, Response, NextFunction } from "express";
import { prisma } from "config/client";

export async function attachPermissions(req: Request & { user?: any }, _res: Response, next: NextFunction) {
    try {
        if (!req.user) return next();

        const staff = await prisma.staff.findFirst({
            where: {
                OR: [
                    req.user.staffId ? { id: Number(req.user.staffId) } : undefined,
                    req.user.username ? { username: String(req.user.username) } : undefined,
                    req.user.email ? { username: String(req.user.email) } : undefined,
                ].filter(Boolean) as any,
            },
            include: {
                role: { include: { rolePermissions: { include: { permission: true } } } },
                staffPermissions: { include: { permission: true } },
            },
        });

        let perms: string[] = [];
        let roleName = "";

        if (staff) {
            roleName = (staff.role?.name || "").toUpperCase();

            if (roleName === "ADMIN") {
                perms = ["*"];
            } else {
                const rolePerms = (staff.role?.rolePermissions || []).map(rp => rp.permission.name);
                const allow = (staff.staffPermissions || [])
                    .filter(sp => sp.effect === "ALLOW")
                    .map(sp => sp.permission.name);
                const deny = (staff.staffPermissions || [])
                    .filter(sp => sp.effect === "DENY")
                    .map(sp => sp.permission.name);

                const set = new Set(rolePerms);
                for (const p of allow) set.add(p);
                for (const p of deny) set.delete(p);
                perms = Array.from(set);
            }
        } else {
            const role = String(req.user?.role?.name || req.user?.roleName || "").toUpperCase();
            roleName = role;
            perms = role === "ADMIN" ? ["*"] : [];
        }

        req.user.permissions = perms;
        req.user.roleName = roleName;
        next();
    } catch (e) {
        console.error("attachPermissions error:", e);
        next();
    }
}
