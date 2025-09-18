import { prisma } from "config/client";
import { TOTAL_ITEM_PER_PAGE } from "config/constant";

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
const getProductList = async (page: number) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const skip = (page - 1) * pageSize;
    const products = await prisma.product.findMany({
        skip: skip,
        take: pageSize
    })
    return products;
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
