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

// const getMinPrice = async (minPrice: number) => {
//     return await prisma.product.findMany({
//         where: {
//             price: {
//                 gte: minPrice
//             }
//         }
//     })
// }

// const getMaxPrice = async (maxPrice: number) => {
//     return await prisma.product.findMany({
//         where: {
//             price: {
//                 lte: maxPrice
//             }
//         }
//     })
// }

// lấy 1 hãng sản xuất
// const getFactory = async (factory: string) => {
//     return await prisma.product.findMany({
//         where: {
//             factory: {
//                 equals: factory
//             }
//         }
//     })
// }

// Lấy nhiều hãng sản xuất
// const getManyFactory = async (factoryArray: string[]) => {
//     return await prisma.product.findMany({
//         where: {
//             factory: {
//                 in: factoryArray
//             }
//         }
//     })
// }

// khoảng giá từ A <= price <= B
// const getAboutPrice = async (min: number, max: number) => {
//     return await prisma.product.findMany({
//         where: {
//             price: {
//                 gte: min,
//                 lte: max
//             }
//         }
//     })
// }

// khoảng giá từ A <= price <= B & C <= price <= D
// const getRangePrice = async () => {
//     return await prisma.product.findMany({
//         where: {
//             OR: [
//                 {
//                     price: { gte: 10000000, lte: 15000000 }
//                 },
//                 {
//                     price: { gte: 16000000, lte: 20000000 }
//                 }
//             ]
//         }
//     })
// }

// Lọc sản phẩm theo thứ tự tăng dần
const getSortIncProduct = async () => {
    return await prisma.product.findMany({
        orderBy: {
            price: 'asc'
        }
    })
}
// lọc sản phẩm theo thứ tự giảm dần
// const getSortDescProduct = async () => {
//     return await prisma.product.findMany({
//         orderBy: {
//             price: 'desc'
//         }
//     })
// }


export { userFilter, getSortIncProduct }; //getMinPrice, getMaxPrice, getFactory, getManyFactory, getAboutPrice, getRangePrice