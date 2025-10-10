import { prisma } from 'config/client';
import { upsertMemoryEmbedding } from './embedding.service';

// Ghép text “giàu ngữ cảnh” từ product
function productToKB(p: any) {
    const price = (Number(p.price || 0) - Math.round(Number(p.price || 0) * (Number(p.discount || 0) / 100))).toLocaleString('vi-VN') + '₫';
    return [
        `SẢN PHẨM: ${p.name}`,
        p.shortDesc ? `MÔ TẢ NGẮN: ${p.shortDesc}` : '',
        p.detailDesc ? `CHI TIẾT: ${p.detailDesc}` : '',
        p.cpu ? `CPU: ${p.cpu}` : '',
        p.ramGB ? `RAM: ${p.ramGB}GB` : '',
        p.storageGB ? `SSD: ${p.storageGB}GB` : '',
        p.featureTags ? `TAGS: ${p.featureTags}` : '',
        p.target ? `PHÂN KHÚC: ${p.target}` : '',
        p.factory ? `HÃNG: ${p.factory}` : '',
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
            const mem = await prisma.aiMemory.create({
                data: { key, value, type: 'FACT', score: 0.9 }
            });
            await upsertMemoryEmbedding(mem.id, `${key}: ${value}`);
        }
        upserted++;
    }
    return { upserted };
}

/** Xoá KB cũ theo prefix nếu cần */
export async function dropKB(prefix = 'KB:PRODUCT:') {
    const list = await prisma.aiMemory.findMany({ where: { key: { startsWith: prefix }, userId: null, sessionId: null } });
    for (const m of list) {
        await prisma.aiEmbedding.deleteMany({ where: { memoryId: m.id } }).catch(() => { });
        await prisma.aiMemory.delete({ where: { id: m.id } }).catch(() => { });
    }
    return { removed: list.length };
}
