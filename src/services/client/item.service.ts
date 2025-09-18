import { prisma } from "config/client";
import { TOTAL_ITEM_PER_PAGE } from "config/constant";
import { getOrderHistoryPage } from "controllers/client/product.controller";

const getProducts = async (page: number, pageSize: number) => {
    const skip = (page - 1) * pageSize;
    const products = await prisma.product.findMany({
        skip: skip,
        take: pageSize,
    })
    return products;
}

const getProductById = async (id: number) => {
    const product = await prisma.product.findUnique({
        where: { id: id }
    });
    return product;
}

const addProductToCart = async (quantity: number, productId: number, user: Express.User) => {
    const cart = await prisma.cart.findUnique({
        where: {
            userId: user.id
        }
    });
    const product = await prisma.product.findUnique({
        where: { id: productId }
    });
    if (cart) {
        //update
        await prisma.cart.update({
            where: { id: cart.id },
            data: {
                sum: {
                    increment: quantity
                }
            }
        })
        const currentCartDetail = await prisma.cartDetail.findFirst({
            where: {
                productId: productId,
                cartId: cart.id
            }
        })
        await prisma.cartDetail.upsert({
            where: {
                id: currentCartDetail?.id ?? 0
            },
            update: {
                quantity: {
                    increment: quantity
                }
            },
            create: {
                price: product.price,
                quantity: quantity,
                productId: productId,
                cartId: cart.id
            },
        })
    } else {
        //create
        await prisma.cart.create({
            data: {
                sum: quantity,
                userId: user.id,
                cartDetails: {
                    create: [
                        {
                            price: product.price,
                            quantity: quantity,
                            productId: productId
                        }
                    ]
                }
            }
        })
    }
    return;
}

const getProductInCart = async (userId: number) => {
    const cart = await prisma.cart.findUnique({
        where: {
            userId
        }
    })
    if (cart) {
        const currentCartDetail = await prisma.cartDetail.findMany({
            where: { cartId: cart.id },
            include: { product: true }
        })
        return currentCartDetail;
    }
    return [];
}

// const DeleteProductInCart = async (cartDetailId: number, userId: number, sumCart: number) => {
//     // xoa cart detail
//     const currentCartDetail = await prisma.cartDetail.delete({
//         where: { id: cartDetailId }
//     })
//     const quantity = currentCartDetail.quantity;
//     await prisma.cartDetail.delete({
//         where: { id: cartDetailId }
//     })
//     if (sumCart === 1) {
//         //xoa cart
//         await prisma.cart.delete({
//             where: { userId }
//         })
//     } else {
//         // update cart
//         await prisma.cart.update({
//             where: { userId },
//             data: {
//                 sum: {
//                     decrement: quantity
//                 }
//             }
//         })
//     }
// }
const DeleteProductInCart = async (cartDetailId: number, userId: number, sumCart: number) => {
    // Lấy cartDetail trước khi xóa
    const currentCartDetail = await prisma.cartDetail.findUnique({
        where: { id: cartDetailId }
    });

    if (!currentCartDetail) {
        throw new Error(`CartDetail with id ${cartDetailId} does not exist`);
    }

    const quantity = currentCartDetail.quantity;

    // Xóa cartDetail
    await prisma.cartDetail.delete({
        where: { id: cartDetailId }
    });

    if (sumCart === 1) {
        // Xóa cart nếu chỉ còn 1 sản phẩm
        await prisma.cart.delete({
            where: { userId }
        });
    } else {
        // Update cart sum
        await prisma.cart.update({
            where: { userId },
            data: {
                sum: {
                    decrement: quantity
                }
            }
        });
    }
}


