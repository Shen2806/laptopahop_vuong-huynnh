import { prisma } from "config/client";
import { hashPassword } from "services/user.service";
import { ACCOUNT_TYPE } from "config/constant";

const initDatabase = async () => {
    const countUser = await prisma.user.count();
    const countRole = await prisma.role.count();
    const countProduct = await prisma.product.count();

    if (countRole === 0) {
        await prisma.role.createMany({
            data: [
                {
                    name: "ADMIN",
                    description: "Admin thì full quyền"
                },
                {
                    name: "USER",
                    description: "User thông thường"
                },
            ]
        })
    }

    if (countUser === 0) {
        const defaultPassword = await hashPassword("123456");
        const adminRole = await prisma.role.findFirst({
            where: { name: "ADMIN" }
        })
        if (adminRole) {
            await prisma.user.createMany({
                data: [
                    {
                        fullName: "Hỏi Dân IT",
                        username: "hoidanit@gmail.com",
                        password: defaultPassword,
                        accountType: ACCOUNT_TYPE.SYSTEM,
                        roleId: adminRole.id
                    },
                    {
                        fullName: "Admin",
                        username: "admin@gmail.com",
                        password: defaultPassword,
                        accountType: ACCOUNT_TYPE.SYSTEM,
                        roleId: adminRole.id
                    },
                ]
            })
        }

    }

    if (countProduct === 0) {
        const products = [
            {
                name: "Laptop Asus TUF Gaming",
                price: 17490000,
                detailDesc:
                    "ASUS TUF Gaming F15 FX506HF-HN017W: i5-11400H + RTX 2050, sẵn 16GB RAM, SSD NVMe 512GB, màn 15.6\" FHD 144Hz, khung máy chuẩn bền MIL-STD-810H.",
                shortDesc: "i5-11400H • RTX 2050 • 16GB • 512GB • 15.6\" FHD 144Hz",
                quantity: 100,
                factory: "ASUS",
                target: "GAMING",
                image: "1711078092373-asus-01.png",
                // specs mới
                cpu: "Intel Core i5-11400H",
                ramGB: 16,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "RTX 2050 4GB;144Hz;Wi-Fi 6;RGB keyboard;MIL-STD-810H"
            },
            {
                name: "Laptop Dell Inspiron 15",
                price: 15490000,
                detailDesc:
                    "Dell Inspiron 15 3520: i5-1235U, RAM 16GB, SSD NVMe 512GB, màn 15.6\" FHD 120Hz — tối ưu cho công việc hằng ngày.",
                shortDesc: "i5-1235U • 16GB • 512GB • 15.6\" FHD 120Hz",
                quantity: 200,
                factory: "DELL",
                target: "SINHVIEN-VANPHONG",
                image: "1711078452562-dell-01.png",
                cpu: "Intel Core i5-1235U",
                ramGB: 16,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "120Hz;Wi-Fi 6;Backlit keyboard"
            },
            {
                name: "Lenovo IdeaPad Gaming 3",
                price: 19500000,
                detailDesc:
                    "IdeaPad Gaming 3 (15”) i5-10300H + GTX 1650, RAM 8GB, SSD 512GB, màn 15.6\" FHD 120Hz — thiết kế tối giản, mát mẻ.",
                shortDesc: "i5-10300H • GTX 1650 • 8GB • 512GB • 15.6\" FHD 120Hz",
                quantity: 150,
                factory: "LENOVO",
                target: "GAMING",
                image: "1711079073759-lenovo-01.png",
                cpu: "Intel Core i5-10300H",
                ramGB: 8,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "GTX 1650 4GB;120Hz;Wi-Fi 6"
            },
            {
                name: "Asus K501UX",
                price: 11900000,
                detailDesc:
                    "ASUS K501UX vỏ kim loại mỏng nhẹ: i5-6200U, RAM 8GB, SSD 256GB, GPU GeForce GTX 950M, màn 15.6\" FHD.",
                shortDesc: "i5-6200U • GTX 950M • 8GB • 256GB • 15.6\" FHD",
                quantity: 99,
                factory: "ASUS",
                target: "THIET-KE-DO-HOA",
                image: "1711079496409-asus-02.png",
                cpu: "Intel Core i5-6200U",
                ramGB: 8,
                storageGB: 256,
                storageType: "SSD",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "GTX 950M 4GB;Aluminum body;Backlit keyboard"
            },
            {
                name: "MacBook Air 13",
                price: 17690000,
                detailDesc:
                    "MacBook Air 13 (2020) chip Apple M1, RAM 8GB, SSD 256GB, màn Retina 13.3\" 2560×1600, Touch ID, Wi-Fi 6.",
                shortDesc: "Apple M1 • 8GB • 256GB • 13.3\" 2560×1600",
                quantity: 99,
                factory: "APPLE",
                target: "GAMING", // giữ nguyên target cũ của bạn
                image: "1711079954090-apple-01.png",
                cpu: "Apple M1 8-core",
                ramGB: 8,
                storageGB: 256,
                storageType: "NVME",
                screenSizeInch: 13.3,
                screenResolution: "QHD", // 2560×1600 ~ “2.5K” (map tạm sang QHD enum)
                featureTags: "Retina;Touch ID;Wi-Fi 6;Fanless"
            },
            {
                name: "Laptop LG Gram Style",
                price: 31490000,
                detailDesc:
                    "LG gram Style 14 (14Z90RS): Core i7-1360P, RAM 16GB, SSD 512GB, màn OLED 14\" 2880×1800 90Hz, siêu nhẹ ~1kg.",
                shortDesc: "i7-1360P • 16GB • 512GB • 14\" 2880×1800 90Hz OLED",
                quantity: 99,
                factory: "LG",
                target: "DOANH-NHAN",
                image: "1711080386941-lg-01.png",
                cpu: "Intel Core i7-1360P",
                ramGB: 16,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 14.0,
                screenResolution: "QHD", // 2880×1800 ≈ “2.8K” (map sang QHD enum)
                featureTags: "OLED 90Hz;~1.0kg;Wi-Fi 6E"
            },
            {
                name: "MacBook Air 13",
                price: 24990000,
                detailDesc:
                    "MacBook Air 13 (2022) chip Apple M2, RAM 8GB, SSD 256GB, màn 13.6\" 2560×1664 (Liquid Retina), MagSafe 3, Wi-Fi 6.",
                shortDesc: "Apple M2 • 8GB • 256GB • 13.6\" 2560×1664",
                quantity: 99,
                factory: "APPLE",
                target: "MONG-NHE",
                image: "1711080787179-apple-02.png",
                cpu: "Apple M2 8-core",
                ramGB: 8,
                storageGB: 256,
                storageType: "NVME",
                screenSizeInch: 13.6,
                screenResolution: "QHD", // 2560×1664 ~ 2.5K (map sang QHD enum)
                featureTags: "Liquid Retina;MagSafe 3;Wi-Fi 6;1080p camera"
            },
            {
                name: "Laptop Acer Nitro",
                price: 23490000,
                detailDesc:
                    "Acer Nitro 5 AN515-58-769J: i7-12700H, RAM 16GB, SSD 512GB, RTX 3050, màn 15.6\" FHD 144Hz.",
                shortDesc: "i7-12700H • RTX 3050 • 16GB • 512GB • 15.6\" FHD 144Hz",
                quantity: 99,
                factory: "ACER",
                target: "SINHVIEN-VANPHONG",
                image: "1711080948771-acer-01.png",
                cpu: "Intel Core i7-12700H",
                ramGB: 16,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "RTX 3050 4GB;144Hz;Wi-Fi 6"
            },
            {
                name: "Laptop Acer Nitro V",
                price: 26999000,
                detailDesc:
                    "Acer Nitro V 15 (ANV15-51): i5-13420H, RAM 16GB, SSD 512GB, RTX 4050, màn 15.6\" FHD 144Hz.",
                shortDesc: "i5-13420H • RTX 4050 • 16GB • 512GB • 15.6\" FHD 144Hz",
                quantity: 99,
                factory: "ACER", // sửa lại cho đúng (trước đây bạn set nhầm ASUS)
                target: "MONG-NHE",
                image: "1711081080930-asus-03.png",
                cpu: "Intel Core i5-13420H",
                ramGB: 16,
                storageGB: 512,
                storageType: "NVME",
                screenSizeInch: 15.6,
                screenResolution: "FHD",
                featureTags: "RTX 4050 6GB;144Hz;Wi-Fi 6"
            },
            {
                name: "Laptop Dell Latitude 3420",
                price: 21399000,
                detailDesc:
                    "Dell Latitude 3420: i5-1135G7, RAM 16GB, SSD 256GB, màn 14\" FHD 60Hz — gọn nhẹ cho doanh nghiệp.",
                shortDesc: "i5-1135G7 • 16GB • 256GB • 14\" FHD",
                quantity: 99,
                factory: "DELL",
                target: "MONG-NHE",
                image: "1711081278418-dell-02.png",
                cpu: "Intel Core i5-1135G7",
                ramGB: 16,
                storageGB: 256,
                storageType: "NVME",
                screenSizeInch: 14.0,
                screenResolution: "FHD",
                featureTags: "Iris Xe;Wi-Fi 5;54Wh"
            }
        ];

        await prisma.product.createMany({ data: products });
    }

    if (countRole !== 0 && countUser !== 0 && countProduct !== 0) {
        console.log(">>> ALREADY INIT DATA...");
    }

}

export default initDatabase;