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

const getMinPrice = async (minPrice: number) => {
    return await prisma.product.findMany({
        where: {
            price: {
                gte: minPrice
            }
        }
    })
}

const getMaxPrice = async (maxPrice: number) => {
    return await prisma.product.findMany({
        where: {
            price: {
                lte: maxPrice
            }
        }
    })
}

// lấy 1 hãng sản xuất
const getFactory = async (factory: string) => {
    return await prisma.product.findMany({
        where: {
            factory: {
                equals: factory
            }
        }
    })
}

// Lấy nhiều hãng sản xuất
const getManyFactory = async (factoryArray: string[]) => {
    return await prisma.product.findMany({
        where: {
            factory: {
                in: factoryArray
            }
        }
    })
}

// khoảng giá từ A <= price <= B
const getAboutPrice = async (min: number, max: number) => {
    return await prisma.product.findMany({
        where: {
            price: {
                gte: min,
                lte: max
            }
        }
    })
}

// khoảng giá từ A <= price <= B & C <= price <= D
const getRangePrice = async () => {
    return await prisma.product.findMany({
        where: {
            OR: [
                {
                    price: { gte: 10000000, lte: 15000000 }
                },
                {
                    price: { gte: 16000000, lte: 20000000 }
                }
            ]
        }
    })
}

// Lọc sản phẩm theo thứ tự tăng dần
const getSortIncProduct = async () => {
    return await prisma.product.findMany({
        orderBy: {
            price: 'asc'
        }
    })
}
// lọc sản phẩm theo thứ tự giảm dần
const getSortDescProduct = async () => {
    return await prisma.product.findMany({
        orderBy: {
            price: 'desc'
        }
    })
}

const getProductWithFilter = async (page: number,
    pageSize: number, factory: string,
    target: string,
    price: string,
    sort: string) => {
    // build where query
    let whereClause: any = {}

    if (factory) {
        const factoryInput = factory.split(",");
        whereClause.factory = {
            in: factoryInput
        }
    }
    // whereClause = {
    //     factory: {...}
    // }
    if (target) {
        const targetInput = target.split(",");
        whereClause.target = {
            in: targetInput
        }
    }
    // whereClause = {
    //     factory: {...}
    //     target: {...}
    // }

    if (price) {
        const priceInput = price.split(",");
        ['duoi-10-trieu', '10-15-trieu', '15-20-trieu', 'tren-20-trieu'];

        const priceCondition = [];

        for (let i = 0; i < priceInput.length; i++) {
            if (priceInput[i] === 'duoi-10-trieu') {
                priceCondition.push({ "price": { "lt": 10000000 } })
            }
            if (priceInput[i] === '10-15-trieu') {
                priceCondition.push({ "price": { "gte": 10000000, "lte": 15000000 } })
            }
            if (priceInput[i] === '15-20-trieu') {
                priceCondition.push({ "price": { "gte": 15000000, "lte": 20000000 } })
            }
            if (priceInput[i] === 'tren-20-trieu') {
                priceCondition.push({ "price": { "gt": 20000000 } })
            }

        }
        whereClause.OR = priceCondition;
    }
    // build where query
    let orderByClause: any = {}

    if (sort) {
        if (sort === "gia-tang-dan") {
            orderByClause = { price: 'asc' };
        }
        if (sort === "gia-giam-dan") {
            orderByClause = { price: 'desc' };
        }
    }

    const skip = (page - 1) * pageSize;
    const [products, count] = await prisma.$transaction([
        prisma.product.findMany({
            skip: skip,
            take: pageSize,
            where: whereClause,
            orderBy: orderByClause
        }),
        prisma.product.count({ where: whereClause })
    ]);
    const totalPages = Math.ceil(count / pageSize);

    return { products, totalPages }
}


export { userFilter, getMinPrice, getMaxPrice, getFactory, getManyFactory, getAboutPrice, getRangePrice, getSortIncProduct, getProductWithFilter, getSortDescProduct }; 