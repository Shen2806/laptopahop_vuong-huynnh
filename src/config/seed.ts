import { prisma } from "config/client";
import { hashPassword } from "services/user.service";
import { ACCOUNT_TYPE } from "config/constant";

const initDatabase = async () => {
    const countUser = await prisma.user.count();
    const countRole = await prisma.role.count();
    const countProduct = await prisma.product.count();

    // 🔁 Thay thế khối seed role cũ
    {
        // helper: đảm bảo 1 role tồn tại (tạo nếu thiếu)
        const ensureRole = (name: string, description: string) =>
            prisma.role.upsert({
                where: { name },      // name là unique
                update: {},           // không sửa description nếu đã có (tránh ghi đè)
                create: { name, description },
            });
        // ===== Seed PERMISSIONS & MAP ROLE =====
        const PERMS = [
            // Nhân sự & role
            "staff.view", "staff.create", "staff.update", "staff.delete", "role.manage",
            // Dashboard
            "dashboard.view",
            // Khách hàng
            "customer.view", "customer.update",
            // Sản phẩm & kho
            "product.view", "product.create", "product.update", "product.delete",
            "inventory.view", "inventory.adjust", "inventory.import", "inventory.export", "inventory.stocktake",
            // Fulfillment/Đơn hàng/Vận đơn/Trả hàng
            "order.view", "order.create", "order.update", "order.refund", "order.fulfill",
            "fulfillment.pick", "fulfillment.pack", "fulfillment.label", "fulfillment.handover",
            "shipment.view", "shipment.create", "shipment.assign", "shipment.update_status",
            "returns.receive", "returns.inspect",
            // Giao hàng (courier)
            "delivery.view_assigned", "delivery.update_status", "delivery.pod_upload", "delivery.returns_pickup",
            // Marketing & nội dung
            "promo.view", "promo.create", "promo.update", "promo.delete",
            "coupon.view", "coupon.create", "coupon.update", "coupon.delete",
            "blog.view", "blog.create", "blog.update", "blog.delete",
            // Hỗ trợ
            "chat.view", "chat.reply", "qa.view", "qa.moderate",
        ] as const;

        const ensurePermission = (name: string, description?: string) =>
            prisma.permission.upsert({
                where: { name },
                update: {},
                create: { name, description },
            });

        await Promise.all(PERMS.map(p => ensurePermission(p)));

        const roleByName = async (name: string) =>
            prisma.role.findUnique({ where: { name } });

        // Map role → perms
        const MAP: Record<string, string[]> = {
            ADMIN: ["*"],

            OPS_MANAGER: [
                "dashboard.view",
                "product.view", "product.create", "product.update", "product.delete",
                "inventory.view", "inventory.adjust", "inventory.import", "inventory.export", "inventory.stocktake",
                "order.view", "order.fulfill",
                "fulfillment.pick", "fulfillment.pack", "fulfillment.label", "fulfillment.handover",
                "shipment.view", "shipment.create", "shipment.assign", "shipment.update_status",
                "returns.receive", "returns.inspect",
            ],

            OPS_STAFF: [
                "dashboard.view",
                "product.view",
                "inventory.view", "inventory.adjust",
                "order.view", "order.fulfill",
                "fulfillment.pick", "fulfillment.pack", "fulfillment.label", "fulfillment.handover",
                "shipment.view",
                "returns.receive",
                "delivery.view_assigned", "delivery.update_status", "delivery.pod_upload", "delivery.returns_pickup",
            ],

            SALES_SUPPORT: [
                "dashboard.view",
                "order.view", "order.create", "order.update", "order.refund",
                "customer.view", "customer.update",
                "chat.view", "chat.reply", "qa.view", "qa.moderate",
            ],

            MARKETING_CONTENT: [
                "dashboard.view",
                "promo.view", "promo.create", "promo.update", "promo.delete",
                "coupon.view", "coupon.create", "coupon.update", "coupon.delete",
                "blog.view", "blog.create", "blog.update", "blog.delete",
            ],

            // USER (khách): không map trong admin
        };

        const linkRolePerms = async (roleName: string, permNames: string[]) => {
            const role = await roleByName(roleName);
            if (!role) return;
            if (permNames.includes("*")) {
                // ADMIN: gắn tất cả
                const all = await prisma.permission.findMany();
                await prisma.$transaction(
                    all.map(p => prisma.rolePermission.upsert({
                        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
                        update: {},
                        create: { roleId: role.id, permissionId: p.id },
                    }))
                );
            } else {
                const perms = await prisma.permission.findMany({ where: { name: { in: permNames } } });
                await prisma.$transaction(
                    perms.map(p => prisma.rolePermission.upsert({
                        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
                        update: {},
                        create: { roleId: role.id, permissionId: p.id },
                    }))
                );
            }
        };

        await linkRolePerms("ADMIN", MAP.ADMIN);
        await linkRolePerms("OPS_MANAGER", MAP.OPS_MANAGER);
        await linkRolePerms("OPS_STAFF", MAP.OPS_STAFF);
        await linkRolePerms("SALES_SUPPORT", MAP.SALES_SUPPORT);
        await linkRolePerms("MARKETING_CONTENT", MAP.MARKETING_CONTENT);

        // 5 role staff + 1 role USER (khách) + ADMIN
        await Promise.all([
            ensureRole("ADMIN", "Admin thì full quyền"),
            ensureRole("OPS_MANAGER", "Quản lý vận hành: kho + fulfill + vận đơn/đổi trả + giao hàng"),
            ensureRole("OPS_STAFF", "Nhân viên vận hành kho/giao hàng: pick/pack/label/handover, cập nhật giao hàng"),
            ensureRole("SALES_SUPPORT", "Bán hàng + CSKH: đơn hàng, khách hàng, chat, Q&A"),
            ensureRole("MARKETING_CONTENT", "Khuyến mãi + mã giảm giá + blog"),
            ensureRole("USER", "User thông thường (khách hàng)"),
        ]);
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

    if (countProduct < 10) {
        // ===== CẤU HÌNH =====
        const factoryOptions = [
            { value: "APPLE", name: "Apple (MacBook)" },
            { value: "ASUS", name: "Asus" },
            { value: "LENOVO", name: "Lenovo" },
            { value: "DELL", name: "Dell" },
            { value: "LG", name: "LG" },
            { value: "ACER", name: "Acer" },
            { value: "HP", name: "HP" },
            { value: "MSI", name: "MSI" },
            { value: "GIGABYTE", name: "Gigabyte" },
            { value: "ALIENWARE", name: "Alienware" },
        ] as const;

        const PER_BRAND = 12; // 👉 Đổi thành 10..15 nếu muốn

        // ===== Helpers =====
        const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
        const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
        const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const targets = {
            GAMING: "GAMING",
            SVVP: "SINHVIEN-VANPHONG",
            TKDH: "THIET-KE-DO-HOA",
            MONG: "MONG-NHE",
            DN: "DOANH-NHAN",
        } as const;

        const resos = ["FHD", "QHD", "4K"] as const;
        const sizesCommon = [13.3, 14.0, 15.6, 16.0, 17.3];

        // Series/CPU theo hãng (đều là dòng có thật)
        const catalogs: Record<string, { series: string[]; cpus: string[]; extras?: string[]; sizes?: number[] }> = {
            APPLE: {
                series: ["MacBook Air", "MacBook Pro"],
                cpus: ["Apple M1 8‑core", "Apple M2 8‑core", "Apple M3 8‑core"],
                extras: ["Retina", "Liquid Retina", "MagSafe 3", "Wi‑Fi 6", "Touch ID"],
                sizes: [13.3, 13.6, 14.2, 16.2],
            },
            ASUS: {
                series: ["TUF Gaming", "ROG Strix", "ROG Zephyrus", "Vivobook", "Zenbook"],
                cpus: ["Intel Core i5‑12450H", "Intel Core i7‑12700H", "AMD Ryzen 7 7840HS"],
                extras: ["144Hz", "RGB keyboard", "Wi‑Fi 6", "MIL‑STD‑810H"],
            },
            LENOVO: {
                series: ["IdeaPad", "IdeaPad Gaming", "Legion", "ThinkPad E14", "Yoga"],
                cpus: ["Intel Core i5‑1240P", "Intel Core i7‑1260P", "AMD Ryzen 5 7530U"],
                extras: ["Backlit keyboard", "Wi‑Fi 6", "120Hz"],
            },
            DELL: {
                series: ["Inspiron", "Vostro", "Latitude", "G15"],
                cpus: ["Intel Core i5‑1235U", "Intel Core i7‑12650H", "Intel Core i5‑1135G7"],
                extras: ["Wi‑Fi 6", "120Hz", "Backlit keyboard"],
            },
            LG: {
                series: ["gram 14", "gram Style 14", "gram 16"],
                cpus: ["Intel Core i7‑1360P", "Intel Core i5‑1340P"],
                extras: ["OLED 90Hz", "~1.0kg", "Wi‑Fi 6E"],
            },
            ACER: {
                series: ["Nitro 5", "Nitro V 15", "Aspire 7", "Swift"],
                cpus: ["Intel Core i5‑13420H", "Intel Core i7‑12700H", "AMD Ryzen 5 7535HS"],
                extras: ["144Hz", "Wi‑Fi 6"],
            },
            HP: {
                series: ["Pavilion 15", "Victus 16", "Envy x360", "ProBook"],
                cpus: ["Intel Core i5‑1240P", "Intel Core i7‑13700H", "AMD Ryzen 7 7730U"],
                extras: ["Backlit keyboard", "Wi‑Fi 6"],
            },
            MSI: {
                series: ["Katana", "GF63", "Modern 14", "Prestige"],
                cpus: ["Intel Core i5‑12500H", "Intel Core i7‑12650H", "AMD Ryzen 7 7735HS"],
                extras: ["144Hz", "CoolerBoost", "Wi‑Fi 6"],
            },
            GIGABYTE: {
                series: ["Aero 14", "G5", "Aorus 15"],
                cpus: ["Intel Core i7‑13700H", "Intel Core i5‑12500H"],
                extras: ["144Hz", "Wi‑Fi 6", "RGB keyboard"],
            },
            ALIENWARE: {
                series: ["m15 R7", "x16", "m16"],
                cpus: ["Intel Core i7‑13700HX", "Intel Core i9‑13900HX"],
                extras: ["165Hz", "RGB keyboard", "Wi‑Fi 6E"],
            },
        };

        // GPU theo tier (đều là mẫu có thật)
        const gpuByTier = [
            "Iris Xe",
            "RTX 2050 4GB",
            "RTX 3050 6GB",
            "RTX 4050 6GB",
            "RTX 4060 8GB",
            "RTX 4070 8GB",
        ];

        // map series -> target
        const guessTarget = (brand: string, series: string): string => {
            const s = `${brand} ${series}`.toLowerCase();
            if (/(tuf|rog|legion|nitro|victus|katana|aorus|alienware|g15)/.test(s)) return targets.GAMING;
            if (/(zenbook|gram|air|swift|prestige|modern|envy|xps|probook)/.test(s)) return targets.MONG;
            if (/(thinkpad|latitude|vostro|probook|gram)/.test(s)) return targets.DN;
            if (/(ideapad|inspiron|vivobook|pavilion|aspire|modern)/.test(s)) return targets.SVVP;
            return targets.TKDH;
        };

        const basePrice = (brand: string, isGaming: boolean) => {
            if (brand === "ALIENWARE") return 38000000;
            if (brand === "APPLE") return 22000000;
            if (isGaming) return 19000000;
            return 15000000;
        };

        const buildShort = (
            cpu: string, gpu: string | null, ram: number, ssd: number,
            size: number, hz: number, res: "FHD" | "QHD" | "4K"
        ) => {
            const cpuTag = cpu.replace(/^Intel |^AMD |^Apple /, "");
            return `${cpuTag} • ${gpu || "iGPU"} • ${ram}GB • ${ssd}GB • ${size.toFixed(1)}" ${res} ${hz}Hz`;
        };

        // 👉 MÔ TẢ CHI TIẾT: HTML TinyMCE-friendly, chèn ảnh gallery (picsum) — luôn hiển thị
        const buildDetailDesc = (p: {
            name: string; factory: string; shortDesc: string; cpu: string; ramGB: number; storageGB: number;
            storageType: string; screenSizeInch: number; screenResolution: "FHD" | "QHD" | "4K"; featureTags: string; gpu?: string | null;
        }) => {
            const gpuText = p.gpu ? p.gpu : "Đồ họa tích hợp (iGPU)";
            const brand = p.factory;
            const s1 = `https://picsum.photos/seed/${encodeURIComponent(slug(p.name))}-1/900/560`;
            const s2 = `https://picsum.photos/seed/${encodeURIComponent(slug(p.name))}-2/900/560`;
            const s3 = `https://picsum.photos/seed/${encodeURIComponent(slug(p.name))}-3/900/560`;
            const feats = (p.featureTags || "").split(/[;|]/).map(s => s.trim()).filter(Boolean);

            return `
      <h2>${p.name} — Tổng quan</h2>
      <p>${brand} ${p.name.split(" ").slice(1).join(" ")} trang bị cấu hình <strong>${p.shortDesc}</strong>,
      phù hợp nhu cầu ${gpuText.includes("RTX") ? "chơi game/đồ họa" : "văn phòng - học tập"} với hiệu năng ổn định,
      thời lượng pin tốt và độ bền cao.</p>

      <h3>Điểm nổi bật</h3>
      <ul>
        <li>CPU: <strong>${p.cpu}</strong>, RAM <strong>${p.ramGB}GB</strong>, SSD <strong>${p.storageGB}GB ${p.storageType}</strong>.</li>
        <li>GPU: <strong>${gpuText}</strong>${gpuText.includes("RTX") ? " hỗ trợ DLSS/RTX cho game & đồ họa." : " cho công việc văn phòng mượt mà."}</li>
        <li>Màn hình: <strong>${p.screenSizeInch.toFixed(1)}"</strong> ${p.screenResolution}, độ mượt cao.</li>
        ${feats.length ? `<li>Tính năng: ${feats.map(x => `<span class="badge bg-light text-dark border me-1">${x}</span>`).join(" ")}</li>` : ""}
      </ul>

      <h3>Bảng thông số chính</h3>
      <table class="table table-bordered">
        <tbody>
          <tr><th>CPU</th><td>${p.cpu}</td></tr>
          <tr><th>GPU</th><td>${gpuText}</td></tr>
          <tr><th>RAM</th><td>${p.ramGB} GB</td></tr>
          <tr><th>Lưu trữ</th><td>${p.storageGB} GB ${p.storageType}</td></tr>
          <tr><th>Màn hình</th><td>${p.screenSizeInch.toFixed(1)}" ${p.screenResolution}</td></tr>
          <tr><th>Kết nối</th><td>Wi‑Fi 6 / Bluetooth 5.x / USB‑A, USB‑C, HDMI (tuỳ dòng)</td></tr>
        </tbody>
      </table>

      <h3>Thư viện ảnh</h3>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
        <figure><img src="${s1}" alt="${p.name} photo 1" style="width:100%;border-radius:8px"><figcaption style="font-size:12px;color:#777">Hình minh hoạ 1</figcaption></figure>
        <figure><img src="${s2}" alt="${p.name} photo 2" style="width:100%;border-radius:8px"><figcaption style="font-size:12px;color:#777">Hình minh hoạ 2</figcaption></figure>
        <figure><img src="${s3}" alt="${p.name} photo 3" style="width:100%;border-radius:8px"><figcaption style="font-size:12px;color:#777">Hình minh hoạ 3</figcaption></figure>
      </div>

      <h3>Ai nên mua?</h3>
      <p>${gpuText.includes("RTX")
                    ? "Game thủ, sinh viên đồ hoạ, dựng clip cơ bản cần máy mát và ổn định."
                    : "Học sinh/sinh viên, nhân viên văn phòng, doanh nhân cần máy gọn nhẹ, pin tốt."}
      </p>

      <h3>Bảo hành & Dịch vụ</h3>
      <ul>
        <li>Bảo hành chính hãng 12–24 tháng (tuỳ dòng), hỗ trợ tại TTBH nhà sản xuất.</li>
        <li>Đổi mới 10 ngày nếu lỗi nhà sản xuất, đủ hộp & phụ kiện.</li>
      </ul>
    `;
        };

        const products: any[] = [];

        for (const f of factoryOptions) {
            const cat = catalogs[f.value];
            const sizes = cat?.sizes || sizesCommon;
            const isGamingBrand = ["ASUS", "MSI", "ACER", "GIGABYTE", "ALIENWARE", "LENOVO"].includes(f.value);

            for (let i = 0; i < PER_BRAND; i++) {
                const series = pick(cat.series);
                const cpu = pick(cat.cpus);
                const size = pick(sizes);
                const res: "FHD" | "QHD" | "4K" = (f.value === "APPLE" ? pick(["QHD", "4K"]) : pick([...resos])) as any;
                const hz = f.value === "APPLE" ? pick([60, 90, 120]) : pick([60, 120, 144, 165]);

                const ramGB = pick([8, 16, 16, 32]);              // bias 16GB
                const storageGB = pick([256, 512, 512, 1024]);    // bias 512
                const storageType = storageGB >= 512 ? "NVME" : "SSD";

                const gpu = f.value === "APPLE"
                    ? null
                    : (isGamingBrand ? pick(gpuByTier.slice(1)) : pick([null, "RTX 2050 4GB", "RTX 3050 6GB", "Iris Xe"]));

                // Giá theo cấu hình (hợp lý)
                let price =
                    basePrice(f.value, isGamingBrand)
                    + (ramGB > 16 ? 1500000 : 0)
                    + (storageGB >= 1024 ? 2500000 : storageGB >= 512 ? 800000 : 0)
                    + (res === "4K" ? 2500000 : res === "QHD" ? 1200000 : 0)
                    + (hz >= 144 ? 800000 : hz >= 120 ? 400000 : 0)
                    + (gpu
                        ? (gpu.includes("4070") ? 7000000
                            : gpu.includes("4060") ? 5000000
                                : gpu.includes("4050") ? 3500000
                                    : 1800000)
                        : 0);

                const target = guessTarget(f.value, series);

                const pool = Array.from(new Set([
                    ...(cat.extras || []),
                    gpu || "Iris Xe",
                    `${hz}Hz`,
                    "Backlit keyboard",
                    "Wi‑Fi 6",
                    res === "4K" ? "UHD" : (res === "QHD" ? "2K" : "FHD"),
                ]));
                const featureTags = Array.from(new Set([pick(pool), pick(pool), pick(pool)])).join(";");

                const name = `${f.name} ${series} ${size.toFixed(1)}`;
                const shortDesc = buildShort(cpu, gpu, ramGB, storageGB, size, hz, res);

                // Thumbnail an toàn: no-image.png (bạn đặt file này vào /public/images/product/no-image.png)
                const image = "no-image.png";

                const pObj = {
                    name,
                    price,
                    detailDesc: "", // set sau bằng buildDetailDesc
                    shortDesc,
                    quantity: rand(25, 200),
                    factory: f.value,
                    target,
                    image,
                    cpu,
                    ramGB,
                    storageGB,
                    storageType,
                    screenSizeInch: size,        // 🔺 field trong DB là "screenSizeInch"
                    screenResolution: res,
                    featureTags,
                    // (optional) discount: 0,
                };

                // Mô tả chi tiết TinyMCE-friendly (khớp 100% với cấu hình)
                (pObj as any).detailDesc = buildDetailDesc({
                    name, factory: f.value, shortDesc, cpu, ramGB, storageGB,
                    storageType, screenSizeInch: size, screenResolution: res, featureTags, gpu: gpu || null
                });

                products.push(pObj);
            }
        }

        await prisma.product.createMany({ data: products });
        console.log(`[seed] Inserted ${products.length} products with detailed HTML descriptions`);
    }



    if (countRole !== 0 && countUser !== 0 && countProduct !== 0) {
        console.log(">>> ALREADY INIT DATA...");
    }
}



export default initDatabase;