// import { prisma } from "config/client";
import { ACCOUNT_TYPE, TOTAL_ITEM_PER_PAGE } from "config/constant";
import getConnection from "config/database";
import bcrypt from 'bcrypt';
import { PrismaClient } from "@prisma/client";
const saltRounds = 10;
const prisma = new PrismaClient();

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


/**
 * Tạo điều kiện WHERE cho tìm kiếm.
 * - Tìm trên fullName, username (email), address
 * - MySQL thường dùng collation _ci nên đã không phân biệt hoa/thường.
 */
function buildWhere(search?: string) {
    const q = (search ?? '').trim();
    if (!q) return {};
    return {
        OR: [
            { fullName: { contains: q } },
            { username: { contains: q } },
            { address: { contains: q } },
        ],
    };
}

/**
 * Lấy danh sách user theo trang + tìm kiếm.
 * @param page Trang hiện tại (>=1)
 * @param search Từ khóa tìm kiếm (tùy chọn)
 */
const getAllUsers = async (page: number, search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const safePage = Math.max(1, Number(page || 1));
    const skip = (safePage - 1) * pageSize;

    const where = buildWhere(search);

    const users = await prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: 'asc' },
        select: {
            id: true,
            fullName: true,
            username: true, // email
            address: true,
        },
    });

    return users;
};

/**
 * Tính tổng số trang theo bộ lọc hiện tại.
 * @param search Từ khóa tìm kiếm (tùy chọn)
 */
const countTotalUserPages = async (search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const where = buildWhere(search);

    const total = await prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return totalPages;
};

/**
 * (Tuỳ chọn) Lấy cả danh sách + tổng trang trong 1 lần gọi (tối ưu round-trip).
 * Controller có thể dùng hàm này thay vì gọi 2 hàm riêng.
 */
export const getUsersPage = async (page: number, search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const safePage = Math.max(1, Number(page || 1));
    const skip = (safePage - 1) * pageSize;
    const where = buildWhere(search);

    const [total, users] = await prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { id: 'asc' },
            select: { id: true, fullName: true, username: true, address: true },
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { users, totalPages, page: safePage };
};

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
