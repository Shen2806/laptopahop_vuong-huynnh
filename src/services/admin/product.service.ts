// import { prisma } from "config/client";


// const createProduct = async (data: {
//     name: string;
//     price: number;
//     detailDesc: string;
//     shortDesc: string;
//     quantity: number;
//     factory: string;
//     target: string;
//     imageUpload?: string;
// }) => {
//     const { name, price, detailDesc, shortDesc, factory, quantity, target, imageUpload } = data;
//     return await prisma.product.create({
//         data: {
//             name,
//             price,
//             detailDesc,
//             shortDesc,
//             quantity,
//             factory,
//             target,
//             ...(imageUpload && { image: imageUpload })  //nếu có image thì mới gán
//         }
//     });
// }
// export { createProduct };

import { prisma } from "config/client";

// Định nghĩa input cho hàm createProduct
interface CreateProductInput {
    name: string;
    price: number;
    detailDesc: string;
    shortDesc: string;
    quantity: number;
    factory: string;
    target: string;
    imageUpload?: string | null;
}

const createProduct = async (data: CreateProductInput) => {
    const {
        name,
        price,
        detailDesc,
        shortDesc,
        quantity,
        factory,
        target,
        imageUpload,
    } = data;

    return await prisma.product.create({
        data: {
            name: String(name),
            price: Number(price),
            detailDesc: String(detailDesc),
            shortDesc: String(shortDesc),
            quantity: Number(quantity),
            factory: String(factory),
            target: String(target),
            image: imageUpload ?? null, // Prisma cho phép null
        },
    });
};
const getProductList = async () => {
    return await prisma.product.findMany();
}

const deleteProductById = async (id: number) => {
    await prisma.product.delete({
        where: { id }
    });
}

const getProductById = async (id: number) => {
    return await prisma.product.findUnique({
        where: { id }
    });
}

const updateProductById = async (data: {
    id: number;
    name?: string;
    price?: number;
    detailDesc?: string;
    shortDesc?: string;
    quantity?: number;
    factory?: string;
    target?: string;
    imageUpload?: string | null;
}) => {
    await prisma.product.update({
        where: { id: data.id },
        data: {
            ...(data.name && { name: String(data.name) }),
            ...(data.price && { price: Number(data.price) }),
            ...(data.detailDesc && { detailDesc: String(data.detailDesc) }),
            ...(data.shortDesc && { shortDesc: String(data.shortDesc) }),
            ...(data.quantity && { quantity: Number(data.quantity) }),
            ...(data.factory && { factory: String(data.factory) }),
            ...(data.target && { target: String(data.target) }),
            ...(data.imageUpload !== undefined && { image: data.imageUpload }),
        }
    });
};

export { createProduct, type CreateProductInput, getProductList, deleteProductById, getProductById, updateProductById };
