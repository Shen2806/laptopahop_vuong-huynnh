import { prisma } from "config/client";

const initDatabase = async () => {
    const countUser = await prisma.user.count();
    const countRole = await prisma.role.count();
    if (countUser === 0) {
        await prisma.user.createMany({
            data: [
                {
                    username: 'admin',
                    password: 'admin123',
                    accountType: 'admin',
                },
                {
                    username: 'minhvuong',
                    password: 'minhvuong123',
                    accountType: 'users',
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