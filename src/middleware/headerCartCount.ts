import { Request, Response, NextFunction } from "express";
import { prisma } from "config/client";

export async function headerCartCount(req: Request, res: Response, next: NextFunction) {
    try {
        const user: any = (req as any).user;
        let count = 0;

        if (user?.id) {
            const cart = await prisma.cart.findFirst({
                where: { userId: Number(user.id) },
                orderBy: { id: "desc" },
                select: { id: true },
            });

            if (cart) {
                const agg = await prisma.cartDetail.aggregate({
                    where: { cartId: cart.id },
                    _sum: { quantity: true },
                });
                count = Number(agg._sum.quantity || 0);
            }
        }

        // gắn vào locals để mọi view dùng được
        res.locals.headerCartCount = count;
    } catch (e) {
        res.locals.headerCartCount = 0;
    } finally {
        next();
    }
}
