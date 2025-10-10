import { prisma } from 'config/client';
import { LocalProvider, ChatMessage } from './vendor/local';
import { retrieveContext } from './retrieve.service';
import { upsertMessageEmbedding } from './embedding.service';
import { maybeStoreMemories } from './memory.service';
import { answerCheck } from './answercheck.service';
import { polishVietnamese } from './style.service';

const provider = new LocalProvider();

/* ====== helpers giống bản bạn đang dùng ====== */
const BRANDS = ["APPLE", "ASUS", "LENOVO", "DELL", "LG", "ACER", "HP", "MSI", "GIGABYTE", "ALIENWARE"];
const WANT_LIST_RE = /(li[eê]̣t kê|g[ơ]̣i [yý]|danh sách|recommend|gợi ý|dòng|model)/i;
const WANT_STRONGEST_RE = /(mạnh nhất|mạnh nhất|best|khủng nhất|cao nhất|đỉnh nhất)/i;
// đặt gần các helper khác
function isGreetingOrSmallTalk(text: string) {
    const t = deaccent(String(text || '')).trim();
    if (!t) return true;
    if (t.length <= 3) return true; // "hi", "ok", "alo"
    return /\b(alo|a lo|hello|hi|chao|xin chao|yo|co ai|test|ping|e|ê|aloha)\b/.test(t);
}