// const updateCartDetailBeforeCheckOut = async (data: { id: String, quantity: string }[], cartId: string) => {
//     let quantity = 0;
//     for (let i = 0; i < data.length; i++) {
//         quantity += +(data[i].quantity)
//         await prisma.cartDetail.update({
//             where: {
//                 id: +(data[i].id)
//             },
//             data: {
//                 quantity: +data[i].quantity
//             }
//         })
//     }
//     //update cart sum
//     await prisma.cart.update({
//         where: {
//             id: +cartId
//         },
//         data: {
//             sum: quantity
//         }
//     })
// }
const updateCartDetailBeforeCheckOut = async (
    data: Array<{ id: any; quantity: any }>,
    cartId: number
) => {
    // Chuẩn hóa & validate
    const sanitized = data
        .map((d) => ({
            id: Number(d.id),
            quantity: Math.max(1, Number(d.quantity) || 1), // tối thiểu 1
        }))
        .filter((d) => Number.isFinite(d.id) && Number.isFinite(d.quantity));

    if (sanitized.length === 0) return;

    await prisma.$transaction(async (tx) => {
        // Chỉ cho phép update các cartDetail thuộc đúng cartId (tránh sửa sai giỏ)
        const validRows = await tx.cartDetail.findMany({
            where: { cartId, id: { in: sanitized.map((s) => s.id) } },
            select: { id: true },
        });
        const validIds = new Set(validRows.map((r) => r.id));

        let sum = 0;
        for (const { id, quantity } of sanitized) {
            if (!validIds.has(id)) continue; // bỏ qua id không thuộc cart hiện tại
            await tx.cartDetail.update({
                where: { id },
                data: { quantity },
            });
            sum += quantity;
        }

        // cập nhật tổng số lượng trong cart
        await tx.cart.update({
            where: { id: cartId },
            data: { sum },
        });
    });
};

type PlaceOrderArgs = {
    userId: number;
    receiverName: string;
    receiverAddress: string;
    receiverPhone: string;
    receiverNote?: string;
    couponCode?: string | null;
};

type PlaceOrderResult = {
    success: boolean;
    orderId?: number;
    error?: string;
};

async function handlePlaceOrder(args: PlaceOrderArgs): Promise<PlaceOrderResult> {
    const { userId, receiverName, receiverAddress, receiverPhone, receiverNote, couponCode } = args;

    // 1) Lấy cart hiện tại
    const cart = await prisma.cart.findFirst({
        where: { userId },
        select: { id: true },
    });
    if (!cart) return { success: false, error: "Giỏ hàng trống." };

    const cartDetails = await prisma.cartDetail.findMany({
        where: { cartId: cart.id },
        include: { product: true },
    });
    if (cartDetails.length === 0) return { success: false, error: "Giỏ hàng trống." };

    // 2) Tính base sau KM từng SP (KHÔNG tin totalPrice/discountAmount client gửi)
    const base = cartDetails.reduce((sum, cd) => {
        const p = Number(cd.product.price);
        const d = Number(cd.product.discount || 0);
        const unit = d > 0 ? Math.round(p * (100 - d) / 100) : p;
        return sum + unit * Number(cd.quantity);
    }, 0);

    // 3) Áp mã coupon hợp lệ (nếu có)
    let appliedCode: string | null = null;
    let discountAmount = 0;

    if (couponCode) {
        const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
        const valid = coupon && coupon.expiryDate >= new Date();
        if (valid) {
            discountAmount = Math.round(base * Number(coupon!.discount) / 100);
            appliedCode = coupon!.code;
        }
    }

    const finalTotal = Math.max(0, base - discountAmount);

    // 4) Tạo order + order details + clear cart trong transaction
    const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
            data: {
                userId,
                totalPrice: finalTotal,
                discountAmount,
                couponCode: appliedCode,

                receiverAddress,
                receiverName,
                receiverPhone,
                receiverNote: receiverNote || "",

                status: "PENDING",
                paymentMethod: "COD",
                paymentStatus: "UNPAID",
            },
        });

        // Lưu detail với giá đã áp KM từng SP
        for (const cd of cartDetails) {
            const p = Number(cd.product.price);
            const d = Number(cd.product.discount || 0);
            const unit = d > 0 ? Math.round(p * (100 - d) / 100) : p;

            await tx.orderDetail.create({
                data: {
                    orderId: created.id,
                    productId: cd.productId,
                    price: unit,
                    quantity: cd.quantity,
                },
            });
        }

        // Xoá giỏ
        await tx.cartDetail.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { sum: 0 } });

        return created;
    });

    return { success: true, orderId: order.id };
}

const countTotalProductClientPages = async (pageSize: number) => {

    const totalItems = await prisma.product.count();

    const totalPages = Math.ceil(totalItems / pageSize);

    return totalPages;
}
const getOrderHistory = async (userId: number) => {
    return await prisma.order.findMany({
        where: { userId },
        include: {
            orderDetails: {
                include: {
                    product: true
                }
            }
        }
    })

}


export { getProducts, getProductById, addProductToCart, getProductInCart, DeleteProductInCart, updateCartDetailBeforeCheckOut, handlePlaceOrder, getOrderHistory, countTotalProductClientPages };