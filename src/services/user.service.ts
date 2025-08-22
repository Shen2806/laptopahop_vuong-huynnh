import { prisma } from "config/client";
import { ACCOUNT_TYPE } from "config/constant";
import getConnection from "config/database";

const handleCreateUser = async (
    fullName: string,
    email: string,
    address: string,
    phone: string,
    avatar: string
) => {

    //insert user into database
    const newUser = await prisma.user.create({
        data: {
            fullName: fullName,
            username: email,
            address: address,
            password: '123456',
            accountType: ACCOUNT_TYPE.SYSTEM,
            avatar: avatar,
            phone: phone,
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
const updateUserById = async (id: number, fullName: string, email: string, address: string) => {

    const updateUser = await prisma.user.update({
        where: { id: +id },
        data: {
            fullName: fullName,
            username: email,
            address: address,
            password: '',
            accountType: '',
        },
    });
    return updateUser;
}
export { handleCreateUser, getAllUsers, handleDeleteUser, getUserById, updateUserById, getAllRoles };

