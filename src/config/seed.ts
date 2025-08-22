import { prisma } from "config/client";
import { hashPassword } from "services/user.service";
import { ACCOUNT_TYPE } from "config/constant";

const initDatabase = async () => {
    const countUser = await prisma.user.count();
    const countRole = await prisma.role.count();
    if (countUser === 0) {
        const defaultPassword = await hashPassword('123456');
        await prisma.user.createMany({
            data: [
                {
                    fullName: 'Admin',
                    username: 'admin@gmail.com',
                    password: defaultPassword,
                    accountType: ACCOUNT_TYPE.SYSTEM,
                },
                {
                    fullName: 'Minh Vuong',
                    username: 'minhvuong@gmail.com',
                    password: defaultPassword,
                    accountType: ACCOUNT_TYPE.SYSTEM,
                },

            ],
        })
    } else if (countRole === 0) {
        await prisma.role.createMany({
            data: [
                {
                    name: 'ADMIN',
                    description: 'Administrator role with full access',
                },
                {
                    name: 'USER',
                    description: 'Regular user role with limited access',
                },


            ],
        })
    } else {
        console.log('Database already seeded with users');
    }

}

export default initDatabase;