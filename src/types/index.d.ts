import { User, Role } from "@prisma/client";



declare global {
    namespace Express {
        interface User {
            role: Role; // Thêm thuộc tính role vào User
        }
    }
}