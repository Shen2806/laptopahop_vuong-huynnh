import { prisma } from "config/client"

// const getDashBoardInfo = async () => {
//     const countUser = await prisma.user.count();
//     const countProduct = await prisma.product.count();
//     const countOrder = await prisma.order.count();

//     // Tính tổng doanh thu chỉ lấy đơn đã thanh toán thành công
//     const revenueResult = await prisma.order.aggregate({
//         _sum: {
//             totalPrice: true
//         },
//         where: {
//             status: "COMPLETE"
//         }
//     });

//     return {
//         countUser,
//         countProduct,
//         countOrder,
//         totalRevenue: revenueResult._sum.totalPrice ?? 0
//     };
// };
const getDashBoardInfo = async () => {
    const countUser = await prisma.user.count();
    const countProduct = await prisma.product.count();
    const countOrder = await prisma.order.count();

    // Tính tổng doanh thu dựa trên status = COMPLETE
    const revenueResult = await prisma.order.aggregate({
        _sum: {
            totalPrice: true
        },
        where: {
            status: "COMPLETE"
        }
    });

    // Top 5 sản phẩm bán chạy
    const bestSellingProducts = await prisma.orderDetail.groupBy({
        by: ["productId"],
        _sum: {
            quantity: true
        },
        orderBy: {
            _sum: {
                quantity: "desc"
            }
        },
        take: 5
    });

    // Lấy thêm thông tin sản phẩm (name, price, image...)
    const productsWithInfo = await prisma.product.findMany({
        where: {
            id: { in: bestSellingProducts.map(p => p.productId) }
        }
    });

    const topProducts = bestSellingProducts.map(p => {
        const product = productsWithInfo.find(prod => prod.id === p.productId);
        return {
            id: p.productId,
            name: product?.name ?? "Sản phẩm không xác định",
            quantitySold: p._sum.quantity ?? 0
        };
    });

    // 🔥 Thêm sản phẩm sắp hết hàng (quantity < 10)
    const lowStockProducts = await prisma.product.findMany({
        where: {
            quantity: {
                lt: 10
            }
        },
        select: {
            id: true,
            name: true,
            quantity: true
        },
        orderBy: {
            quantity: "asc"
        }
    });

    return {
        countUser,
        countProduct,
        countOrder,
        totalRevenue: revenueResult._sum.totalPrice ?? 0,
        topProducts,
        lowStockProducts // 👈 trả thêm cho dashboard
    };
};


export {
    getDashBoardInfo
}