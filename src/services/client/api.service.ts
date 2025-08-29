import { prisma } from "config/client";

const handleGetAllUser = async () => {
    return await prisma.user.findMany();
}
export { handleGetAllUser }