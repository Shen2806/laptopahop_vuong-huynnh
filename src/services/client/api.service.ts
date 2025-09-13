import { prisma } from "config/client";
import { comparePassword } from "services/user.service";
import jwt from "jsonwebtoken";
import "dotenv/config"

const handleGetAllUser = async () => {
    return await prisma.user.findMany();
}
const handleGetUserById = async (id: number) => {
    return await prisma.user.findUnique({
        where: { id }
    });
}

const handleUpdateUserById = async (id: number, fullName: string, address: string, phone: string) => {
    return await prisma.user.update({
        where: { id },
        data: { fullName, address, phone }
    });
}
const handleDeleteUserById = async (id: number) => {
    return await prisma.user.delete({
        where: { id }
    });
}

// const handleUserLogin = async (username: string, password: string) => {
//     // check user
//     const user = await prisma.user.findUnique({
//         where: { username },
//         include: {
//             role: true
//         }
//     })
//     if (!user) {
//         throw new Error(`Tài khoản ${username} không tìm thấy !`)
//     }
//     //compare Password
//     const isMatch = await comparePassword(password, user.password)
//     if (!isMatch) {
//         throw new Error(`Mật khẩu không đúng !`)
//     }
//     const payload = {
//         id: user.id,
//         username: user.username,
//         roleId: user.roleId,
//         role: user.role,
//         accountType: user.accountType,
//         avatar: user.avatar
//     }
//     const secret = process.env.JWT_SECRET;
//     const expiresIn: any = process.env.JWT_EXPIRES_IN;

//     const access_token = jwt.sign(payload, secret, {
//         expiresIn: expiresIn
//     })
//     return access_token;
// }



const handleUserLogin = async (username: string, password: string) => {
    // 1. Tìm user
    const user = await prisma.user.findUnique({
        where: { username },
        include: { role: true },
    });

    if (!user) {
        throw new Error(`Tài khoản ${username} không tìm thấy!`);
    }

    // 2. So sánh mật khẩu
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
        throw new Error("Mật khẩu không đúng!");
    }

    // 3. Payload cho token
    const payload = {
        id: user.id,
        username: user.username,
        roleId: user.roleId,
        role: user.role,
        accountType: user.accountType,
        avatar: user.avatar,
    };

    // 4. Lấy secret + expiresIn (với fallback để tránh undefined)
    const secret = (process.env.JWT_SECRET || "default-secret") as jwt.Secret;
    const refreshSecret = (process.env.JWT_REFRESH_SECRET || "default-refresh-secret") as jwt.Secret;

    // Ép kiểu expiresIn đúng với SignOptions["expiresIn"]
    const accessExpiresIn: jwt.SignOptions["expiresIn"] =
        (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "15m";
    const refreshExpiresIn: jwt.SignOptions["expiresIn"] =
        (process.env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d";

    // 5. Tạo token (ép kiểu secret & options để TypeScript không báo lỗi)
    const access_token = jwt.sign(payload, secret, { expiresIn: accessExpiresIn });
    const refresh_token = jwt.sign({ id: user.id }, refreshSecret, { expiresIn: refreshExpiresIn });

    // 6. Trả về cả 2 token (hoặc bạn có thể set cookie ở controller)
    return { access_token, refresh_token };


};

export { handleGetAllUser, handleGetUserById, handleUpdateUserById, handleDeleteUserById, handleUserLogin }