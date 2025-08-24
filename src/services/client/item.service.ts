import { prisma } from "config/client";

const getProducts = async () => {
    const products = await prisma.product.findMany()
    return products;
}
export { getProducts };