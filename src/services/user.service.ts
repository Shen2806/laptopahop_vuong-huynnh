import { prisma } from "config/client";
import { ACCOUNT_TYPE } from "config/constant";
import getConnection from "config/database";
import bcrypt from 'bcrypt';
const saltRounds = 10;

const hashPassword = async (plainText: string) => {
    return await bcrypt.hash(plainText, saltRounds);
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
const getAllUsers = async () => {
    const users = await prisma.user.findMany()
    return users;
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
// const updateUserById = async (id: string, fullName: string, phone: string, address: string, role: string, avatar: string) => {

//     const updateUser = await prisma.user.update({
//         where: { id: +id },
//         data: {
//             fullName: fullName,
//             phone: phone,
//             roleId: +role,
//             address: address,
//             ...(avatar !== undefined && { avatar: avatar })
//         },
//     });
//     return updateUser;
// }
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
export { handleCreateUser, getAllUsers, handleDeleteUser, getUserById, updateUserById, getAllRoles, hashPassword };

