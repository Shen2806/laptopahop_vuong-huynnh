import { prisma } from "config/client";

const userFilter = async (usernameInput: string) => {
    return await prisma.user.findMany(
        {
            where: {
                username: {
                    contains: usernameInput
                }
            }
        }
    )
}

export { userFilter };