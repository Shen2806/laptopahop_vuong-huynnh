import { User as UserPrima, Role } from "@prisma/client";



declare global {
    namespace Express {
        interface User extends UserPrima {
            role?: Role; // Thêm thuộc tính role vào User
        }
    }
}