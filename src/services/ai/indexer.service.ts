import { prisma } from 'config/client';
import { upsertMemoryEmbedding } from './embedding.service';

// Ghép text “giàu ngữ cảnh” từ product (theo schema MySQL của bạn)
function productToKB(p: any) {
    // Giá sau discount (%)
    const priceRaw = Number(p.price || 0);
    const price = (priceRaw - Math.round(priceRaw * (Number(p.discount || 0) / 100))).toLocaleString('vi-VN') + '₫';

    return [
        `SẢN PHẨM: ${p.name}`,
        p.shortDesc ? `MÔ TẢ NGẮN: ${p.shortDesc}` : '',
        p.detailDesc ? `CHI TIẾT: ${p.detailDesc}` : '',
        p.factory ? `HÃNG: ${p.factory}` : '',
        p.target ? `PHÂN KHÚC: ${p.target}` : '',

        p.cpu ? `CPU: ${p.cpu}` : '',
        (p.ramGB != null) ? `RAM: ${p.ramGB}GB` : '',
        (p.storageGB != null || p.storageType) ? `LƯU TRỮ: ${p.storageGB ?? ''}GB ${p.storageType ?? ''}`.trim() : '',

        (p.screenSizeInch != null || p.screenResolution)
            ? `MÀN: ${p.screenSizeInch ?? ''}" ${p.screenResolution ?? ''}`.trim()
            : '',

        p.featureTags ? `TAGS: ${p.featureTags}` : '',
        `GIÁ: ${price}`,
        `LINK: /product/${p.id}`
    ].filter(Boolean).join('\n');
}

/** Đẩy toàn bộ product -> AiMemory (KB:PRODUCT:<id>) + embedding */
export async function reindexProductsToKB() {
    const products = await prisma.product.findMany({ take: 5000 });
    let upserted = 0;

    for (const p of products) {
        const key = `KB:PRODUCT:${p.id}`;
        const value = productToKB(p);
        const exist = await prisma.aiMemory.findFirst({ where: { key, userId: null, sessionId: null } });
        if (exist) {
            await prisma.aiMemory.update({ where: { id: exist.id }, data: { value, type: 'FACT', score: 0.9 } });
            await upsertMemoryEmbedding(exist.id, `${key}: ${value}`);
        } else {
            const mem = await prisma.aiMemory.create({ data: { key, value, type: 'FACT', score: 0.9 } });
            await upsertMemoryEmbedding(mem.id, `${key}: ${value}`);
        }
        upserted++;
    }
    return { upserted };
}

/** Xoá KB theo prefix (mặc định: KB:PRODUCT:) */
export async function dropKB(prefix = 'KB:PRODUCT:') {
    const list = await prisma.aiMemory.findMany({
        where: { key: { startsWith: prefix }, userId: null, sessionId: null }
    });
    for (const m of list) {
        await prisma.aiEmbedding.deleteMany({ where: { memoryId: m.id } }).catch(() => { });
        await prisma.aiMemory.delete({ where: { id: m.id } }).catch(() => { });
    }
    return { removed: list.length };
}

/**
 * Seed KB canonical cho chính sách/quy trình (đổi trả/bảo hành/giao hàng...) — tăng hit rate policy.
 * items: Array<{ key: string, value: string, score?: number }>
 *  - key sẽ được chuẩn hóa thành "KB:CANONICAL:QA:<key>"
 */
export async function seedCanonicalQA(items: Array<{ key: string, value: string, score?: number }>) {
    let upserted = 0;
    for (const it of items) {
        const k = `KB:CANONICAL:QA:${String(it.key).trim()}`;
        const v = String(it.value || '').trim();
        const s = typeof it.score === 'number' ? it.score : 0.95;
        if (!k || !v) continue;

        const exist = await prisma.aiMemory.findFirst({ where: { key: k, userId: null, sessionId: null } });
        if (exist) {
            await prisma.aiMemory.update({ where: { id: exist.id }, data: { value: v, type: 'FACT', score: s } });
            await upsertMemoryEmbedding(exist.id, `${k}: ${v}`);
        } else {
            const mem = await prisma.aiMemory.create({ data: { key: k, value: v, type: 'FACT', score: s } });
            await upsertMemoryEmbedding(mem.id, `${k}: ${v}`);
        }
        upserted++;
    }
    return { upserted };
}
