import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

type WardJSON = { code: number; name: string; type?: string };
type DistrictJSON = { code: number; name: string; type?: string; wards: WardJSON[] };
type ProvinceJSON = { code: number; name: string; type?: string; districts: DistrictJSON[] };

async function main() {
    const jsonPath = path.join(__dirname, 'data', 'vn_locations.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const provinces: ProvinceJSON[] = JSON.parse(raw);

    // upsert provinces/districts/wards
    for (const p of provinces) {
        await prisma.province.upsert({
            where: { code: p.code },
            create: { code: p.code, name: p.name, type: p.type ?? null },
            update: { name: p.name, type: p.type ?? null },
        });

        for (const d of p.districts) {
            await prisma.district.upsert({
                where: { code: d.code },
                create: { code: d.code, name: d.name, type: d.type ?? null, provinceCode: p.code },
                update: { name: d.name, type: d.type ?? null, provinceCode: p.code },
            });

            for (const w of d.wards) {
                await prisma.ward.upsert({
                    where: { code: w.code },
                    create: { code: w.code, name: w.name, type: w.type ?? null, districtCode: d.code },
                    update: { name: w.name, type: w.type ?? null, districtCode: d.code },
                });
            }
        }
    }
    console.log('Seed VN locations: done');
}

main().finally(() => prisma.$disconnect());
