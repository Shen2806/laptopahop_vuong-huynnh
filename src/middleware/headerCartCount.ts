import { Request, Response, NextFunction } from "express";
import { prisma } from "config/client";

export async function headerCartCount(req: Request, res: Response, next: NextFunction) {
    try {
        const user: any = (req as any).user;
        let count = 0;

        if (user?.id) {
            // Nếu có cột status: dùng where: { cart: { userId: user.id, status: 'OPEN' } }
            const agg = await prisma.cartDetail.aggregate({
                where: { cart: { userId: Number(user.id) } },
                _sum: { quantity: true },
            });
            count = Number(agg._sum.quantity || 0);
        }

        res.locals.headerCartCount = count;
    } catch (e) {
        res.locals.headerCartCount = 0;
    } finally {
        next();
    }
}

