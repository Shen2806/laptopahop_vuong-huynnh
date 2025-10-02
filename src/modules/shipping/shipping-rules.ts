export type RegionKey = 'HN_INNER' | 'HCM_INNER' | 'NEAR' | 'FAR';

export interface ShipRule {
    base: number;           // phí cơ bản (VND)
    codSurcharge?: number;  // phụ thu khi COD
    note?: string;
}

export const SHIPPING_RULES: Record<RegionKey, ShipRule> = {
    HN_INNER: { base: 15000, codSurcharge: 0, note: 'Nội thành Hà Nội' },
    HCM_INNER: { base: 15000, codSurcharge: 0, note: 'Nội thành TP.HCM' },
    NEAR: { base: 25000, codSurcharge: 5000, note: 'Nội miền' },
    FAR: { base: 35000, codSurcharge: 5000, note: 'Liên miền' },
};

// Mapping mã tỉnh (ví dụ): Hà Nội/HCM
const HN_PROVINCE = 1;
const HCM_PROVINCE = 79;

// Nếu có danh sách quận nội thành thực tế, nhét vào 2 set này:
const HN_INNER_DIST = new Set<number>([/* 101, 102, ... */]);
const HCM_INNER_DIST = new Set<number>([/* 760, 761, ... */]);

// Chia miền: (điền theo dataset của bạn – tạm đặt khung)
const NORTH = new Set<number>([1, 2, 4, 6, 8, 10, 11, 12, 14, 15, 17, 19, 20, 22, 24]);
const CENTRAL = new Set<number>([26, 27, 30, 31, 32, 33, 34, 35, 36, 40, 42, 44, 45, 46]);
const SOUTH = new Set<number>([48, 49, 51, 52, 54, 56, 58, 60, 62, 64, 66, 67, 68, 70, 72, 74, 75, 77, 79]);

function sameRegion(p?: number | null) {
    if (!p) return true;
    if (NORTH.has(p) || CENTRAL.has(p) || SOUTH.has(p)) return true;
    return false;
}

export function classifyRegion(provinceCode?: number | null, districtCode?: number | null): RegionKey {
    if (provinceCode === HN_PROVINCE && districtCode && HN_INNER_DIST.has(districtCode)) return 'HN_INNER';
    if (provinceCode === HCM_PROVINCE && districtCode && HCM_INNER_DIST.has(districtCode)) return 'HCM_INNER';
    if (sameRegion(provinceCode)) return 'NEAR';
    return 'FAR';
}

export function calcShipping(opts: {
    paymentMethod: 'COD' | 'ONLINE',
    provinceCode?: number | null,
    districtCode?: number | null
}) {
    const { paymentMethod, provinceCode, districtCode } = opts;
    const region = classifyRegion(provinceCode, districtCode);
    const rule = SHIPPING_RULES[region];
    const fee = rule.base + (paymentMethod === 'COD' ? (rule.codSurcharge ?? 0) : 0);
    return { fee, region, note: rule.note };
}
