import { prisma } from "config/client";
import { TOTAL_ITEM_PER_PAGE } from "config/constant";
import { Prisma } from "@prisma/client";

// Map nhanh cho enum status/paymentStatus nếu user gõ đúng tên enum
const ORDER_STATUS = [
    "PENDING", "CONFIRMED", "SHIPPING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED",
] as const;

const PAYMENT_STATUS = [
    "PAID", "UNPAID", "PENDING"
] as const; // chỉnh lại đúng enum thực tế của bạn nếu khác

function buildOrderWhere(search?: string): Prisma.OrderWhereInput | undefined {
    const q = (search ?? "").trim();
    if (!q) return undefined;

    const or: Prisma.OrderWhereInput[] = [
        // theo tên/email user
        { user: { fullName: { contains: q } } },
        { user: { username: { contains: q } } },

        // theo phương thức thanh toán
        { paymentMethod: { contains: q } },

        // theo tên sản phẩm trong orderDetails
        { orderDetails: { some: { product: { name: { contains: q } } } } },
    ];

    // nếu gõ số → tìm theo id
    const idNum = Number(q);
    if (!Number.isNaN(idNum) && Number.isFinite(idNum)) {
        or.push({ id: idNum });
    }

    // nếu gõ đúng tên enum status → match theo status
    const qUpper = q.toUpperCase();
    if ((ORDER_STATUS as readonly string[]).includes(qUpper)) {
        or.push({ status: qUpper as any });
    }
    if ((PAYMENT_STATUS as readonly string[]).includes(qUpper)) {
        or.push({ paymentStatus: qUpper as any });
    }

    return { OR: or };
}

const getOrderAdmin = async (page: number, search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;

    const orders = await prisma.order.findMany({
        where: buildOrderWhere(search),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
            user: true,
            orderDetails: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return orders;
};

const countTotalOrderPages = async (search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const total = await prisma.order.count({
        where: buildOrderWhere(search),
    });
    return Math.max(1, Math.ceil(total / pageSize));
};

const getOrderDetailAdmin = async (orderId: number) => {
    return await prisma.orderDetail.findMany({
        where: { orderId },
        include: { product: true }
    });
};

export { getOrderAdmin, getOrderDetailAdmin, countTotalOrderPages };
