// import { prisma } from "config/client"

// const getDashBoardInfo = async () => {
//     const countUser = await prisma.user.count();
//     const countProduct = await prisma.product.count();
//     const countOrder = await prisma.order.count();

//     // Lấy tất cả đơn COMPLETE để tính doanh thu sau giảm giá
//     const completedOrders = await prisma.order.findMany({
//         where: { status: "COMPLETE" },
//         select: { totalPrice: true, discountAmount: true }
//     });

//     const totalRevenue = completedOrders.reduce((sum, order) => {
//         return sum + (order.totalPrice - (order.discountAmount || 0));
//     }, 0);

//     // Top 5 sản phẩm bán chạy theo số lượng
//     const bestSellingProducts = await prisma.orderDetail.groupBy({
//         by: ["productId"],
//         _sum: { quantity: true },
//         orderBy: { _sum: { quantity: "desc" } },
//         take: 5
//     });

//     // Lấy thêm thông tin sản phẩm (name, price, image...)
//     const productsWithInfo = await prisma.product.findMany({
//         where: { id: { in: bestSellingProducts.map(p => p.productId) } }
//     });

//     const topProducts = bestSellingProducts.map(p => {
//         const product = productsWithInfo.find(prod => prod.id === p.productId);
//         return {
//             id: p.productId,
//             name: product?.name ?? "Sản phẩm không xác định",
//             quantitySold: p._sum.quantity ?? 0
//         };
//     });

//     // Sản phẩm sắp hết hàng (quantity < 10)
//     const lowStockProducts = await prisma.product.findMany({
//         where: { quantity: { lt: 10 } },
//         select: { id: true, name: true, quantity: true },
//         orderBy: { quantity: "asc" }
//     });

//     return {
//         countUser,
//         countProduct,
//         countOrder,
//         totalRevenue,
//         topProducts,
//         lowStockProducts
//     };
// };


// export {
//     getDashBoardInfo
// }

import { prisma } from "config/client";

const getDashBoardInfo = async () => {
    // Đếm concurrent cho nhanh
    const [countUser, countProduct, countOrder] = await Promise.all([
        prisma.user.count(),
        prisma.product.count(),
        prisma.order.count(),
    ]);

    // Doanh thu: chỉ tính đơn đã giao, trừ giảm giá
    const agg = await prisma.order.aggregate({
        _sum: { totalPrice: true, discountAmount: true },
        where: {
            status: "DELIVERED",
            // (tuỳ) nếu cần chỉ tính đơn đã thanh toán:
            // paymentStatus: "PAID",
        },
    });
    const totalRevenue =
        (agg._sum.totalPrice ?? 0) - (agg._sum.discountAmount ?? 0);

    // ===== Top 5 sản phẩm bán chạy (CHỈ tính các đơn DELIVERED) =====
    const deliveredDetails = await prisma.orderDetail.findMany({
        where: { order: { status: "DELIVERED" } }, // lọc qua quan hệ Order
        select: { productId: true, quantity: true },
    });

    // Gộp số lượng theo productId
    const qtyByProduct = new Map<number, number>();
    for (const d of deliveredDetails) {
        qtyByProduct.set(d.productId, (qtyByProduct.get(d.productId) ?? 0) + d.quantity);
    }

    // Lấy 5 sản phẩm có quantity cao nhất
    const top5Ids = [...qtyByProduct.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([productId]) => productId);

    // Join tên sản phẩm
    const productsWithInfo = top5Ids.length
        ? await prisma.product.findMany({
            where: { id: { in: top5Ids } },
            select: { id: true, name: true },
        })
        : [];

    const topProducts = top5Ids.map((id) => ({
        id,
        name: productsWithInfo.find((p) => p.id === id)?.name ?? "Sản phẩm không xác định",
        quantitySold: qtyByProduct.get(id) ?? 0,
    }));
    // ================================================================

    // Sản phẩm sắp hết hàng
    const lowStockProducts = await prisma.product.findMany({
        where: { quantity: { lt: 10 } },
        select: { id: true, name: true, quantity: true },
        orderBy: { quantity: "asc" },
    });

    return {
        countUser,
        countProduct,
        countOrder,
        totalRevenue,
        topProducts,
        lowStockProducts,
    };
};

export { getDashBoardInfo };

