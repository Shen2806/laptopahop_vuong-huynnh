// src/services/ai/agent.service.ts
import { prisma } from 'config/client';
import { LocalProvider, ChatMessage } from './vendor/local';
import { retrieveContext } from './retrieve.service';
import { upsertMessageEmbedding } from './embedding.service';
import { maybeStoreMemories } from './memory.service';
import { answerCheck } from './answercheck.service';
import { polishVietnamese } from './style.service';

/* ======================= Helpers & constants ======================= */

const provider = new LocalProvider();

/* =================== Etiquette & Laptop Cheatsheet =================== */

// Văn phong: xưng "mình – bạn", thân thiện, không khoa trương
const STYLE_GUIDE_VI = `
- Ngắn gọn, thân thiện; xưng "mình – bạn".
- Luôn có câu mở đầu tích cực trước khi liệt kê sản phẩm.
- Không hứa suông. Không bịa thông số: thiếu thì nói "không rõ".
- Dùng đơn vị đúng chuẩn: GB, TB, Hz, inch, kg, Wh, "₫".
- Sau khi gợi ý, luôn kèm 1–2 lối rẽ: "cần mỏng nhẹ", "ưu tiên pin", "so sánh 1–1".
- Tôn trọng lựa chọn của khách; gợi ý nâng/giảm cấu hình tùy ngân sách.
`;

// Sổ tay tư vấn laptop (cốt lõi, ổn định theo thời gian)
const LAPTOP_CHEATSHEET = `
• CPU: U/P tiết kiệm điện cho văn phòng; H/HX cho gaming/đồ họa. Ưu tiên i5/R5 trở lên; i7/R7 cho gaming/creator.
• GPU: iGPU < RTX 3050 < 4050 (6GB) < 4060 (8GB) < 4070+. VRAM quan trọng cho dựng phim/3D.
• RAM: 16GB là "mốc an tâm" cho gaming/IT/đồ họa; ưu tiên dual-channel; 8GB chỉ nên cho văn phòng cơ bản.
• SSD: 512GB phổ biến; 1TB nếu edit video/đồ họa nhiều.
• Màn hình: 144Hz+ cho gaming; 2K/4K & 100% sRGB/DCI-P3 cho đồ họa; OLED đẹp nhưng lưu ý PWM/burn-in ở mức vừa phải.
• Cân nặng: <1.3kg mỏng nhẹ; 1.3–1.5kg di chuyển ổn; 1.5–1.8kg trung bình; >1.8kg nặng.
• Pin (Wh): 50Wh cơ bản; 70–80Wh tốt cho di chuyển.
• Tản nhiệt & độ ồn: quan trọng với gaming/HX; ưu tiên 2 quạt/ống đồng lớn.
• Cổng: USB-C PD/Thunderbolt 4 cho văn phòng/doanh nhân; LAN/HDMI full-size cho game/stream.
• Khuyến nghị nhanh:
  - Gaming 20–30tr: i5/R5 H + RTX 4050, RAM 16GB, SSD 512GB, 144Hz.
  - Văn phòng mỏng nhẹ: i5/R5 U/P, 16GB RAM, <1.3–1.4kg, pin 50–70Wh.
  - Đồ họa: i7/R7 H + RTX 4060, RAM 16–32GB, màn 2K/100% sRGB.
  - IT/lập trình: ưu tiên CPU đa nhân + RAM 16–32GB, SSD 1TB nếu chạy nhiều container/VM.
`;

// ====== Fuzzy find by name ======
// bỏ các từ vô nghĩa khi match tên
const STOPWORDS = new Set(["laptop", "may", "may tinh", "san pham", "product", "máy", "sản", "phẩm"]);

