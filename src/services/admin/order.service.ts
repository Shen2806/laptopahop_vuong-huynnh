import { prisma } from "config/client";
import { TOTAL_ITEM_PER_PAGE } from "config/constant";

const getOrderAdmin = async (page: number) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const orders = await prisma.order.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
            user: true,
            orderDetails: {
                include: { product: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });
    return orders;
}

const getOrderDetailAdmin = async (orderId: number) => {
    return await prisma.orderDetail.findMany({
        where: { orderId },
        include: { product: true }
    })
}
export { getOrderAdmin, getOrderDetailAdmin };