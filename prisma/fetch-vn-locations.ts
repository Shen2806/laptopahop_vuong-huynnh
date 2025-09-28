import fs from 'fs';
import path from 'path';
import axios from 'axios';

type Ward = { code: number; name: string; division_type?: string; type?: string };
type District = { code: number; name: string; division_type?: string; type?: string; wards?: Ward[] };
type Province = { code: number; name: string; division_type?: string; type?: string; districts?: District[] };

const API = 'https://provinces.open-api.vn/api/v1'; // dùng v1 để có depth=3

const normType = (s?: string | null) => {
    if (!s) return undefined;
    // API trả 'thành phố trung ương', 'tỉnh', 'quận', 'huyện', 'phường'...
    // Bạn đang lưu 'Thành phố', 'Tỉnh', 'Quận', 'Huyện', 'Phường' ... -> viết hoa chữ cái đầu
    const t = s.trim();
    // đơn giản hoá:
    if (/tỉnh/i.test(t)) return 'Tỉnh';
    if (/thành phố/i.test(t)) return 'Thành phố';
    if (/quận/i.test(t)) return 'Quận';
    if (/huyện/i.test(t)) return 'Huyện';
    if (/thị xã/i.test(t)) return 'Thị xã';
    if (/phường/i.test(t)) return 'Phường';
    if (/xã/i.test(t)) return 'Xã';
    if (/thị trấn/i.test(t)) return 'Thị trấn';
    return t.charAt(0).toUpperCase() + t.slice(1);
};

async function fetchAll(): Promise<any[]> {
    const provinces: Province[] = (await axios.get(`${API}/?depth=1`)).data;

    const result: any[] = [];
    for (const p of provinces) {
        // Lấy full 3 cấp cho từng tỉnh
        const full = (await axios.get(`${API}/p/${p.code}?depth=3`)).data as Province;

        result.push({
            code: full.code,
            name: full.name,
            type: normType(full.division_type || full.type),
            districts: (full.districts || []).map((d) => ({
                code: d.code,
                name: d.name,
                type: normType(d.division_type || d.type),
                wards: (d.wards || []).map((w) => ({
                    code: w.code,
                    name: w.name,
                    type: normType(w.division_type || w.type),
                })),
            })),
        });
    }
    return result;
}

async function main() {
    const data = await fetchAll();
    const outPath = path.join(process.cwd(), 'prisma', 'data', 'vn_locations.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Saved:', outPath, '— provinces:', data.length);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
