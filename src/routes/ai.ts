import { Router } from "express";
import OpenAI from "openai";
import { prisma } from "config/client";

const router = Router();
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/* ---------- helpers ---------- */
const BRANDS = ["APPLE", "ASUS", "LENOVO", "DELL", "LG", "ACER", "HP", "MSI", "GIGABYTE", "ALIENWARE"];
const WANT_LIST_RE = /(li[eê]̣t kê|g[ơ]̣i [yý]|danh sách|recommend|gợi ý|dòng|model)/i;
const WANT_STRONGEST_RE = /(mạnh nhất|mạnh nhất|best|khủng nhất|cao nhất|đỉnh nhất)/i;

const deaccent = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
function finalPrice(p: any) { const base = +p.price || 0; return p.discount ? Math.max(0, base - Math.round(base * p.discount / 100)) : base; }
function productDTO(p: any) {
    const img = p.thumb?.startsWith("http") ? p.thumb
        : p.thumb ? `/images/${p.thumb}`
            : p.image?.startsWith("http") ? p.image
                : `/images/product/${p.image || "no-image.png"}`;
    return { id: p.id, name: p.name, price: +p.price || 0, salePrice: finalPrice(p), discount: p.discount || 0, image: img, shortDesc: p.shortDesc || "", href: `/product/${p.id}` };
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
function formatListLine(p: any) {
    const priceF = finalPrice(p).toLocaleString("vi-VN") + "₫";
    const d = p.discount ? ` (giảm ${p.discount}%)` : "";
    return `• **${p.name}** — ${priceF}${d} → /product/${p.id}`;
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
function detectBrand(t: string) {
    t = (t || "").toLowerCase();
    if (/asus|tuf|rog/.test(t)) return "ASUS";
    if (/lenovo|ideapad|legion/.test(t)) return "LENOVO";
    if (/dell|inspiron|latitude/.test(t)) return "DELL";
    if (/lg|gram/.test(t)) return "LG";
    if (/acer|nitro|swift|aspire/.test(t)) return "ACER";
    if (/apple|macbook|m1|m2/.test(t)) return "APPLE";
    if (/\bhp\b|victus|omen/.test(t)) return "HP";
    if (/msi/.test(t)) return "MSI";
    return undefined;
}
function parseFilters(text: string) {
    const t = deaccent(text);
    let brand: string | undefined; for (const b of BRANDS) if (t.includes(b.toLowerCase())) { brand = b; break; }
    const target = detectSegment(text);
    let minBudget: number | undefined, maxBudget: number | undefined;
    const rng = t.match(/(\d{1,3})\s*(?:-|–|to|den|đ[eê]́n)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
    if (rng) { minBudget = +rng[1] * 1_000_000; maxBudget = +rng[2] * 1_000_000; }
    else {
        const under = t.match(/(?:duoi|<|<=)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
        const about = t.match(/(?:tam|khoang)\s*(\d{1,3})\s*(?:tr|trieu|m)?/i);
        const one = t.match(/\b(\d{1,3})\s*(?:tr|trieu|m)\b/i);
        if (under) maxBudget = +under[1] * 1_000_000;
        else if (about) { const v = +about[1] * 1_000_000; minBudget = Math.max(0, v - 3_000_000); maxBudget = v + 3_000_000; }
        else if (one) { const v = +one[1] * 1_000_000; minBudget = Math.max(0, v - 3_000_000); maxBudget = v + 3_000_000; }
    }
    return { brand, target, minBudget, maxBudget, wantList: WANT_LIST_RE.test(text), wantStrongest: WANT_STRONGEST_RE.test(text) };
}
async function setEphemeralFilter(sessionId: number, key: "filter.brand" | "filter.target" | "filter.budget", value: string) {
    const exist = await prisma.aiMemory.findFirst({ where: { sessionId, key } });
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (exist) await prisma.aiMemory.update({ where: { id: exist.id }, data: { value, type: "EPHEMERAL", score: 0.5, expiresAt } });
    else await prisma.aiMemory.create({ data: { sessionId, key, value, type: "EPHEMERAL", score: 0.5, expiresAt } });
}
async function getSessionFilters(sessionId: number) {
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
    const filtered = all.filter(p => { const fp = finalPrice(p); if (typeof f.min === "number" && fp < f.min) return false; if (typeof f.max === "number" && fp > f.max) return false; return true; });
    if (!filtered.length) return [];
    const sorted = filtered.sort((a, b) => scoreProduct(b) - scoreProduct(a) || finalPrice(a) - finalPrice(b));
    return sorted.slice(0, take);
}
async function pickStrongest(f: { brand?: string; target?: string; min?: number; max?: number }) {
    const list = await listByFilters(f, 30);
    if (!list.length) return null;
    let best = list[0], bestScore = scoreProduct(best);
    for (let i = 1; i < list.length; i++) { const sc = scoreProduct(list[i]); if (sc > bestScore) { best = list[i]; bestScore = sc; } }
    return { best, score: bestScore, count: list.length };
}
async function chatLLM(messages: any[], maxRetries = 2) {
    if (!openai) throw Object.assign(new Error("NO_OPENAI_KEY"), { code: "NO_OPENAI_KEY" });
    let delay = 600;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const out = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.3, messages });
            return out.choices?.[0]?.message?.content?.trim() || "";
        } catch (e: any) {
            const is429 = e?.status === 429 || e?.code === "insufficient_quota";
            if (is429 && i < maxRetries) { await new Promise(r => setTimeout(r, delay + Math.random() * 250)); delay *= 2; continue; }
            throw e;
        }
    }
    return "";
}

