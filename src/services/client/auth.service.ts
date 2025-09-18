import { prisma } from "config/client";
import { ACCOUNT_TYPE } from "config/constant";
import { comparePassword, hashPassword } from "services/user.service";
import jwt, { SignOptions } from "jsonwebtoken";




const isEmailExist = async (email: string) => {
    const user = await prisma.user.findUnique({
        where: { username: email }
    })
    if (user) return true;
    return false;
}

const registerNewUser = async (fullName: string, email: string, password: string) => {
    const newPassword = await hashPassword(password);

    const userRole = await prisma.role.findUnique({
        where: { name: "USER" }
    });
    if (userRole) {
        await prisma.user.create({
            data: {
                username: email,
                password: newPassword,
                fullName: fullName,
                accountType: ACCOUNT_TYPE.SYSTEM,
                roleId: userRole.id
            }
        });
    } else {
        throw new Error("Quyền người dùng không tồn tại, vui lòng liên hệ quản trị viên !");

    }
}

const getUserWithRoleById = async (id: number) => {

    const user = await prisma.user.findUnique({
        where: { id: +id },
        include: { role: true },
        omit: {
            password: true
        }
    });
    return user;
}
const getUserSumCart = async (id: number) => {

    const user = await prisma.cart.findUnique({
        where: { userId: +id },

    });
    return user?.sum ?? 0;
}



const JWT_SECRET = process.env.JWT_SECRET || "your-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-secret";

// ép kiểu env sang SignOptions["expiresIn"]
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
    (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "15m";

const JWT_REFRESH_EXPIRES_IN: SignOptions["expiresIn"] =
    (process.env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]) || "7d";

const generateAccessToken = (user: any) => {
    const payload = { id: user.id, role: user.role.name };
    return jwt.sign(payload, JWT_SECRET as jwt.Secret, { expiresIn: JWT_EXPIRES_IN });
};

const generateRefreshToken = (user: any) => {
    const payload = { id: user.id };
    return jwt.sign(payload, JWT_REFRESH_SECRET as jwt.Secret, { expiresIn: JWT_REFRESH_EXPIRES_IN });
};




export { isEmailExist, registerNewUser, getUserWithRoleById, getUserSumCart, generateRefreshToken, generateAccessToken };
