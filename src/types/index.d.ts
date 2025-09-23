import { User as UserPrima, Role } from "@prisma/client";
import "express-session";


declare global {
    namespace Express {
        interface User extends UserPrima {
            role?: Role;
            sumCart?: number;
        }
    }
}




declare module "express-session" {
    interface SessionData {
        successMessage?: string | null;
    }
    interface SessionData {
        buyNow?: {
            productId: number;
            quantity: number;
            at: number;
        };
    }

}