/* ---------- route ---------- */
router.post("/ai/chat", async (req, res) => {
    try {
        let message = "", clientSessionId: number | undefined;
        if (typeof req.body === "string") message = req.body.trim();
        else if (req.body) { if (typeof req.body.message === "string") message = req.body.message.trim(); if (req.body.sessionId) clientSessionId = Number(req.body.sessionId); }
        if (!message) {
            return res.json({ reply: 'Bạn cho mình biết **ngân sách + nhu cầu + hãng** nhé (vd: "ASUS gaming ~20tr", "dưới 15tr mỏng nhẹ").', products: [] });
        }

        const userId = (req as any)?.user?.id ?? null;

        // session
        let session = clientSessionId
            ? await prisma.aiChatSession.findUnique({ where: { id: clientSessionId } })
            : await prisma.aiChatSession.findFirst({ where: { userId: userId ?? undefined, status: "OPEN" }, orderBy: { lastUsedAt: "desc" } });
        if (!session) session = await prisma.aiChatSession.create({ data: { userId, topic: "home_show" } });

        // save user msg
        await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "USER", content: message } });

        // parse + remember filters
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

        /* ---- strongest -> CARDS ONLY ---- */
        if (wantStrongest) {
            const picked = await pickStrongest(remembered);
            if (picked?.best) {
                const p = picked.best;
                const lines = `Gợi ý mạnh nhất: ${p.name} → /product/${p.id}`;
                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: lines } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
                return res.json({
                    sessionId: session.id,
                    reply: "",                       // cards only
                    format: "cards",
                    products: [productDTO(p)],
                    suggestions: ["So sánh với máy khác", "Xem thêm gaming", "Tư vấn theo ngân sách"]
                });
            }
        }

        /* ---- list -> CARDS ONLY ---- */
        if (wantList) {
            const list = await listByFilters(remembered, 6);
            if (list.length) {
                const legend = `Gợi ý theo ${remembered.brand || "tất cả hãng"}${remembered.target ? ` / ${remembered.target}` : ""}${(remembered.min || remembered.max) ? ` — ${(remembered.min || 0) / 1e6}–${typeof remembered.max === "number" ? remembered.max / 1e6 : "∞"}tr` : ""}`;
                const text = legend + "\n" + list.map(formatListLine).join("\n");
                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: text } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
                return res.json({
                    sessionId: session.id,
                    reply: "",
                    format: "cards",
                    products: list.map(productDTO),
                    suggestions: ["Chọn máy mạnh nhất", "Lọc theo < 20tr", "Máy nhẹ < 1.3kg"]
                });
            }
        }

        /* ---- free chat with LLM (fallback DB) ---- */
        let reply = "";
        try {
            const history = await prisma.aiChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { id: "asc" }, take: 14 });
            const sys = { role: "system" as const, content: "Bạn là **Rùa AI** của LaptopShop. Trả lời ngắn gọn, gạch đầu dòng khi cần. Nếu nhắc đến sản phẩm trong cửa hàng, luôn gắn link /product/:id. Ngôn ngữ: tiếng Việt." };
            const msgs = [sys, ...history.map(m => ({ role: m.role.toLowerCase() as any, content: m.content })), { role: "user" as const, content: message }];
            reply = await chatLLM(msgs, 2);
        } catch (e: any) {
            const list = await listByFilters(remembered, 5);
            if (list.length) {
                const lines = list.map(formatListLine).join("\n");
                const text = [
                    "Hệ thống AI đang quá tải nên mình trả lời nhanh dựa trên dữ liệu cửa hàng:",
                    remembered.brand || remembered.target || remembered.min || remembered.max
                        ? `• Bộ lọc: ${remembered.brand || "tất cả hãng"}${remembered.target ? ` / ${remembered.target}` : ""}${(remembered.min || remembered.max) ? ` — ${(remembered.min || 0) / 1e6}–${typeof remembered.max === "number" ? remembered.max / 1e6 : "∞"}tr` : ""}`
                        : "• Bạn có thể thêm hãng/nhu cầu/ngân sách để mình gợi ý sát hơn.",
                    lines,
                    "Bạn muốn mình **chọn mạnh nhất** trong các máy này không?"
                ].join("\n");
                await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: text } });
                await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
                return res.json({
                    sessionId: session.id,
                    reply: "",
                    format: "cards",
                    products: list.map(productDTO),
                    suggestions: ["Chọn máy mạnh nhất", "Lọc theo < 15tr", "Xem ASUS / LENOVO"]
                });
            } else {
                reply = "Hiện chưa truy xuất được AI. Bạn cho mình thêm **hãng/nhu cầu/ngân sách** (vd: ASUS gaming 20–25 triệu), mình lọc sản phẩm có link ngay nhé!";
            }
        }

        if (!reply) reply = "Mình chưa rõ ý bạn, có thể nói chi tiết hơn không?";

        await prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "ASSISTANT", content: reply } });
        await prisma.aiChatSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
        return res.json({ sessionId: session.id, reply, products: [] });
    } catch (err: any) {
        console.error("[AI]", err);
        return res.status(200).json({ reply: "Có lỗi máy chủ. Bạn thử lại giúp mình nhé.", error: String(err?.message || err) });
    }
});

export default router;
