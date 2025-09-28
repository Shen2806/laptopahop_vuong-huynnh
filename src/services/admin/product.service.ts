

import { Prisma } from "@prisma/client";

import { prisma } from "config/client";
import { TOTAL_ITEM_PER_PAGE } from "config/constant";

type CreateProductInput = {
    name: string;
    price: number;
    discount?: number;
    detailDesc?: string;
    shortDesc?: string;
    quantity: number;
    factory: string;
    target: string;
    imageUpload?: string | null;

    // specs
    cpu?: string | null;
    ramGB?: number | null;
    storageGB?: number | null;
    storageType?: "HDD" | "SSD" | "NVME" | null;
    screenResolution?: "FHD" | "QHD" | "4K" | null;
    screenSizeInch?: number | null;
    featureTags?: string | null;
};

type UpdateProductInput = CreateProductInput & {
    id: number;
    image?: string | null;
};
const buildProductWhere = (search?: string) => {
    const q = (search ?? '').trim();
    if (!q) return undefined;

    // Chọn các field bạn có thật trong schema Product
    return {
        OR: [
            { name: { contains: q } },
            { factory: { contains: q } },
            { target: { contains: q } },
            { shortDesc: { contains: q } },
            { detailDesc: { contains: q } },
            { featureTags: { contains: q } },
            { cpu: { contains: q } },
            // có thể thêm các field khác nếu tồn tại: ramGB/storageGB/screenResolution...
        ],
    } as Prisma.ProductWhereInput;
};

export const getProductList = async (page: number, search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const skip = (page - 1) * pageSize;

    const where = buildProductWhere(search);

    const products = await prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: "asc" },
        // select: { id: true, name: true, price: true, factory: true } // nếu muốn tối ưu payload
    });

    return products;
};

export const countTotalProductPages = async (search?: string) => {
    const pageSize = TOTAL_ITEM_PER_PAGE;
    const where = buildProductWhere(search);

    const total = await prisma.product.count({ where });
    return Math.max(1, Math.ceil(total / pageSize));
};
export async function createProduct(data: {
    name: string; price: number; quantity: number; factory: string; target: string;
    discount?: number; detailDesc?: string; shortDesc?: string; imageUpload?: string | null;
    cpu?: string | null; ramGB?: number | null; storageGB?: number | null;
    storageType?: "HDD" | "SSD" | "NVME" | null;
    screenResolution?: "FHD" | "QHD" | "4K" | null;    // chú ý nếu enum Prisma là _4K thì cần map
    screenSizeInch?: number | null;
    featureTags?: string | null;
}) {
    // Nếu enum Prisma đặt là _4K:
    // If your Prisma schema uses string enums for screenResolution, just return the string value.
    const mapResolution = (v?: string | null): string | null => {
        if (!v) return null;
        if (v === "4K") return "_4K"; // map to your actual enum value if needed
        return v; // FHD / QHD
    };

    const payload: Prisma.ProductCreateInput = {
        name: data.name,
        price: data.price,
        discount: data.discount ?? 0,
        detailDesc: data.detailDesc ?? "",
        shortDesc: data.shortDesc ?? "",
        quantity: data.quantity,
        factory: data.factory,
        target: data.target,
        ...(data.imageUpload ? { image: data.imageUpload } : {}),

        // Specs (chỉ gán nếu model có các field tương ứng)
        cpu: data.cpu ?? null,
        ramGB: data.ramGB ?? null,
        storageGB: data.storageGB ?? null,
        storageType: data.storageType ?? null,
        screenResolution: mapResolution(data.screenResolution ?? null),
        screenSizeInch: data.screenSizeInch ?? null,
        featureTags: data.featureTags ?? null,
    };

    return prisma.product.create({ data: payload });
}

export async function updateProductById(data: UpdateProductInput) {
    const { id, image, ...rest } = data;
    return prisma.product.update({
        where: { id },
        data: {
            ...rest,
            ...(image !== undefined ? { image } : {}),
        },
    });
}

export async function deleteProductById(id: number) {
    return prisma.product.delete({ where: { id } });
}

export async function getProductById(id: number) {
    return prisma.product.findUnique({ where: { id } });
}