function toTokens(s: string) {
    return deaccent(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
function jaccardScore(qTokens: string[], name: string) {
    const ntoks = toTokens(name);
    const qs = new Set(qTokens), ns = new Set(ntoks);
    let inter = 0; for (const t of qs) if (ns.has(t)) inter++;
    const uni = qs.size + ns.size - inter || 1;
    return inter / uni;
}

/** parse "so sánh A vs B" | "so sanh A voi B" */
function parseCompareNamesMulti(text: string): string[] {
    const t = deaccent(text).replace(/^so\s*sanh(?:\s*san\s*pham)?\s*/, '').trim();
    return t.split(/\s*(?:vs|v\/s|v\.s\.|voi|với|va|và|,)\s*/i)
        .map(s => s.trim()).filter(Boolean).slice(0, 4);
}

// ⭐ changed: nhận diện số lượng mong muốn: “gửi 5 mẫu”, “cho mình 3 máy”…
function parseWantedCount(text: string) {
    const m = text.match(/(\d{1,2})\s*(?:m[ãa]u|m[áa]y|con|options?)/i);
    return m ? Math.min(12, Math.max(1, parseInt(m[1], 10))) : undefined;
}

function vnMil(n?: number) {
    if (!n && n !== 0) return '';
    return Math.round(n / 1_000_000) + 'tr';
}
function humanTarget(t?: string) {
    switch (t) {
        case 'GAMING': return 'gaming';
        case 'SINHVIEN-VANPHONG': return 'văn phòng/học tập';
        case 'MONG-NHE': return 'mỏng nhẹ di chuyển';
        case 'THIET-KE-DO-HOA': return 'đồ hoạ';
        case 'DOANH-NHAN': return 'doanh nhân';
        default: return undefined;
    }
}
function describeFilters(f: { brand?: string | string[]; target?: string; min?: number; max?: number }) {
    const bits: string[] = [];
    const tg = humanTarget(f.target);
    if (tg) bits.push(tg);
    if (f.brand) bits.push('hãng ' + (Array.isArray(f.brand) ? f.brand.join('/') : f.brand));
    if (typeof f.min === 'number' || typeof f.max === 'number') {
        const b = (typeof f.min === 'number' ? vnMil(f.min) : '') + (f.max ? '–' + vnMil(f.max) : (f.min ? '+' : ''));
        bits.push('tầm giá ' + b);
    }
    return bits.length ? bits.join(', ') : 'tiêu chí bạn đưa';
}

async function buildLeadText(
    f: { brand?: string | string[]; target?: string; min?: number; max?: number },
    products: any[],
    reason?: string
) {
    const desc = describeFilters(f);
    const count = products.length;
    // ⭐ changed: giọng “thân thiện” + chủ động “gửi ngay”
    let lead = `Mình lọc nhanh theo **${desc}** và gửi bạn ${count} lựa chọn đáng cân nhắc.`;
    if (reason) lead += ` *(${reason})*`;
    if (count >= 2) {
        lead += ` Bạn xem qua, mình tinh chỉnh tiếp theo cân nặng, pin, màu hoặc so sánh 1–1 nhé.`;
    } else if (count === 1) {
        const p = products[0];
        lead += ` Mẫu khớp nhất hiện có là **${p.name}** (${p.specs}). Giá tham khảo: ${p.priceText}.`;
    }
    // Giữ văn phong lịch sự
    lead += `\n\n*Tip nhanh:* nếu bạn ưu tiên **mỏng nhẹ/pin** mình sẽ lọc lại khác với **FPS/hiệu năng** nhé.`; return polishVietnamese(lead + "", { persona: 'tu-van' });
}

function fmtMil(n?: number) { return typeof n === 'number' ? Math.round(n / 1e6) + 'tr' : ''; }
function targetLabel(t?: string) {
    if (!t) return '';
    return t === 'GAMING' ? 'cho nhu cầu gaming'
        : t === 'MONG-NHE' ? 'mỏng nhẹ/di chuyển'
            : t === 'SINHVIEN-VANPHONG' ? 'văn phòng/sinh viên'
                : t === 'THIET-KE-DO-HOA' ? 'đồ họa'
                    : t === 'DOANH-NHAN' ? 'doanh nhân'
                        : '';
}
function buildIntro(f: { brand?: string | string[], series?: string[], target?: string, min?: number, max?: number }, count: number) {
    const parts: string[] = [];
    if (f.brand) parts.push(Array.isArray(f.brand) ? f.brand.join('/') : f.brand);
    if (Array.isArray((f as any).series) && (f as any).series.length) parts.push((f as any).series.join('/'));
    const tLabel = targetLabel(f.target);
    if (tLabel) parts.push(tLabel);

    const who = parts.length ? `các mẫu **${parts.join(' • ')}**` : 'các mẫu phù hợp';
    const price =
        typeof f.min === 'number' || typeof f.max === 'number'
            ? ` trong tầm **${fmtMil(f.min)}${f.min && f.max ? '–' : ''}${fmtMil(f.max)}**`
            : '';

    return `Mình đã lọc được **${count}** ${who}${price}. Bên dưới là danh sách sắp xếp theo hiệu năng/giá – bạn tham khảo nhanh nhé:`;
}

function specDict(p: any) {
    const blob = `${p.featureTags || ''} ${p.shortDesc || ''} ${p.detailDesc || ''}`;
    const gpu = extractGPU(blob);
    const screen = extractScreen(blob) ||
        [p.screenSizeInch ? `${p.screenSizeInch}"` : '', p.screenResolution || ''].filter(Boolean).join(' ');
    const weight = (blob.match(/(\d+(?:\.\d+)?)\s?kg/i)?.[0]) || (p.weightKg ? `${p.weightKg}kg` : '');
    return {
        "CPU": p.cpu || "—",
        "GPU": gpu || "—",
        "RAM": p.ramGB ? `${p.ramGB}GB` : "—",
        "SSD": p.storageGB ? `${p.storageGB}GB` : "—",
        "Màn hình": screen || "—",
        "Cân nặng": weight || "—",
        "Giá tham khảo": productPriceText(p)
    };
}
const dictToRows = (d: Record<string, string>) =>
    Object.entries(d).map(([label, value]) => ({ label, value: String(value) }));

/* ===== So sánh chi tiết 2 máy: tính điểm theo mục đích & kết luận ===== */

function blobOf(p: any) {
    return `${p.name || ""} ${p.featureTags || ""} ${p.shortDesc || ""} ${p.detailDesc || ""}`.toUpperCase();
}

function cpuRank(cpu = "") {
    const s = cpu.toUpperCase();
    // Intel
    let score = /I9/.test(s) ? 900 : /I7/.test(s) ? 700 : /I5/.test(s) ? 500 : /I3/.test(s) ? 300 : 0;
    const gen = s.match(/(\d{3,5})/);
    if (gen) score += Math.min(200, Math.floor(parseInt(gen[1], 10) / 10));
    // AMD
    if (/R[579]/.test(s)) {
        if (/R9/.test(s)) score = Math.max(score, 900);
        else if (/R7/.test(s)) score = Math.max(score, 700);
        else if (/R5/.test(s)) score = Math.max(score, 500);
        const agen = s.match(/R[579]\-(\d{3,5})/);
        if (agen) score += Math.min(160, Math.floor(parseInt(agen[1], 10) / 12));
    }
    return score; // 0–~1100
}

function gpuRankFromText(blob = "") {
    const s = blob.toUpperCase();
    const rtx = s.match(/RTX\s?-?\s?(\d{3,4})/);
    if (rtx) return 10000 + parseInt(rtx[1], 10);
    const rx = s.match(/\bRX\s?-?\s?(\d{3,4})\b/);
    if (rx) return 9500 + parseInt(rx[1], 10);
    const gtx = s.match(/\bGTX\s?-?\s?(\d{3,4})\b/);
    if (gtx) return 9000 + parseInt(gtx[1], 10);
    if (/IRIS\s?XE|RADEON\s?GRAPHICS|UHD\s?GRAPHICS/.test(s)) return 2000;
    return 0;
}

function screenRank(blob = "") {
    const s = blob.toUpperCase();
    let sc = 0;
    if (/\b(144|165|240|360)\s?HZ\b/.test(s)) sc += 50;
    if (/\b(QHD|2K|3K|4K|UHD|RETINA|OLED)\b/.test(s)) sc += 50;
    if (/\b100%\s*S?RGB\b/.test(s)) sc += 20;
    return sc; // 0–120
}

function weightFromText(blob = "", fallback?: number) {
    const m = blob.match(/(\d+(?:\.\d+)?)\s?KG/i);
    if (m) return parseFloat(m[1]);
    return typeof fallback === "number" ? fallback : undefined;
}

function mobilityRank(p: any) {
    const b = blobOf(p);
    let score = 0;
    const w = weightFromText(`${b}`, (p.weightKg as number | undefined));
    if (typeof w === "number") {
        if (w <= 1.1) score += 100;
        else if (w <= 1.3) score += 80;
        else if (w <= 1.5) score += 60;
        else if (w <= 1.8) score += 40;
        else score += 20;
    }
    if (/M[OÕ]NG|NH[EẸ]|ULTRABOOK|MOBILE|DI CHUYEN/i.test(b)) score += 20;
    if (/\b(50|56|60|70|80|90|100)\s?WH\b/i.test(b)) score += 10;
    return score; // 0–~130
}

function displayLine(p: any) {
    const parts: string[] = [];
    if (p.cpu) parts.push(`CPU ${p.cpu}`);
    const g = extractGPU(blobOf(p));
    if (g) parts.push(`GPU ${g}`);
    if (p.ramGB) parts.push(`RAM ${p.ramGB}GB`);
    if (p.storageGB) parts.push(`SSD ${p.storageGB}GB`);
    const scr = extractScreen(blobOf(p));
    if (scr) parts.push(`Màn ${scr}`);
    return parts.join(' · ');
}

function buildCompareReport(a: any, b: any) {
    const ba = blobOf(a), bb = blobOf(b);

    const cpuA = cpuRank(a.cpu), cpuB = cpuRank(b.cpu);
    const gpuA = gpuRankFromText(ba), gpuB = gpuRankFromText(bb);
    const dispA = screenRank(ba), dispB = screenRank(bb);
    const mobA = mobilityRank(a), mobB = mobilityRank(b);

    const gamingA = gpuA * 1.0 + cpuA * 4;
    const gamingB = gpuB * 1.0 + cpuB * 4;
    const creatorA = gpuA * 0.9 + dispA * 6 + cpuA * 3;
    const creatorB = gpuB * 0.9 + dispB * 6 + cpuB * 3;
    const officeA = mobA * 6 + cpuA * 2;
    const officeB = mobB * 6 + cpuB * 2;
    const itA = cpuA * 6 + (a.ramGB || 0) * 1.5;
    const itB = cpuB * 6 + (b.ramGB || 0) * 1.5;

    function pick(aVal: number, bVal: number) { return aVal >= bVal ? 'A' : 'B'; }

    const picks = {
        gaming: pick(gamingA, gamingB),
        creator: pick(creatorA, creatorB),
        office: pick(officeA, officeB),
        it: pick(itA, itB),
    };

    const scoreTotA = gamingA * 1.0 + creatorA * 0.9 + itA * 0.6 + officeA * 0.4 + scoreProduct(a);
    const scoreTotB = gamingB * 1.0 + creatorB * 0.9 + itB * 0.6 + officeB * 0.4 + scoreProduct(b);
    const winner = scoreTotA >= scoreTotB ? 'A' : 'B';

    const aLine = displayLine(a) || a.shortDesc || '';
    const bLine = displayLine(b) || b.shortDesc || '';

    const recWhy: string[] = [];
    if (winner === 'A') {
        if (gpuA > gpuB) recWhy.push('GPU mạnh hơn');
        if (cpuA > cpuB) recWhy.push('CPU nhỉnh hơn');
        if (dispA > dispB) recWhy.push('màn hình tốt hơn');
        if (mobA > mobB) recWhy.push('tính di động tốt hơn');
    } else {
        if (gpuB > gpuA) recWhy.push('GPU mạnh hơn');
        if (cpuB > cpuA) recWhy.push('CPU nhỉnh hơn');
        if (dispB > dispA) recWhy.push('màn hình tốt hơn');
        if (mobB > mobA) recWhy.push('tính di động tốt hơn');
    }

    const recUse =
        `- Gaming: chọn **${picks.gaming}**\n` +
        `- Đồ hoạ/dựng phim: chọn **${picks.creator}**\n` +
        `- Văn phòng/di chuyển nhiều: chọn **${picks.office}**\n` +
        `- Sinh viên IT/lập trình: chọn **${picks.it}**`;

    const reply =
        `**So sánh chi tiết**
- **#1 ${a.name}** — ${aLine} — ${productPriceText(a)}
- **#2 ${b.name}** — ${bLine} — ${productPriceText(b)}

**Khác biệt chính**
- CPU: ${a.cpu || '?'} vs ${b.cpu || '?'}
- GPU: ${extractGPU(ba) || 'không rõ'} vs ${extractGPU(bb) || 'không rõ'}
- RAM/SSD: ${a.ramGB || '?'}GB / ${a.storageGB || '?'}GB vs ${b.ramGB || '?'}GB / ${b.storageGB || '?'}GB
- Màn hình: ${extractScreen(ba) || 'không rõ'} vs ${extractScreen(bb) || 'không rõ'}

**Nên chọn gì theo mục đích**
${recUse}

**Kết luận nhanh:** nên chọn **${winner === 'A' ? ('#1 ' + a.name) : ('#2 ' + b.name)}** (${recWhy.slice(0, 3).join(', ') || 'tổng thể tốt hơn'}).`;

    return { reply, winner, picks };
}

function preferredBrandFromText(text: string) {
    return brandFromText(text).canonical;
}

async function findTopKProductsByText(q: string, k = 3) {
    const toks = toTokens(q).filter(t => !STOPWORDS.has(t) && t.length >= 2);
    if (!toks.length) return [];

    const brandPref = preferredBrandFromText(q);
    const whereBrand: any = brandPref ? { factory: brandPref } : {};

    const orName = toks.map(t => ({ name: { contains: t } }));
    const orShort = toks.map(t => ({ shortDesc: { contains: t } }));
    const orDetail = toks.map(t => ({ detailDesc: { contains: t } }));

    let cand = await prisma.product.findMany({
        where: { ...whereBrand, OR: [...orName, ...orShort, ...orDetail] },
        take: 200
    });

    if (!cand.length && brandPref) {
        cand = await prisma.product.findMany({
            where: { OR: [...orName, ...orShort, ...orDetail] },
            take: 200
        });
    }

    if (!cand.length) return [];

    const qNums = toTokens(q).filter(t => /^\d/.test(t));
    const out = cand.map(p => {
        const blob = `${p.name || ""} ${p.shortDesc || ""} ${p.detailDesc || ""}`;
        let s = jaccardScore(toks, blob);
        if (brandPref && p.factory === brandPref) s += 0.05;
        const nameToks = new Set(toTokens(p.name || ""));
        let numHit = 0; for (const n of qNums) if (nameToks.has(n)) numHit++;
        s += Math.min(0.1, numHit * 0.03);
        return { p, score: s };
    }).sort((a, b) => b.score - a.score);

    return out.slice(0, k);
}

// bỏ dấu + lowercase
const deaccent = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Chuẩn hoá brand + alias (khớp với cột `factory` trong DB) */
const BRAND_CANONICALS = [
    "APPLE", "ASUS", "LENOVO", "DELL", "LG", "ACER", "HP", "MSI", "GIGABYTE", "ALIENWARE"
] as const;

const BRAND_ALIASES: Record<string, string> = {
    ROG: "ASUS", TUF: "ASUS", ZENBOOK: "ASUS", VIVOBOOK: "ASUS",
    AORUS: "GIGABYTE", AERO: "GIGABYTE",
    LEGION: "LENOVO", THINKPAD: "LENOVO", IDEAPAD: "LENOVO", YOGA: "LENOVO", LOQ: "LENOVO",
    OMEN: "HP", VICTUS: "HP", PAVILION: "HP", ELITEBOOK: "HP",
    PREDATOR: "ACER", NITRO: "ACER", SWIFT: "ACER", ASPIRE: "ACER",
    PRESTIGE: "MSI", MODERN: "MSI", KATANA: "MSI", STEALTH: "MSI",
    XPS: "DELL", INSPIRON: "DELL", VOSTRO: "DELL", LATITUDE: "DELL",
    GRAM: "LG",
    "MACBOOK": "APPLE", "MACBOOK AIR": "APPLE", "MACBOOK PRO": "APPLE"
};

function brandFromText(text: string): { canonical?: string; aliasLabel?: string } {
    const U = deaccent(text).toUpperCase().replace(/\s+/g, ' ');
    if (/ALIEN\s?WARE/.test(U)) return { canonical: "ALIENWARE", aliasLabel: "ALIENWARE" };
    for (const b of BRAND_CANONICALS) if (U.includes(b)) return { canonical: b, aliasLabel: b };
    for (const [alias, canonical] of Object.entries(BRAND_ALIASES))
        if (U.includes(alias)) return { canonical, aliasLabel: alias };
    return {};
}

// ===== intents =====
const WANT_COMPARE_RE = /(so s[áa]nh|so\s*sanh|compare)/i;
const PICK_INDEX_RE = /(ch[oọ]n|l[ấa]y|lựa|pick)\s*(?:m[aá]y|con)?\s*(?:s[oố]|#)?\s*(\d{1,2})/i;

// ⭐ changed: mở rộng “liệt kê/gợi ý/danh sách/model” + nhận “gửi sản phẩm”/“send”
const WANT_SEND_RE = /(g(?:ư|u)i)\s*(?:cho\s*m[iì]nh\s*)?(?:s[aả]n\s*ph[aẩ]m|m[áa]y|m[ãa]u|options?)/i;
const WANT_LIST_RE = /(li[eê]̣t kê|g[ơ]̣i [yý]|danh\s*s[aá]ch|recommend|gợi ý|dòng|model|show)/i;

// ===== session KV (kết quả lần trước) =====
async function setSessionKV(sessionId: number, key: string, value: string, ttlHours = 2) {
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    const exist = await prisma.aiMemory.findFirst({ where: { sessionId, key } });
    if (exist) await prisma.aiMemory.update({ where: { id: exist.id }, data: { value, type: "EPHEMERAL", score: 0.5, expiresAt } });
    else await prisma.aiMemory.create({ data: { sessionId, key, value, type: "EPHEMERAL", score: 0.5, expiresAt } });
}
async function getSessionKV(sessionId: number, key: string) {
    const m = await prisma.aiMemory.findFirst({ where: { sessionId, key }, orderBy: { id: "desc" } });
    return m?.value;
}

function isGreetingOrSmallTalk(text: string) {
    const t = deaccent(String(text || '')).trim();
    if (!t) return true;
    if (t.length <= 3) return true; // "hi", "ok", "alo"
    return /\b(alo|a lo|hello|hi|chao|xin chao|yo|co ai|test|ping|e|ê|aloha)\b/.test(t);
}
function isThanks(text: string) {
    const t = deaccent(String(text || ''));
    return /\b(cam on|cảm ơn|thanks|thank you|tks)\b/i.test(t);
}
function isBye(text: string) {
    const t = deaccent(String(text || ''));
    return /\b(tam biet|bye|goodbye|hen gap|see you)\b/i.test(t);
}

function finalPrice(p: any) {
    const base = +p.price || 0;
    return p.discount ? Math.max(0, base - Math.round(base * p.discount / 100)) : base;
}
function extractGPU(blob: string) {
    const rx = /\b(RTX|GTX|RX|ARC|IRIS\s?XE)\s?[A-Z0-9\- ]{0,10}\b/gi;
    const m = blob.match(rx);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}
// ⭐ changed: robust hơn cho kích thước màn và biến thể “-inch”
function extractScreen(blob: string) {
    const size = blob.match(/\b(13(?:\.\d)?|14(?:\.\d)?|15(?:\.6)?|16(?:\.\d)?|17(?:\.\d)?|18)(?:\"|[ -]?inch)?\b/i)?.[0]?.replace(/-inch/i, ' inch');
    const hz = blob.match(/\b(120|144|165|240|360)\s?hz\b/i)?.[0]?.toUpperCase();
    const res = blob.match(/\b(FHD|QHD|UHD|2K|4K|OLED|RETINA)\b/i)?.[0]?.toUpperCase();
    return [size, res, hz].filter(Boolean).join(' ');
}
function productSpecs(p: any) {
    const parts: string[] = [];
    if (p.cpu) parts.push(p.cpu);
    if (p.ramGB) parts.push(`RAM ${p.ramGB}GB`);
    if (p.storageGB) parts.push(`SSD ${p.storageGB}GB`);
    const blob = `${p.featureTags || ''} ${p.shortDesc || ''} ${p.detailDesc || ''}`;
    const gpu = extractGPU(blob); if (gpu) parts.push(`GPU ${gpu}`);
    const screen = extractScreen(blob); if (screen) parts.push(`màn hình ${screen}`);
    return parts.join(', ') || (p.shortDesc || '').trim();
}
function productPriceText(p: any) {
    const price = finalPrice(p);
    return price.toLocaleString('vi-VN') + '₫';
}
function productDTO(p: any) {
    const img = p.thumb?.startsWith("http") ? p.thumb
        : p.thumb ? `/images/${p.thumb}`
            : p.image?.startsWith("http") ? p.image
                : `/images/product/${p.image || "no-image.png"}`;
    return {
        id: p.id,
        name: p.name,
        price: +p.price || 0,
        salePrice: finalPrice(p),
        discount: p.discount || 0,
        image: img,
        shortDesc: p.shortDesc || "",
        href: `/product/${p.id}`,
        specs: productSpecs(p),
        priceText: productPriceText(p)
    };
}
function scoreByTarget(p: any, target?: string) {
    const B = `${p.featureTags || ""} ${p.shortDesc || ""} ${p.detailDesc || ""}`.toUpperCase();

    const cpuStr = (p.cpu || "").toUpperCase();
    let cpu =
        /I9|R9/.test(cpuStr) ? 900 :
            /I7|R7/.test(cpuStr) ? 700 :
                /I5|R5/.test(cpuStr) ? 500 :
                    /I3|R3/.test(cpuStr) ? 300 : 0;
    const cgen = cpuStr.match(/(\d{3,5})/);
    if (cgen) cpu += Math.min(200, Math.floor(parseInt(cgen[1], 10) / 10));

    let gpu = 0;
    const gm = B.match(/\b(RTX|GTX)\s?-?\s?(\d{3,4})\b/);
    if (gm) {
        const n = parseInt(gm[2], 10);
        gpu = n + (gm[1] === "RTX" ? 200 : 0);
    } else if (/\b(RX\s?\d{3,4}|ARC)\b/.test(B)) {
        gpu = 800;
    } else if (/IRIS\s?XE|RADEON\s?GRAPHICS|UHD\s?GRAPHICS/.test(B)) {
        gpu = 100;
    }

    let scr = 0;
    if (/QHD|2K|3K|4K|UHD|RETINA|OLED/.test(B)) scr += 50;

    const hasHighHz = /\b(120|144|165|240|360)\s?HZ\b/.test(B);
    if (hasHighHz) {
        if (target === "GAMING") gpu += 100;
        else scr += 10;
    }

    const wMatch = B.match(/(\d+(?:\.\d+)?)\s?KG/);
    const weightKg = wMatch ? parseFloat(wMatch[1]) : (typeof p.weightKg === "number" ? p.weightKg : undefined);
    let mobility = 0;
    if (typeof weightKg === "number") {
        mobility = weightKg <= 1.1 ? 100 : weightKg <= 1.3 ? 80 : weightKg <= 1.5 ? 60 : weightKg <= 1.8 ? 40 : 20;
    }

    const ram = +p.ramGB || 0;
    const ssd = +p.storageGB || 0;

    switch (target) {
        case "GAMING": return gpu * 10 + cpu * 4 + ram * 2 + Math.floor(ssd / 128) + scr;
        case "THIET-KE-DO-HOA": return gpu * 8 + cpu * 3 + scr * 8 + ram * 2;
        case "MONG-NHE": return mobility * 6 + cpu * 3 + ram + (/\bOLED\b/.test(B) ? 10 : 0);
        case "DOANH-NHAN": return mobility * 5 + cpu * 3 + ram + (/VÂN\s*TAY|IR\s*CAM|THUNDERBOLT|SMARTCARD/i.test(B) ? 30 : 0);
        case "SINHVIEN-VANPHONG": return mobility * 6 + cpu * 3 + ram * 2 + Math.floor(ssd / 256);
        default: return gpu * 10 + cpu * 4 + ram * 2 + Math.floor(ssd / 128) + scr;
    }
}

function scoreProduct(p: any, target?: string) {
    return scoreByTarget(p, target);
}

// target rộng
function detectSegmentWide(t: string) {
    t = (t || "").toLowerCase();
    if (/(gaming|dòng\s*gaming|chơi\s*game|fps|144hz|rtx|gtx|card\s*rời)/i.test(t)) return "GAMING";
    if (/(sinh\s*viên|văn\s*phòng|office|học|excel|word)/i.test(t)) return "SINHVIEN-VANPHONG";
    if (/(mỏng|nh[eẹ]|di\s*động|portable|<\s*1\.?3?kg)/i.test(t)) return "MONG-NHE";
    if (/(doanh\s*nhân|business|bảo\s*mật|vân\s*tay|smartcard)/i.test(t)) return "DOANH-NHAN";
    if (/(đồ\s*ho[aạ]|thi[eê]́t\s*k[eê]|photoshop|premiere|lightroom|render|color\s*accurate)/i.test(t)) return "THIET-KE-DO-HOA";
    return undefined;
}

// ==== Quick intents & commands ====
const SHOW_CARDS_RE = /(hi[eê]n thi(?:̣)?\s*d[ạa]ng\s*th[eê]|d[ạa]ng\s*th[eê]|view\s*cards?)/i;
const SHOW_LIST_RE = /(hi[eê]n thi(?:̣)?\s*d[ạa]ng\s*danh\s*s[aá]ch|danh\s*s[aá]ch|view\s*list)/i;
const COMPARE_OTHER_RE = /(so\s*s[áa]nh\s*v[ơo]i\s*m[aá]y\s*kh[aá]c)/i;
const FILTER_LT_RE = /(?:lọc|loc)\s*(?:theo)?\s*<\s*(\d{1,3})\s*(?:tr|tri[eê]u|m)?/i;

async function showLastResults(sessionId: number, format: 'cards' | 'list') {
    const raw = await getSessionKV(sessionId, "result.ids");
    if (!raw) return null;
    const ids: number[] = JSON.parse(raw);
    if (!ids.length) return null;
    const rows = await prisma.product.findMany({ where: { id: { in: ids } } });
    const products = rows.map(productDTO);
    await setSessionKV(sessionId, "result.format", format);
    return { products, format };
}

// ===== parse.ts =====
const VN_NUM_WORDS: Record<string, number> = {
    "mười": 10, "mươi": 10, "một": 1, "hai": 2, "ba": 3, "bốn": 4, "tư": 4, "năm": 5, "sáu": 6, "bảy": 7, "tám": 8, "chín": 9, "mười một": 11, "mười hai": 12,
    "mười ba": 13, "mười bốn": 14, "mười lăm": 15, "mười sáu": 16, "mười bảy": 17, "mười tám": 18, "mười chín": 19, "hai mươi": 20, "ba mươi": 30
};
function viWordToNumber(t: string) {
    t = t.toLowerCase();
    const k = Object.keys(VN_NUM_WORDS).sort((a, b) => b.length - a.length);
    for (const w of k) if (t.includes(w)) return VN_NUM_WORDS[w] * 1_000_000;
    return undefined;
}

export function parseBudgetVi(text: string) {
    const t = deaccent(text).toLowerCase().replace(/[,\.](?=\d{3}\b)/g, "");

    // range: 18-22tr | 18 đến 22tr | 18~22tr
    let m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|m)\s*(?:-|–|to|den|~|đến)\s*(\d+(?:[.,]\d+)?)/i);
    if (m) return { min: +m[1] * 1_000_000, max: +m[2] * 1_000_000 };

    // single around: ~20tr | tầm 20tr | khoảng 20tr
    m = t.match(/(?:~|≈|tam|tầm|khoang|khoảng|co|cỡ)\s*(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|m)\b/i);
    if (m) { const v = +m[1] * 1_000_000; const widen = Math.round(v * 0.2); return { min: v - widen, max: v + widen }; }

    // single strict: 20tr | 20 trieu | 20m
    m = t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|m)\b/i);
    if (m) { const v = +m[1] * 1_000_000; return { min: Math.max(0, v - 3_000_000), max: v + 3_000_000 }; }

    // words: “hai mươi triệu”
    const w = viWordToNumber(t);
    if (w) return { min: Math.max(0, w - 3_000_000), max: w + 3_000_000 };

    return {};
}

// Có nhắc tới ngân sách không (dù parser chưa ra số)?
function hasBudgetCue(text: string) {
    const t = deaccent(String(text || '')).toLowerCase();
    return /(\d+\s*(tr|trieu|m)\b)|(~|≈|tam|tầm|khoang|khoảng|duoi|dưới|tren|trên|<=|>=|<|>|gia|giá|ngan sach|ngân sách)/i.test(t);
}

// Follow-up chỉ đổi hãng? (ví dụ: "còn MSI thì sao", "DELL thì sao", "thử ASUS")
// -> true khi có brand mới, có cue "còn/thế/đổi/thử", và KHÔNG nêu lại ngân sách/nhu cầu
function isBrandOnlyFollowUp(text: string) {
    const t = deaccent(text);
    const cue = /\b(con|the|th[eê]|doi sang|thu|thủ|thử|sang)\b/.test(t);
    const { canonical } = brandFromText(text);
    const hasNewBudget = !!parseBudgetVi(text).min || !!parseBudgetVi(text).max || hasBudgetCue(text);
    const hasNewTarget = !!detectSegmentWide(text);
    return !!canonical && cue && !hasNewBudget && !hasNewTarget;
}

/**
 * Hợp nhất filter cho LƯỢT HIỆN TẠI.
 * - Brand/target/budget trong câu mới luôn ưu tiên.
 * - Nếu đổi brand:
 *    + carryOnBrandChange = true  -> GIỮ target + budget cũ (follow-up kiểu "còn MSI thì sao")
 *    + false (mặc định)          -> KHÔNG kéo target/budget cũ (tránh dính rác)
 */
function mergeFiltersForThisTurn(
    parsed: { brand?: string | string[]; target?: string; minBudget?: number; maxBudget?: number },
    remembered: { brand?: string | string[]; target?: string; min?: number; max?: number },
    message: string,
    carryOnBrandChange = false
) {
    const out: any = {};
    const brandChanged = !!parsed.brand && parsed.brand !== remembered.brand;

    // brand
    if (parsed.brand) out.brand = parsed.brand;
    else if (remembered.brand) out.brand = remembered.brand;

    // target
    if (parsed.target) out.target = parsed.target;
    else if (!brandChanged || carryOnBrandChange) out.target = remembered.target;

    // budget
    if (typeof parsed.minBudget === 'number' || typeof parsed.maxBudget === 'number') {
        if (typeof parsed.minBudget === 'number') out.min = parsed.minBudget;
        if (typeof parsed.maxBudget === 'number') out.max = parsed.maxBudget;
    } else if (hasBudgetCue(message)) {
        delete out.min; delete out.max;
    } else if (!brandChanged || carryOnBrandChange) {
        if (typeof remembered.min === 'number') out.min = remembered.min;
        if (typeof remembered.max === 'number') out.max = remembered.max;
    }

    return out as { brand?: string | string[]; target?: string; min?: number; max?: number };
}



/** Ưu tiên filter của câu hiện tại; nếu có cue ngân sách mà không parse ra số -> bỏ min/max cũ */
function effectiveFilters(
    parsed: { brand?: string | string[]; target?: string; minBudget?: number; maxBudget?: number },
    remembered: { brand?: string | string[]; target?: string; min?: number; max?: number },
    message: string
) {
    const eff: any = { ...remembered };
    if (parsed.brand) eff.brand = parsed.brand;
    if (parsed.target) eff.target = parsed.target;

    if (typeof parsed.minBudget === 'number' || typeof parsed.maxBudget === 'number') {
        if (typeof parsed.minBudget === 'number') eff.min = parsed.minBudget; else delete eff.min;
        if (typeof parsed.maxBudget === 'number') eff.max = parsed.maxBudget; else delete eff.max;
    } else if (hasBudgetCue(message)) {
        delete eff.min;
        delete eff.max;
    }
    return eff as { brand?: string | string[]; target?: string; min?: number; max?: number };
}

function parseTakeVi(text: string) {
    // liệt kê 3 sản phẩm | gửi 4 mẫu | list 5 sp
    const t = deaccent(text).toLowerCase();
    const m = t.match(/(?:liet ke|goi y|gui|list|cho toi|cho minh)\s*(\d{1,2})\s*(?:mau|mau|sp|san pham)/i);
    return m ? Math.max(1, Math.min(12, +m[1])) : undefined;
}
// ==== Ý định & bộ lọc từ câu người dùng ====
const WANT_STRONGEST_RE = /(mạnh|mạnh|best|khủng|cao\s*nhất|đỉnh)/i;

function parseFilters(text: string) {
    const { canonical: brand } = brandFromText(text);
    const target = detectSegmentWide(text);
    const { min, max } = parseBudgetVi(text);
    // ⭐ changed: wantList bật khi “gửi sản phẩm/send” hoặc các từ khoá “liệt kê/gợi ý…”
    const wantList = WANT_LIST_RE.test(text) || WANT_SEND_RE.test(text);
    const wantStrongest = WANT_STRONGEST_RE.test(text);
    return {
        brand,
        target,
        minBudget: typeof min === 'number' ? min : undefined,
        maxBudget: typeof max === 'number' ? max : undefined,
        wantList,
        wantStrongest
    };
}

export async function setEphemeralFilter(
    sessionId: number,
    key: "filter.brand" | "filter.target" | "filter.budget",
    value: string
) {
    const exist = await prisma.aiMemory.findFirst({ where: { sessionId, key } });
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (exist) await prisma.aiMemory.update({ where: { id: exist.id }, data: { value, type: "EPHEMERAL", score: 0.5, expiresAt } });
    else await prisma.aiMemory.create({ data: { sessionId, key, value, type: "EPHEMERAL", score: 0.5, expiresAt } });
}

export async function getSessionFilters(sessionId: number) {
    const mems = await prisma.aiMemory.findMany({
        where: { sessionId, key: { in: ["filter.brand", "filter.target", "filter.budget"] } },
        orderBy: { id: "desc" }
    });
    const out: any = {};
    for (const m of mems) {
        if (m.key === "filter.brand") out.brand = m.value;
        if (m.key === "filter.target") out.target = m.value;
        if (m.key === "filter.budget") { try { const o = JSON.parse(m.value); out.min = +o.min || undefined; out.max = +o.max || undefined; } catch { } }
    }
    return out as { brand?: string | string[]; target?: string; min?: number; max?: number };
}

async function listByFilters(
    f: { brand?: string | string[]; target?: string; min?: number; max?: number },
    take = 6
) {
    const where: any = {};
    if (Array.isArray(f.brand)) where.factory = { in: f.brand };
    else if (f.brand) where.factory = f.brand;
    if (f.target) where.target = f.target;

    const all = await prisma.product.findMany({ where, take: 120 });
    const filtered = all.filter((p) => {
        const price = +p.price || 0;
        const sale = p.discount ? Math.max(0, price - Math.round(price * p.discount / 100)) : price;
        if (typeof f.min === "number" && sale < f.min) return false;
        if (typeof f.max === "number" && sale > f.max) return false;
        return true;
    });
    if (!filtered.length) return [];
    const sorted = filtered
        .sort((a, b) => scoreProduct(b, f.target) - scoreProduct(a, f.target) || (+a.price || 0) - (+b.price || 0));
    return sorted.slice(0, take);
}

// CHỈ nới ngân sách ±20% — giữ nguyên brand & target
async function smartSearchStrict(
    f: { brand?: string | string[]; target?: string; min?: number; max?: number },
    take = 6
) {
    let list = await listByFilters(f, take);
    if (list.length) return { list, reason: undefined as string | undefined };

    const haveMin = typeof f.min === "number";
    const haveMax = typeof f.max === "number";
    if (haveMin || haveMax) {
        const min0 = haveMin ? (f.min as number) : Math.max(0, Math.round((f.max as number) * 0.8));
        const max0 = haveMax ? (f.max as number) : Math.round((f.min as number) * 1.2);
        const span = Math.max(1, Math.round((max0 - min0) * 0.2));
        const widened = { min: Math.max(0, min0 - span), max: max0 + span };
        list = await listByFilters({ ...f, ...widened }, take);
        if (list.length) return { list, reason: "Mở rộng ngân sách ±20% trong đúng hãng & mục đích" };
    }
    return { list: [], reason: "no-exact" };
}

// Zero-results ≠ bế tắc: nới tiêu chí theo bậc thang
async function smartSearch(
    f: { brand?: string | string[]; target?: string; min?: number; max?: number },
    take = 6
) {
    // 1) strict
    let list = await listByFilters(f, take);
    if (list.length) return { list, reason: undefined as string | undefined };

    // 2) widen budget ±20%
    const haveMin = typeof f.min === "number";
    const haveMax = typeof f.max === "number";
    if (haveMin || haveMax) {
        const min0 = haveMin ? (f.min as number) : Math.max(0, Math.round((f.max as number) * 0.8));
        const max0 = haveMax ? (f.max as number) : Math.round((f.min as number) * 1.2);
        const span = Math.max(1, Math.round((max0 - min0) * 0.2));
        const widened = { min: Math.max(0, min0 - span), max: max0 + span };

        list = await listByFilters({ ...f, ...widened }, take);
        if (list.length) return { list, reason: "Mở rộng ngân sách ±20% để ra lựa chọn gần nhất" };
    }

    // 3) relax brand (giữ target + ngân sách)
    list = await listByFilters({ ...f, brand: undefined }, take);
    if (list.length) return { list, reason: "Không có đúng hãng trong tầm giá; gợi ý cùng nhu cầu từ hãng khác" };

    // 4) relax target (giữ brand + ngân sách)
    list = await listByFilters({ brand: f.brand, min: f.min, max: f.max }, take);
    if (list.length) return { list, reason: "Không có đúng dòng; gợi ý theo hãng gần ngân sách" };

    // 5) nearest by price (bỏ brand/target)
    const any = await prisma.product.findMany({ take: 80 });
    const mid = ((f.min ?? 0) + (f.max ?? 0)) / 2 || 0;
    const price = (p: any) => +p.price || 0;
    list = any
        .sort((a, b) => Math.abs(price(a) - mid) - Math.abs(price(b) - mid))
        .slice(0, take);

    return { list, reason: "Gợi ý gần nhất theo giá" };
}

async function strongestInIds(ids: number[]) {
    if (!ids?.length) return null;
    const list = await prisma.product.findMany({ where: { id: { in: ids } } });
    if (!list.length) return null;
    let best = list[0], scBest = scoreProduct(best);
    for (let i = 1; i < list.length; i++) {
        const sc = scoreProduct(list[i]);
        if (sc > scBest) { best = list[i]; scBest = sc; }
    }
    return best;
}

function quickDiff(a: any, b: any) {
    const msgs: string[] = [];
    const ca = (a.cpu || '').toUpperCase(), cb = (b.cpu || '').toUpperCase();
    if (ca && cb && ca !== cb) msgs.push(`CPU: ${a.cpu} vs ${b.cpu}`);
    const ga = `${a.featureTags || ''} ${a.shortDesc || ''} ${a.detailDesc || ''}`.toUpperCase();
    const gb = `${b.featureTags || ''} ${b.shortDesc || ''} ${b.detailDesc || ''}`.toUpperCase();
    const gsa = /RTX|GTX|RX|ARC|IRIS\s?XE/.test(ga) ? 'mạnh' : '';
    const gsb = /RTX|GTX|RX|ARC|IRIS\s?XE/.test(gb) ? 'mạnh' : '';
    if (gsa || gsb) msgs.push(`GPU: ${gsa ? 'có' : 'không rõ'} vs ${gsb ? 'có' : 'không rõ'}`);
    if (a.ramGB !== b.ramGB) msgs.push(`RAM: ${a.ramGB || '?'}GB vs ${b.ramGB || '?'}GB`);
    if (a.storageGB !== b.storageGB) msgs.push(`SSD: ${a.storageGB || '?'}GB vs ${b.storageGB || '?'}GB`);
    if (a.screenResolution !== b.screenResolution || a.screenSizeInch !== b.screenSizeInch)
        msgs.push(`Màn: ${a.screenSizeInch || '?'}" ${a.screenResolution || ''} vs ${b.screenSizeInch || '?'}" ${b.screenResolution || ''}`);
    return msgs;
}

async function pickStrongest(f: { brand?: string | string[]; target?: string; min?: number; max?: number }) {
    const list = await listByFilters(f, 30);
    if (!list.length) return null;
    let best = list[0], bestScore = scoreProduct(best);
    for (let i = 1; i < list.length; i++) { const sc = scoreProduct(list[i]); if (sc > bestScore) { best = list[i]; bestScore = sc; } }
    return { best, score: bestScore, count: list.length };
}
async function saveLastContext(sessionId: number, f: any, list: any[]) {
    try {
        if (!Array.isArray(list) || !list.length) return;
        const best = list.reduce((a, b) => (scoreProduct(b, f.target) > scoreProduct(a, f.target) ? b : a), list[0]);
        await setSessionKV(sessionId, "last.filters", JSON.stringify(f));
        await setSessionKV(sessionId, "last.bestId", String(best?.id || ""));
        await setSessionKV(sessionId, "last.brand", Array.isArray(f.brand) ? (f.brand[0] || "") : (f.brand || ""));
    } catch { }
}

async function findBestProductByText(q: string) {
    const toks = toTokens(q).filter(t => !STOPWORDS.has(t));
    if (!toks.length) return null;

    const { canonical: fac } = brandFromText(q);
    const whereBase: any = fac ? { factory: fac } : {};

    const orName = toks.map(t => ({ name: { contains: t } }));
    const orShort = toks.map(t => ({ shortDesc: { contains: t } }));
    const orDetail = toks.map(t => ({ detailDesc: { contains: t } }));

    let cand = await prisma.product.findMany({
        where: { ...whereBase, OR: [...orName, ...orShort, ...orDetail] },
        take: 60
    });

    if (!cand.length && fac) {
        cand = await prisma.product.findMany({
            where: { OR: [...orName, ...orShort, ...orDetail] },
            take: 60
        });
    }
    if (!cand.length) return null;

    const qTokens = toks;
    let best = cand[0], bestSc = jaccardScore(qTokens, cand[0].name || "");
    for (let i = 1; i < cand.length; i++) {
        const sc = jaccardScore(qTokens, cand[i].name || "");
        if (sc > bestSc) { best = cand[i]; bestSc = sc; }
    }
    return best;
}

/* ======================= Agent Decision Prompt ======================= */

// ⭐ changed: bổ sung quy tắc “gửi sản phẩm/send/cho mình mẫu … ⇒ search ngay”
const SYS_AGENT = `Bạn là RÙA AI – tư vấn laptop bằng tiếng Việt cho website.
Chỉ được xuất MỘT DÒNG JSON đúng schema:
{"action":"search|strongest|reply",
 "filters":{"brand"?:"ASUS|DELL|LENOVO|ACER|HP|MSI|APPLE|LG|GIGABYTE|ALIENWARE",
            "target"?:"GAMING|MONG-NHE|SINHVIEN-VANPHONG|THIET-KE-DO-HOA|DOANH-NHAN",
            "min"?:number,"max"?:number},
 "format":"cards|list",
 "reply":"...",
 "suggestions":["..."]}

QUY TẮC:
- Nếu người dùng CHÀO HỎI/không có ý định mua (thiếu hãng/nhu cầu/ngân sách), bắt buộc {"action":"reply"}: hỏi lại gọn. KHÔNG dùng "search"/"strongest".
- “liệt kê/gợi ý/danh sách/dòng/model/recommend/gửi sản phẩm/send/cho mình mẫu” ⇒ {"action":"search"}.
- “mạnh nhất/đỉnh nhất/best/khủng nhất” ⇒ {"action":"strongest"}.
- Ngân sách "~20tr", "dưới 15tr", "10-15tr" ⇒ set min/max (VND).
- Nhu cầu "gaming/văn phòng/mỏng nhẹ/đồ họa/doanh nhân" ⇒ map "target".
- Luôn kèm "suggestions" 2–4 mục.

Chỉ xuất đúng một dòng JSON. Không thêm giải thích, không markdown, không emoji.`;

/* ======================= Main Agent ======================= */

export async function runTurtleAgent(params: {
    userId: number | null, clientSessionId?: number, message: string
}) {
    const { userId, clientSessionId, message } = params;
    const takeWanted = parseTakeVi(message);
    // 1) Session
    let session = clientSessionId
        ? await prisma.aiChatSession.findFirst({ where: userId ? { id: clientSessionId, userId } : { id: clientSessionId } })
        : await prisma.aiChatSession.findFirst({ where: userId ? { userId, status: "OPEN" } : { status: "OPEN" }, orderBy: { lastUsedAt: 'desc' } });
    if (!session) session = await prisma.aiChatSession.create({ data: { userId, topic: 'home_show' } });
    if (session.status === "CLOSED") return { status: 403 as const, body: { message: "session closed" } };

    // 2) Save user + embed
    const u = await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "USER", content: message } });
    await upsertMessageEmbedding(u.id, u.content);

    // 3) Parse/remember filters (mới)
    // 3) Parse/remember filters (mới)
    const { brand, target, minBudget, maxBudget, wantList, wantStrongest } = parseFilters(message);

    // ghi nhớ tạm nếu có
    if (brand) await setEphemeralFilter(session.id, "filter.brand", Array.isArray(brand) ? JSON.stringify(brand) : brand);
    if (target) await setEphemeralFilter(session.id, "filter.target", target);
    if (typeof minBudget === "number" || typeof maxBudget === "number") {
        await setEphemeralFilter(session.id, "filter.budget", JSON.stringify({ min: minBudget, max: maxBudget }));
    }

    const remembered = await getSessionFilters(session.id);

    const eff = mergeFiltersForThisTurn({ brand, target, minBudget, maxBudget }, remembered, message, isBrandOnlyFollowUp(message));

    // nếu câu hiện tại có brand/target/budget mới -> dọn list cũ để khỏi lạc đề
    if (brand || target || typeof minBudget === 'number' || typeof maxBudget === 'number') {
        await setSessionKV(session.id, "result.ids", JSON.stringify([]));
    }

    // Dùng eff thay cho remembered ở các biến/return
    const hasIntent = !!(eff.brand || eff.target || eff.min || eff.max || wantList || wantStrongest);
    const bf = brandFromText(message);
    const brandOnlyIntent = !!bf.canonical && !target && !minBudget && !maxBudget && !wantList && !wantStrongest;


    const wantsCompare = WANT_COMPARE_RE.test(message);
    const pickIndex = PICK_INDEX_RE.exec(message);

    // ===== Brand-only: ⭐ changed – gửi danh sách ngay, không hỏi xác nhận =====
    if (brandOnlyIntent) {
        const brands = [bf.canonical as string];
        const kWanted = parseWantedCount(message) || 6;
        // lấy list theo hãng và các filter đã nhớ (nếu có min/max/target đã lưu)
        const { list, reason } = await smartSearch({ brand: brands, target: remembered.target, min: remembered.min, max: remembered.max }, kWanted);
        const products = list.map(productDTO);
        const top = await listByFilters({ brand: brands }, takeWanted ?? 3);

        let reply: string;
        if (products.length) {
            reply = await buildLeadText({ brand: brands, target: remembered.target, min: remembered.min, max: remembered.max }, products, reason);
            const ids = products.map(p => p.id);
            await setSessionKV(session.id, "result.ids", JSON.stringify(ids));
            await setSessionKV(session.id, "result.format", "list");
        } else {
            const count = await prisma.product.count({ where: { factory: { in: brands } } });
            reply = count > 0
                ? `Mình chưa khớp đúng tiêu chí, mình có thể **mở rộng ±20% ngân sách** hoặc gợi ý **dòng gần nhất** trong hãng ${brands.join('/')} nhé.`
                : `Hiện chưa có mẫu **${brands.join('/')}** trong shop. Bạn muốn xem **dòng tương đương** (ví dụ Dell/ASUS/MSI) không?`;
        }

        await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: products.length ? 'Gợi ý sản phẩm' : reply } });
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

        return {
            status: 200 as const,
            body: {
                sessionId: session.id,
                reply, // luôn có lead thân thiện
                format: products.length ? "list" as const : undefined,
                products,
                activeFilters: { brand: brands, target: remembered.target, min: remembered.min, max: remembered.max },
                suggestions: products.length
                    ? ["Chọn máy mạnh nhất", "Hiển thị dạng thẻ", "So sánh #1 với #2"]
                    : ["Xem Dell tương đương", "Xem ASUS tương đương", "Tư vấn theo ngân sách"]
            }
        };
    }

    /* ===== A) SO SÁNH THEO TÊN (ưu tiên), nếu không có thì dùng danh sách trước (#) ===== */
    function rowsForProduct(p: any) {
        const blob = `${p.featureTags || ''} ${p.shortDesc || ''} ${p.detailDesc || ''}`.toUpperCase();
        const gpu = extractGPU(blob) || (/\bIRIS\s?XE\b/.test(blob) ? 'Iris Xe' : '');
        const screen = extractScreen(blob);
        const weight = (p.weightKg ? p.weightKg + ' kg' : (p.weight || '—'));
        return [
            { label: 'CPU', value: p.cpu || '—' },
            { label: 'GPU', value: gpu || '—' },
            { label: 'RAM', value: (p.ramGB ? p.ramGB + 'GB' : '—') },
            { label: 'SSD', value: (p.storageGB ? p.storageGB + 'GB' : '—') },
            { label: 'Màn hình', value: screen || (p.screenSizeInch ? (p.screenSizeInch + '"') : '—') },
            { label: 'Cân nặng', value: weight || '—' },
            { label: 'Giá tham khảo', value: productPriceText(p) }
        ];
    }

    if (wantsCompare) {
        const names = parseCompareNamesMulti(message);
        if (names.length >= 2) {
            const found: any[] = [];
            for (const q of names) {
                const prod = await findBestProductByText(q);
                if (prod) found.push(prod);
            }
            if (found.length >= 2) {
                const items = found.slice(0, 4).map(p => ({
                    id: p.id,
                    title: p.name,
                    href: `/product/${p.id}`,
                    rows: rowsForProduct(p)
                }));

                const ranked = [...found].map(p => ({ p, sc: scoreProduct(p) }))
                    .sort((a, b) => b.sc - a.sc);
                const best = ranked[0]?.p, second = ranked[1]?.p;
                const conclusion =
                    best
                        ? `**Ưu tiên hiệu năng/đồ họa** ⇒ chọn **${best.name}**.`
                        : '';

                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: 'So sánh sản phẩm' } });
                await setSessionKV(session.id, "result.ids", JSON.stringify(items.map(i => i.id)));
                await setSessionKV(session.id, "result.format", "cards");

                return {
                    status: 200 as const,
                    body: {
                        sessionId: session.id,
                        reply: 'Mình so sánh nhanh hai mẫu bạn vừa chọn nhé:',
                        format: 'cards',
                        products: [],
                        compare: {
                            labels: ['CPU', 'GPU', 'RAM', 'SSD', 'Màn hình', 'Cân nặng', 'Giá tham khảo'],
                            items,
                            conclusion
                        },
                        activeFilters: remembered,
                        suggestions: items.length === 2
                            ? [`Chọn ${items[0].title}`, `Chọn ${items[1].title}`, "Chọn máy mạnh nhất"]
                            : ["Chọn máy mạnh nhất", "Gợi ý theo ngân sách", "Xem thêm gaming"]
                    }
                };
            }
        }

        // Fallback: so sánh theo số thứ tự từ danh sách trước (#1 vs #2 ...)
        const rawIds = await getSessionKV(session.id, "result.ids");
        const ids: number[] = rawIds ? JSON.parse(rawIds) : [];
        if (ids.length >= 2) {
            const nums = (message.match(/\b(\d{1,2})\b/g) || []).map(n => +n).filter(n => n >= 1 && n <= ids.length);
            const aIdx = (nums[0] || 1) - 1, bIdx = (nums[1] || 2) - 1;
            const aId = ids[aIdx], bId = ids[bIdx];
            const two = await prisma.product.findMany({ where: { id: { in: [aId, bId] } } });
            if (two.length === 2) {
                const [pa, pb] = two;
                const diff = quickDiff(pa, pb);
                const reply =
                    `**So sánh nhanh #${aIdx + 1} vs #${bIdx + 1}:**
- ${pa.name} — ${productSpecs(pa)} — ${productPriceText(pa)}
- ${pb.name} — ${productSpecs(pb)} — ${productPriceText(pb)}
**Khác biệt chính:** ${diff.length ? diff.join('; ') : 'hai máy khá tương đồng.'}`;

                await setSessionKV(session.id, "result.ids", JSON.stringify([pa.id, pb.id]));
                await setSessionKV(session.id, "result.format", "cards");

                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

                return {
                    status: 200 as const,
                    body: {
                        sessionId: session.id,
                        reply,
                        format: "cards",
                        products: two.map(productDTO),
                        activeFilters: remembered,
                        suggestions: ["Chọn máy #1", "Chọn máy #2", "Chọn máy mạnh nhất"]
                    }
                };
            }
        }
        // nếu không có danh sách trước → tiếp tục flow bình thường
    }

    /* ===== B) chọn máy số N từ danh sách trước ===== */
    if (pickIndex) {
        const n = +pickIndex[1];
        const rawIds = await getSessionKV(session.id, "result.ids");
        const ids: number[] = rawIds ? JSON.parse(rawIds) : [];
        if (ids[n - 1]) {
            const p = await prisma.product.findUnique({ where: { id: ids[n - 1] } });
            if (p) {
                await setSessionKV(session.id, "result.ids", JSON.stringify([p.id]));
                await setSessionKV(session.id, "result.format", "cards");

                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: `Chọn máy #${n}: ${p.name}` } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
                return {
                    status: 200 as const,
                    body: {
                        sessionId: session.id,
                        reply: "",
                        format: "cards",
                        products: [productDTO(p)],
                        activeFilters: remembered,
                        suggestions: ["So sánh với máy khác", "Chọn máy mạnh nhất", "Gợi ý theo ngân sách"]
                    }
                };
            }
        }
    }

    /* ===== C) “mạnh nhất” nhưng KHÔNG nhập filter mới → lấy từ danh sách trước ===== */
    if (wantStrongest) {
        const rawIds = await getSessionKV(session.id, "result.ids");
        if (rawIds) {
            const ids: number[] = JSON.parse(rawIds);
            const best = await strongestInIds(ids);
            if (best) {
                await setSessionKV(session.id, "result.ids", JSON.stringify([best.id]));
                await setSessionKV(session.id, "result.format", "cards");

                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: `Máy mạnh nhất trong danh sách vừa rồi: ${best.name}` } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
                const friendly = await buildLeadText(remembered, [productDTO(best)], "Máy mạnh nhất trong danh sách vừa rồi");
                return {
                    status: 200 as const,
                    body: {
                        sessionId: session.id,
                        reply: friendly,
                        format: "cards",
                        products: [productDTO(best)],
                        activeFilters: remembered,
                        suggestions: ["So sánh với máy khác", "Xem thêm gaming", "Tư vấn theo ngân sách"]
                    }
                };
            }
        }
    }

    // ==== Quick commands (dùng lại kết quả gần nhất) ====
    if (SHOW_CARDS_RE.test(message)) {
        const last = await showLastResults(session.id, "cards");
        if (last) {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Mình mở lại danh sách bạn vừa xem nhé:",
                    format: "cards",
                    products: last.products,
                    activeFilters: remembered,
                    suggestions: ["So sánh với máy khác", "Chọn máy mạnh nhất", "Lọc theo < 20tr"]
                }
            };
        } else {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Hiện chưa có danh sách sẵn. Bạn thử nói “liệt kê laptop …” nhé, mình gửi ngay.",
                    format: undefined,
                    products: [],
                    activeFilters: remembered,
                    suggestions: ["Liệt kê laptop gaming", "Văn phòng mỏng nhẹ", "Tư vấn theo ngân sách"]
                }
            };
        }
    }

    if (SHOW_LIST_RE.test(message)) {
        const last = await showLastResults(session.id, "list");
        if (last) {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Mình mở lại danh sách bạn vừa xem nhé:",
                    format: "list",
                    products: last.products,
                    activeFilters: remembered,
                    suggestions: ["Chọn máy mạnh nhất", "Hiển thị dạng thẻ", "Lọc theo < 20tr"]
                }
            };
        } else {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Chưa có danh sách để hiển thị. Bạn bảo mình “liệt kê …” là mình gửi liền nha.",
                    format: undefined,
                    products: [],
                    activeFilters: remembered,
                    suggestions: ["Liệt kê laptop hãng DELL", "Gợi ý gaming ~20tr", "Máy mỏng nhẹ < 15tr"]
                }
            };
        }
    }

    if (COMPARE_OTHER_RE.test(message)) {
        const rawIds = await getSessionKV(session.id, "result.ids");
        const ids: number[] = rawIds ? JSON.parse(rawIds) : [];
        if (ids.length) {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Bạn muốn so sánh #1 với # mấy, hoặc gõ tên mẫu kia (ví dụ: “so sánh #1 với Asus TUF A15”)?",
                    format: undefined,
                    products: [],
                    activeFilters: remembered,
                    suggestions: ["So sánh #1 với #2", "So sánh #1 với #3", "Chọn máy mạnh nhất"]
                }
            };
        } else {
            return {
                status: 200 as const,
                body: {
                    sessionId: session.id,
                    reply: "Chưa có danh sách để so sánh. Bạn thử “liệt kê laptop …” nhé, mình gửi ngay.",
                    format: undefined,
                    products: [],
                    activeFilters: remembered,
                    suggestions: ["Liệt kê gaming ~20tr", "Liệt kê văn phòng < 15tr", "Liệt kê theo hãng ASUS"]
                }
            };
        }
    }

    const budgetLt = FILTER_LT_RE.exec(message);
    if (budgetLt) {
        const max = +budgetLt[1] * 1_000_000;
        await setEphemeralFilter(session.id, "filter.budget", JSON.stringify({ min: undefined, max }));
        const f2 = { ...remembered, max };
        const list = await listByFilters(f2, 6);
        const products = list.map(productDTO);
        let lead = "";
        if (products.length) {
            lead = await buildLeadText(f2, products);
        }
        if (products.length) {
            const ids = products.map(p => p.id);
            await setSessionKV(session.id, "result.ids", JSON.stringify(ids));
            await setSessionKV(session.id, "result.format", "list");
        }
        return {
            status: 200 as const,
            body: {
                sessionId: session.id,
                reply: products.length ? lead : "Chưa khớp theo tiêu chí này. Bạn thử tăng ngân sách hoặc đổi hãng/nhu cầu nhé.",
                format: products.length ? "list" : undefined,
                products,
                activeFilters: { ...remembered, max },
                suggestions: products.length
                    ? ["Chọn máy mạnh nhất", "Hiển thị dạng thẻ", "So sánh với máy khác"]
                    : ["Gợi ý gaming ~20tr", "Văn phòng mỏng nhẹ", "Theo hãng ASUS"]
            }
        };
    }

    // 4) History + KB context
    const lastMsgs = await prisma.aiChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { id: 'desc' }, take: 10 });
    const history = lastMsgs.reverse().map(m => ({ role: m.role.toLowerCase() as 'user' | 'assistant', content: m.content }));
    const memories = await retrieveContext({ userId, sessionId: session.id, query: message, topK: 8 });
    const context = [
        session.summary ? `# TÓM TẮT: ${session.summary}` : '',
        memories.length ? `# GỢI NHỚ:\n- ${memories.map(m => m.text).join('\n- ')}` : '',
        `# FILTER: ${JSON.stringify(remembered)}`,
        `# PHONG CÁCH:\n${STYLE_GUIDE_VI}`,
        `# KINH NGHIỆM LAPTOP:\n${LAPTOP_CHEATSHEET}`
    ].filter(Boolean).join('\n\n');
    // Lời cảm ơn → đáp lịch sự, gợi mở nhẹ
    if (isThanks(message)) {
        const reply = 'Rất vui được hỗ trợ bạn! Nếu cần mình có thể so sánh 1–1, lọc theo cân nặng/pin hoặc set ngân sách chi tiết hơn nhé.';
        const a = await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
        await upsertMessageEmbedding(a.id, a.content);
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
        return { status: 200 as const, body: { sessionId: session.id, reply, format: undefined, products: [], activeFilters: {}, suggestions: ["So sánh 1–1", "Máy mỏng nhẹ < 1.3kg", "Gaming ~20tr"] } };
    }

    // Tạm biệt → chốt lịch sự
    if (isBye(message)) {
        const reply = 'Chúc bạn chọn được chiếc máy ưng ý! Khi cần gợi ý mới, nhắn “liệt kê …” là mình gửi ngay.';
        const a = await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
        await upsertMessageEmbedding(a.id, a.content);
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
        return { status: 200 as const, body: { sessionId: session.id, reply, format: undefined, products: [], activeFilters: {}, suggestions: ["Gợi ý gaming", "Văn phòng mỏng nhẹ", "Theo hãng bạn thích"] } };
    }

    // 5) Greeting → hỏi gọn (thân thiện hơn)
    if (!hasIntent && isGreetingOrSmallTalk(message)) {
        const reply = 'Hello 👋 Bạn cứ nhắn **hãng + nhu cầu + ngân sách** (vd: "ASUS gaming ~20tr", "mỏng nhẹ < 15tr"). Mình lọc và gửi danh sách ngay cho bạn nhé.';
        const a = await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
        await upsertMessageEmbedding(a.id, a.content);
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
        return {
            status: 200 as const,
            body: { sessionId: session.id, reply, format: undefined, products: [], activeFilters: remembered, suggestions: ["Tư vấn theo ngân sách", "Gợi ý gaming", "Máy mỏng nhẹ < 1.3kg"] }
        };
    }

    // 6) Agent decide
    let decision: any = null;
    if (wantStrongest) decision = { action: 'strongest', filters: remembered, format: 'cards' };
    else if (wantList) decision = { action: 'search', filters: remembered, format: 'list' };
    else {
        try {
            const { content } = await provider.chat([
                { role: 'system', content: SYS_AGENT },
                { role: 'user', content: `NGỮ CẢNH:\n${context}\n\nNgười dùng: ${message}\n\nChỉ trả JSON.` }
            ], { temperature: 0.2, maxTokens: 180 });
            decision = JSON.parse(content);
        } catch {
            function parseDecision(text: string) {
                if (!text) return null;
                const s = text.indexOf('{'); const e = text.lastIndexOf('}');
                if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { } }
                return null;
            }
            const { content } = await provider.chat(
                [{ role: 'system', content: SYS_AGENT }, { role: 'user', content: `NGỮ CẢNH:\n${context}\n\nNgười dùng: ${message}\n\nChỉ trả JSON.` }],
                { temperature: 0.2, maxTokens: 180 }
            );
            decision = parseDecision(content) || { action: 'reply', reply: 'Bạn cho mình **ngân sách + nhu cầu + hãng** nhé, mình lọc máy phù hợp ngay!' };
        }
    }
    if (!hasIntent && decision?.action !== 'reply') {
        decision = { action: 'reply', reply: 'Bạn mô tả giúp mình **ngân sách + nhu cầu + hãng** nhé.' };
    }

    // 7) Execute
    let reply = '';
    let products: any[] = [];
    let format: 'cards' | 'list' | undefined = decision.format;
    const f = { ...remembered, ...(decision.filters || {}) };

    // ⭐ changed: nếu người dùng nói “gửi … 5 mẫu” → tôn trọng số lượng yêu cầu
    const kWanted = parseWantedCount(message) || (decision.action === 'search' ? 6 : 12);

    const needStrict = !!(f.brand && f.target);
    // Nếu message có số “X tr” mà f vẫn min/max rất nhỏ (do dính session cũ) → thay bằng parse lần nữa
    const msg = deaccent(message);
    const blunt = msg.match(/\b(\d{1,3})\s*(tr|trieu|m)\b/i);
    if (blunt) {
        const v = parseInt(blunt[1], 10) * 1_000_000;
        const span = Math.round(v * 0.15); // ±15%
        f.min = Math.max(0, v - span);
        f.max = v + span;
    }
    {
        const blunt = deaccent(message).match(/\b(\d{1,3})\s*(tr|trieu|m)\b/i);
        if (blunt) {
            const v = parseInt(blunt[1], 10) * 1_000_000;
            const span = Math.round(v * 0.15);
            f.min = Math.max(0, v - span);
            f.max = v + span;
        }
    }
    const searchFn = needStrict ? smartSearchStrict : smartSearch;

    if (decision.action === 'strongest') {
        const { list, reason } = await searchFn(f, takeWanted ?? 12);
        await saveLastContext(session.id, f, list);
        const best = list.length ? list.reduce((acc, cur) =>
            (scoreProduct(cur, f.target) > scoreProduct(acc, f.target) ? cur : acc), list[0]) : null;
        if (best) {
            products = [productDTO(best)];
            format = 'cards';
            reply = await buildLeadText(f, products, reason);
        }
    } else if (decision.action === 'search') {
        const { list, reason } = await searchFn(f, takeWanted ?? 6);
        await saveLastContext(session.id, f, list);
        products = list.map(productDTO);
        if (!format) format = 'list';
        if (products.length) reply = await buildLeadText(f, products, reason);
    }
    else {
        reply = String(decision.reply || '').trim();
    }

    // Fallback khi vẫn rỗng mà đã có intent: thử smartSearch 1 lần nữa
    if ((!reply || !products.length) && needStrict) {
        const brandLabel = Array.isArray(f.brand) ? f.brand.join('/') : f.brand;
        const budgetText = (typeof f.min === "number" || typeof f.max === "number")
            ? `${(f.min ?? 0) / 1e6}–${typeof f.max === 'number' ? f.max / 1e6 : "∞"}tr` : "bạn đưa";
        reply = `Chưa có mẫu **${brandLabel} / ${humanTarget(f.target)}** đúng **tầm giá ${budgetText}** trong shop.
Bạn muốn **mở rộng ±20% ngân sách** hoặc **giữ ${brandLabel} nhưng đổi tầm giá** không?`;
        return {
            status: 200 as const,
            body: {
                sessionId: session.id,
                reply,
                format: undefined,
                products: [],
                activeFilters: f,
                suggestions: [
                    `Giữ ${brandLabel}, mở ngân sách`,
                    `Giữ ${humanTarget(f.target)}, xem hãng tương đương`,
                    "Gợi ý theo ngân sách khác"
                ]
            }
        };
    }

    // >>> thêm ngay trước mục 8):
    if (!reply && products.length) {
        const introRaw = buildIntro(f as any, products.length);
        reply = await polishVietnamese(introRaw, { persona: 'than-thien' });
    }

    // 8) LLM answer (khi không có products/reply)
    if (!reply && products.length === 0) {
        const needStrictHere = (typeof needStrict !== 'undefined') ? needStrict : !!(f?.brand && f?.target);

        if (needStrictHere) {
            const brandLabel = Array.isArray(f.brand) ? f.brand.join('/') : (f.brand || 'hãng bạn chọn');
            const targetLabel = humanTarget(f.target) || 'mục đích bạn chọn';
            const budgetText =
                (typeof f.min === 'number' || typeof f.max === 'number')
                    ? `${(f.min ?? 0) / 1e6}–${(typeof f.max === 'number' ? f.max / 1e6 : '∞')}tr`
                    : 'bạn đưa';

            reply =
                `Chưa có mẫu **${brandLabel} / ${targetLabel}** đúng **tầm giá ${budgetText}** trong shop. ` +
                `Bạn muốn mình **mở rộng ±20% ngân sách** hoặc **giữ ${targetLabel} nhưng xem hãng tương đương** không?`;

            reply = await polishVietnamese(reply, { persona: 'tu-van' });

        } else {
            const msgs: ChatMessage[] = [
                { role: 'system', content: `Bạn là trợ lý bán laptop, trả lời ngắn gọn, không bịa.\n\n${context}` },
                ...history,
                { role: 'user', content: message }
            ];
            const out = await provider.chat(msgs, { temperature: 0.3, maxTokens: 220 });
            reply = out.content || 'Mình chưa rõ ý bạn, có thể nói rõ hơn không?';

            const check = await answerCheck(message, context, reply);
            if (!check.pass && check.revised) reply = check.revised;
            reply = await polishVietnamese(reply, { persona: 'tu-van' });
        }

        const a = await prisma.aiChatMessage.create({
            data: { sessionId: session.id, role: "ASSISTANT", content: reply }
        });
        await upsertMessageEmbedding(a.id, a.content);

        const histSnippet = history.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
        await maybeStoreMemories({
            userId,
            sessionId: session.id,
            historySnippet: histSnippet,
            userMsg: message,
            assistantMsg: reply
        });

    } else {
        const a = await prisma.aiChatMessage.create({
            data: { sessionId: session.id, role: "ASSISTANT", content: (products.length ? 'Gợi ý sản phẩm' : reply) }
        });
        await upsertMessageEmbedding(a.id, a.content);
    }

    await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

    const suggestions = Array.isArray(decision?.suggestions) && decision.suggestions.length
        ? decision.suggestions
        : (products.length
            ? ["Chọn máy mạnh nhất", "Hiển thị dạng thẻ", "Lọc theo < 20tr"]
            : ["Tư vấn theo ngân sách", "Gợi ý gaming", "Máy mỏng nhẹ < 1.3kg"]);

    return {
        status: 200 as const,
        body: { sessionId: session.id, reply: reply || '', format, products, activeFilters: f, suggestions }
    };
}
