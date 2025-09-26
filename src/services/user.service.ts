import { prisma } from "config/client";
import { ACCOUNT_TYPE, TOTAL_ITEM_PER_PAGE } from "config/constant";
import getConnection from "config/database";
import bcrypt from 'bcrypt';
const saltRounds = 10;

const hashPassword = async (plainText: string) => {
    return await bcrypt.hash(plainText, saltRounds);
}

const comparePassword = async (plainText: string, hashPassword: string) => {
    return await bcrypt.compare(plainText, hashPassword);
}

const handleCreateUser = async (
    fullName: string,
    email: string,
    address: string,
    phone: string,
    avatar: string,
    role: string
) => {
    //hash password
    const defaultPassword = await hashPassword('123456');
    //insert user into database
    const newUser = await prisma.user.create({
        data: {
            fullName: fullName,
            username: email,
            address: address,
            password: defaultPassword,
            accountType: ACCOUNT_TYPE.SYSTEM,
            avatar: avatar,
            phone: phone,
            roleId: +role,
        },
    })
    return newUser;
}

const getAllUsers = async (page: number) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const skip = (page - 1) * pageSize;
    const users = await prisma.user.findMany({
        skip: skip,
        take: pageSize
    })
    return users;
}

const countTotalUserPages = async () => {
    const pageSize = TOTAL_ITEM_PER_PAGE
    const totalItems = await prisma.user.count();
    const totalPages = Math.ceil(totalItems / pageSize);
    return totalPages;
}

const countTotalProductPages = async () => {
    const pageSize = TOTAL_ITEM_PER_PAGE
    const totalItems = await prisma.product.count();
    const totalPages = Math.ceil(totalItems / pageSize);
    return totalPages;
}

const countTotalOrderPages = async () => {
    const pageSize = TOTAL_ITEM_PER_PAGE
    const totalItems = await prisma.order.count();
    const totalPages = Math.ceil(totalItems / pageSize);
    return totalPages;
}

const getAllRoles = async () => {
    const roles = await prisma.role.findMany()
    return roles;
}

const handleDeleteUser = async (id: number) => {
    try {
        const connection = await getConnection();
        const sql = 'DELETE FROM `users` WHERE id = ? LIMIT 1';
        const values = [id];
        const [result, fields] = await connection.execute(sql, values);
        return result;
    } catch (err) {
        console.log(err);
        return [];
    }
}

const getUserById = async (id: number) => {
    const user = await prisma.user.findUnique({
        where: { id: +id },
    });
    return user;
}

const updateUserById = async (
    id: number,
    fullName: string,
    phone: string,
    roleId: number,
    address: string,
    avatar: string
) => {
    try {
        const updateUser = await prisma.user.update({
            where: { id },
            data: {
                fullName,
                phone,
                address,
                avatar,
                role: {
                    connect: { id: roleId }  // gán role qua quan hệ
                }
            }
        });
        return updateUser;
    } catch (error) {
        console.error("Error updating user:", error);
        throw error;
    }
};

/* =========================
   ADD: Utilities for password
   ========================= */
const verifyPasswordByUserId = async (userId: number, plain: string) => {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true }
    });
    if (!u || !u.password) return false;
    return comparePassword(plain, u.password);
};

const changeUserPassword = async (userId: number, newPlain: string) => {
    const newHash = await hashPassword(newPlain);
    await prisma.user.update({
        where: { id: userId },
        data: { password: newHash }
    });
    return true;
};

export {
    handleCreateUser,
    getAllUsers,
    handleDeleteUser,
    getUserById,
    updateUserById,
    getAllRoles,
    hashPassword,
    comparePassword,
    countTotalUserPages,
    countTotalProductPages,
    countTotalOrderPages,
    // NEW
    verifyPasswordByUserId,
    changeUserPassword,
};
