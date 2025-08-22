import { prisma } from "config/client";

const initDatabase = async () => {
    const countUser = await prisma.user.count();
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
    } else {
        console.log('Database already seeded with users');
    }

}

export default initDatabase;