const deaccent = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
function finalPrice(p: any) { const base = +p.price || 0; return p.discount ? Math.max(0, base - Math.round(base * p.discount / 100)) : base; }
function extractGPU(blob: string) { const rx = /\b(RTX|GTX|RX|ARC|IRIS\s?XE)\s?[A-Z0-9\- ]{0,10}\b/gi; const m = blob.match(rx); return m ? m[0].replace(/\s+/g, ' ').trim() : ''; }
function extractScreen(blob: string) {
    const size = blob.match(/\b(13|14|15\.6|16|17|18)(?:\"| inch|-inch)?\b/i)?.[0]?.replace(/-inch/i, ' inch');
    const hz = blob.match(/\b(120|144|165|240|360)hz\b/i)?.[0]?.toUpperCase();
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
function productPriceText(p: any) { const price = finalPrice(p); return price.toLocaleString('vi-VN') + '₫'; }
function productDTO(p: any) {
    const img = p.thumb?.startsWith("http") ? p.thumb
        : p.thumb ? `/images/${p.thumb}`
            : p.image?.startsWith("http") ? p.image
                : `/images/product/${p.image || "no-image.png"}`;
    return {
        id: p.id, name: p.name, price: +p.price || 0, salePrice: finalPrice(p), discount: p.discount || 0,
        image: img, shortDesc: p.shortDesc || "", href: `/product/${p.id}`, specs: productSpecs(p), priceText: productPriceText(p)
    };
}
function scoreProduct(p: any) {
    const blob = `${p.featureTags || ""} ${p.shortDesc || ""} ${p.detailDesc || ""}`.toUpperCase();
    let gpu = 0; const gm = blob.match(/\b(RTX|GTX)\s?-?\s?(\d{3,4})\b/);
    if (gm) { const n = parseInt(gm[2], 10); gpu = n + (gm[1] === "RTX" ? 200 : 0); } else if (/IRIS\s?XE/.test(blob)) gpu = 100;
    const cpuStr = (p.cpu || "").toUpperCase();
    let cpu = /I9/.test(cpuStr) ? 900 : /I7/.test(cpuStr) ? 700 : /I5/.test(cpuStr) ? 500 : /I3/.test(cpuStr) ? 300 : 0;
    const gen = cpuStr.match(/(\d{3,5})/); if (gen) cpu += Math.min(200, Math.floor(parseInt(gen[1], 10) / 10));
    const ram = +p.ramGB || 0, ssd = +p.storageGB || 0; const screenBonus = /QHD|OLED|RETINA|144HZ|120HZ/.test(blob) ? 20 : 0;
    return gpu * 10 + cpu * 4 + ram * 2 + Math.floor(ssd / 128) + screenBonus;
}
function detectSegment(t: string) {
    t = (t || "").toLowerCase();
    if (/doanh\s*nhan|doanh\s*nghi[eê]̣p|business/.test(t)) return "DOANH-NHAN";
    if (/gaming|game|fps|144hz/.test(t)) return "GAMING";
    if (/văn\s*ph[òo]ng|office|sinh\s*vi[eê]n|h[oọ]c/.test(t)) return "SINHVIEN-VANPHONG";
    if (/m[oõ]ng|nh[eẹ]|di\s*đ[ôo]ng|portable/.test(t)) return "MONG-NHE";
    if (/đ[oồ]\s*h[oọ]a|thi[eê]́t\s*k[eê]|photoshop|premiere/.test(t)) return "THIET-KE-DO-HOA";
    return undefined;
}
export function parseFilters(text: string) {
    const t = deaccent(text);
    let brand: string | undefined; for (const b of BRANDS) if (t.includes(b.toLowerCase())) { brand = b; break; }
    const target = detectSegment(text);
    let minBudget: number | undefined, maxBudget: number | undefined;
    const rng = t.match(/(\d{1,3})\s*(?:-|–|to|den|đ[eê]́n)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
    if (rng) { minBudget = +rng[1] * 1_000_000; maxBudget = +rng[2] * 1_000_000; }
    else {
        const under = t.match(/(?:duoi|<|<=)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
        const about = t.match(/(?:tam|khoang|~)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
        const one = t.match(/\b(\d{1,3})\s*(?:tr|trieu|m)\b/i);
        if (under) maxBudget = +under[1] * 1_000_000;
        else if (about) { const v = +about[1] * 1_000_000; minBudget = Math.max(0, v - 3_000_000); maxBudget = v + 3_000_000; }
        else if (one) { const v = +one[1] * 1_000_000; minBudget = Math.max(0, v - 3_000_000); maxBudget = v + 3_000_000; }
    }
    return { brand, target, minBudget, maxBudget, wantList: WANT_LIST_RE.test(text), wantStrongest: WANT_STRONGEST_RE.test(text) };
}
export async function setEphemeralFilter(sessionId: number, key: "filter.brand" | "filter.target" | "filter.budget", value: string) {
    const exist = await prisma.aiMemory.findFirst({ where: { sessionId, key } });
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (exist) await prisma.aiMemory.update({ where: { id: exist.id }, data: { value, type: "EPHEMERAL", score: 0.5, expiresAt } });
    else await prisma.aiMemory.create({ data: { sessionId, key, value, type: "EPHEMERAL", score: 0.5, expiresAt } });
}
export async function getSessionFilters(sessionId: number) {
    const mems = await prisma.aiMemory.findMany({ where: { sessionId, key: { in: ["filter.brand", "filter.target", "filter.budget"] } }, orderBy: { id: "desc" } });
    const out: any = {};
    for (const m of mems) {
        if (m.key === "filter.brand") out.brand = m.value;
        if (m.key === "filter.target") out.target = m.value;
        if (m.key === "filter.budget") { try { const o = JSON.parse(m.value); out.min = +o.min || undefined; out.max = +o.max || undefined; } catch { } }
    }
    return out as { brand?: string; target?: string; min?: number; max?: number };
}

async function listByFilters(f: { brand?: string; target?: string; min?: number; max?: number }, take = 6) {
    const where: any = {}; if (f.brand) where.factory = f.brand; if (f.target) where.target = f.target;
    const all = await prisma.product.findMany({ where, take: 60 });
    const filtered = all.filter(p => {
        const fp = finalPrice(p);
        if (typeof f.min === "number" && fp < f.min) return false;
        if (typeof f.max === "number" && fp > f.max) return false;
        return true;
    });
    if (!filtered.length) return [];
    const sorted = filtered.sort((a, b) => (scoreProduct(b) - scoreProduct(a)) || finalPrice(a) - finalPrice(b));
    return sorted.slice(0, take);
}
async function pickStrongest(f: { brand?: string; target?: string; min?: number; max?: number }) {
    const list = await listByFilters(f, 30);
    if (!list.length) return null;
    let best = list[0], bestScore = scoreProduct(best);
    for (let i = 1; i < list.length; i++) { const sc = scoreProduct(list[i]); if (sc > bestScore) { best = list[i]; bestScore = sc; } }
    return { best, score: bestScore, count: list.length };
}

/* ---------------- Agent JSON ---------------- */
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
- “liệt kê/gợi ý/danh sách/dòng/model/recommend” ⇒ {"action":"search"}.
- “mạnh nhất/đỉnh nhất/best/khủng nhất” ⇒ {"action":"strongest"}.
- Ngân sách "~20tr", "dưới 15tr", "10-15tr" ⇒ set min/max (VND).
- Nhu cầu "gaming/văn phòng/mỏng nhẹ/đồ họa/doanh nhân" ⇒ map "target".
- Luôn kèm "suggestions" 2–4 mục.

VÍ DỤ:
User: "alo"
→ {"action":"reply","reply":"Mình đây 👋 Bạn cho mình **ngân sách + nhu cầu + hãng** (vd: ASUS gaming ~20tr) để gợi ý chính xác nhé.","format":"cards","suggestions":["Tư vấn theo ngân sách","Gợi ý gaming","Máy mỏng nhẹ < 1.3kg"]}

User: "liệt kê laptop mỏng nhẹ dưới 15tr"
→ {"action":"search","filters":{"target":"MONG-NHE","max":15000000},"format":"list","reply":"","suggestions":["Hiển thị dạng thẻ","Chọn máy mạnh nhất","Gợi ý < 12tr"]}

User: "máy mạnh nhất của ASUS tầm 30tr"
→ {"action":"strongest","filters":{"brand":"ASUS","max":30000000},"format":"cards","reply":"","suggestions":["So sánh với Lenovo","Xem thêm gaming","Tư vấn theo ngân sách"]}

User: "tư vấn laptop cho sinh viên IT khoảng 20tr"
→ {"action":"search","filters":{"target":"SINHVIEN-VANPHONG","min":17000000,"max":23000000},"format":"list","reply":"","suggestions":["Chọn máy mạnh nhất","Hiển thị dạng thẻ","Gợi ý RAM 16GB"]}

Chỉ xuất đúng một dòng JSON. Không thêm giải thích, không markdown, không emoji.`;



export async function runTurtleAgent(params: {
    userId: number | null, clientSessionId?: number, message: string
}) {
    const { userId, clientSessionId, message } = params;

    // Session
    let session = clientSessionId
        ? await prisma.aiChatSession.findFirst({ where: userId ? { id: clientSessionId, userId } : { id: clientSessionId } })
        : await prisma.aiChatSession.findFirst({ where: userId ? { userId, status: "OPEN" } : { status: "OPEN" }, orderBy: { lastUsedAt: 'desc' } });
    if (!session) session = await prisma.aiChatSession.create({ data: { userId, topic: 'home_show' } });
    if (session.status === "CLOSED") return { status: 403 as const, body: { message: "session closed" } };

    // Save user + embed
    const u = await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "USER", content: message } });
    await upsertMessageEmbedding(u.id, u.content);

    // Parse/remember filters
    const { brand, target, minBudget, maxBudget, wantList, wantStrongest } = parseFilters(message);
    if (brand) await setEphemeralFilter(session.id, "filter.brand", brand);
    if (target) await setEphemeralFilter(session.id, "filter.target", target);
    if (typeof minBudget === "number" || typeof maxBudget === "number") {
        await setEphemeralFilter(session.id, "filter.budget", JSON.stringify({ min: minBudget, max: maxBudget }));
    }
    const remembered = await getSessionFilters(session.id);
    if (brand) remembered.brand = brand;
    if (target) remembered.target = target;
    if (typeof minBudget === "number") remembered.min = minBudget;
    if (typeof maxBudget === "number") remembered.max = maxBudget;
    // ➜ thêm:
    const hasIntent =
        !!(remembered.brand || remembered.target || remembered.min || remembered.max ||
            wantList || wantStrongest);
    if (!hasIntent && isGreetingOrSmallTalk(message)) {
        const reply = 'Mình đây 👋 Bạn cho mình **ngân sách + nhu cầu + hãng** (vd: "ASUS gaming ~20tr", "mỏng nhẹ < 15tr") để mình lọc máy phù hợp nhé.';
        const a = await prisma.aiChatMessage.create({
            data: { sessionId: session.id, role: "ASSISTANT", content: reply }
        });
        await upsertMessageEmbedding(a.id, a.content);

        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
        return {
            status: 200 as const,
            body: {
                sessionId: session.id,
                reply,
                format: undefined,
                products: [],
                activeFilters: remembered,
                suggestions: ["Tư vấn theo ngân sách", "Gợi ý gaming", "Máy mỏng nhẹ < 1.3kg"]
            }
        };
    }

    // History + KB context
    const lastMsgs = await prisma.aiChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { id: 'desc' }, take: 10 });
    const history = lastMsgs.reverse().map(m => ({ role: m.role.toLowerCase() as 'user' | 'assistant', content: m.content }));
    const memories = await retrieveContext({ userId, sessionId: session.id, query: message, topK: 8 });
    const context = [
        session.summary ? `# TÓM TẮT: ${session.summary}` : '',
        memories.length ? `# GỢI NHỚ:\n- ${memories.map(m => m.text).join('\n- ')}` : '',
        `# FILTER: ${JSON.stringify(remembered)}`
    ].filter(Boolean).join('\n\n');

    // Decision
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
                const s = text.indexOf('{');
                const e = text.lastIndexOf('}');
                if (s >= 0 && e > s) {
                    try { return JSON.parse(text.slice(s, e + 1)); } catch { }
                }
                return null;
            }

            const { content } = await provider.chat(
                [
                    { role: 'system', content: SYS_AGENT },
                    { role: 'user', content: `NGỮ CẢNH:\n${context}\n\nNgười dùng: ${message}\n\nChỉ trả JSON.` }
                ],
                { temperature: 0.2, maxTokens: 180 }
            );
            decision = parseDecision(content) || {
                action: 'reply',
                reply: 'Bạn cho mình **ngân sách + nhu cầu + hãng** nhé, mình lọc máy phù hợp ngay!'
            };
        }
    }
    // Nếu chưa có intent thì không cho agent chọn search/strongest
    if (!hasIntent && decision?.action !== 'reply') {
        decision = { action: 'reply', reply: 'Bạn mô tả giúp mình **ngân sách + nhu cầu + hãng** nhé.' };
    }

    // Execute
    let reply = ''; let products: any[] = []; let format: 'cards' | 'list' | undefined = decision.format;
    const f = { ...remembered, ...(decision.filters || {}) };

    if (decision.action === 'strongest') {
        const picked = await pickStrongest(f);
        if (picked?.best) products = [productDTO(picked.best)];
        format = 'cards';
    } else if (decision.action === 'search') {
        const list = await listByFilters(f, 6);
        products = list.map(productDTO);
        if (!format) format = 'list';
    } else {
        reply = String(decision.reply || '').trim();
    }

    if (!reply && products.length === 0 && hasIntent) {
        const list = await listByFilters(f, 5);
        if (list.length) {
            products = list.map(productDTO);
            format = format || 'cards';
        } else {
            reply = 'Hiện chưa khớp sản phẩm. Bạn có thể nới ngân sách hoặc đổi hãng/nhu cầu giúp mình nhé.';
        }
    }


    // LLM answer (nếu chưa có sản phẩm và chưa có reply)
    if (!reply && products.length === 0) {
        const msgs: ChatMessage[] = [
            { role: 'system', content: `Bạn là trợ lý bán laptop, trả lời ngắn gọn, không bịa.\n\n${context}` },
            ...history,
            { role: 'user', content: message }
        ];
        const out = await provider.chat(msgs, { temperature: 0.3, maxTokens: 220 });
        reply = out.content || 'Mình chưa rõ ý bạn, có thể nói rõ hơn không?';

        const check = await answerCheck(message, context, reply);
        if (!check.pass && check.revised) reply = check.revised;
        // NEW: polish giọng nói
        reply = await polishVietnamese(reply, { persona: 'tu-van' });
        const a = await prisma.aiChatMessage.create({
            data: { sessionId: session.id, role: "ASSISTANT", content: reply }
        });
        await upsertMessageEmbedding(a.id, a.content);

        const histSnippet = history.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
        await maybeStoreMemories({ userId, sessionId: session.id, historySnippet: histSnippet, userMsg: message, assistantMsg: reply });
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
