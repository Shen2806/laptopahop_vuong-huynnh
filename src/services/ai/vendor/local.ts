// src/services/ai/vendor/local.ts
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/* ============ utils ============ */
function deaccent(s = "") {
    return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function normLower(s = "") {
    return deaccent(s).toLowerCase();
}
function tokenize(s = ""): string[] {
    return normLower(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/* ============ cheap embedding (hash-TF + L2) ============ */
function tfHashEmbed(text: string, dim = 512) {
    const toks = tokenize(text);
    const v = new Array<number>(dim).fill(0);
    for (const t of toks) {
        let h = 2166136261 >>> 0; // FNV-like
        for (let j = 0; j < t.length; j++) h = ((h ^ t.charCodeAt(j)) * 16777619) >>> 0;
        v[h % dim] += 1;
    }
    // L2 normalize
    let s = 0;
    for (const x of v) s += x * x;
    const n = Math.sqrt(s) || 1;
    return v.map((x) => x / n);
}

/* ============ domain helpers ============ */
const BRANDS = ["APPLE", "ASUS", "LENOVO", "DELL", "LG", "ACER", "HP", "MSI", "GIGABYTE", "ALIENWARE"];
const WANT_LIST_RE = /(li[eê]̣t kê|g[ơ]̣i [yý]|danh\s*s[aá]ch|recommend|gợi ý|d[oô]ng|model)/i;
const WANT_STRONGEST_RE = /(mạnh nh[aấ]t|mạnh nhất|best|kh[ủu]ng nh[aấ]t|cao nh[aấ]t|đ[iỉ]nh nhất)/i;

function detectTarget(t: string) {
    t = normLower(t);
    if (/doanh\s*nhan|doanh\s*nghi[eê]̣p|business/.test(t)) return "DOANH-NHAN";
    if (/gaming|game|fps|144hz/.test(t)) return "GAMING";
    if (/v[aă]n\s*ph[òo]ng|office|sinh\s*vi[eê]n|h[oọ]c/.test(t)) return "SINHVIEN-VANPHONG";
    if (/m[oõ]ng|nh[eẹ]|di\s*ch[u]y[eê]̉n|portable|ultrabook/.test(t)) return "MONG-NHE";
    if (/đ[oồ]\s*h[oọ]a|thi[eế]t\s*k[eê]|photoshop|premiere|d[u]̣ng phim|edit/.test(t)) return "THIET-KE-DO-HOA";
    return undefined;
}
function parseBrand(t: string) {
    const s = normLower(t);
    for (const b of BRANDS) if (s.includes(b.toLowerCase())) return b;
    return undefined;
}
function parseBudget(text: string) {
    const t = normLower(text).replace(/\./g, "").replace(/,/g, "").trim();
    // range: 15-25 | 15–25 | 15 — 25 | 15 đến 25 | 15 to 25
    let m = t.match(/(\d{1,3})\s*(?:-|–|—|to|t[oơ]́i|toi|den|đ[eê]́n)\s*(\d{1,3})\s*(?:tr|tri[eê]u|m)?/);
    if (m) return { min: +m[1] * 1e6, max: +m[2] * 1e6 };
    // dưới X
    m = t.match(/(?:d[uư]ới|<|<=)\s*(\d{1,3})\s*(?:tr|tri[eê]u|m)?/);
    if (m) return { min: 0, max: +m[1] * 1e6 };
    // trên X
    m = t.match(/(?:tr[eê]n|>|>=)\s*(\d{1,3})\s*(?:tr|tri[eê]u|m)?/);
    if (m) { const x = +m[1] * 1e6; return { min: x, max: x + 9e12 }; }
    // ~20 | tầm 20 | khoảng 20
    m = t.match(/(?:~|t[aă]m|kho[aă]ng|x[â]́p x[i]̉)?\s*(\d{1,3})\s*(?:tr|tri[eê]u|m)?/);
    if (m) { const x = +m[1]; const pad = x >= 25 ? 5 : 3; return { min: (x - pad) * 1e6, max: (x + pad) * 1e6 }; }
    return undefined;
}
function hasNeed(text: string) { return !!detectTarget(text); }
function hasBudget(text: string) { return !!parseBudget(text); }
function isSmallTalk(text: string) {
    const t = normLower(text).trim();
    if (!t || t.length <= 3) return true;
    return /\b(alo|hello|hi|ch[aà]o|xin ch[à]o|yo|co ai|test|ping|ê|e)\b/.test(t);
}

/* ============ behavior blocks ============ */
function agentJSON(userText: string) {
    const target = detectTarget(userText);
    const brand = parseBrand(userText);
    const money = parseBudget(userText);
    const wantList = WANT_LIST_RE.test(userText);
    const wantStrongest = WANT_STRONGEST_RE.test(userText);

    if (isSmallTalk(userText) && !target && !brand && !money) {
        return {
            action: "reply",
            format: "cards",
            reply: 'Mình đây 👋 Bạn cho mình **ngân sách + nhu cầu + hãng** (vd: "ASUS gaming ~20tr") để gợi ý chính xác nhé.',
            suggestions: ["Tư vấn theo ngân sách", "Gợi ý gaming", "Máy mỏng nhẹ < 1.3kg"],
        };
    }
    if (wantStrongest) {
        return {
            action: "strongest",
            format: "cards",
            filters: { ...(brand ? { brand } : {}), ...(target ? { target } : {}), ...(money || {}) },
            reply: "",
            suggestions: ["So sánh với máy khác", "Xem thêm gaming", "Tư vấn theo ngân sách"],
        };
    }
    if (wantList || (target && money)) {
        return {
            action: "search",
            format: "list",
            filters: { ...(brand ? { brand } : {}), ...(target ? { target } : {}), ...(money || {}) },
            reply: "",
            suggestions: ["Chọn máy mạnh nhất", "Hiển thị dạng thẻ", "Lọc theo < 20tr"],
        };
    }
    return {
        action: "reply",
        format: "cards",
        reply: "Bạn cần máy cho mục đích gì (gaming/văn phòng/đồ hoạ/di chuyển)? Ngân sách bạn dự kiến khoảng bao nhiêu (VNĐ)?",
        suggestions: ["Gợi ý gaming ~20tr", "Văn phòng ≤ 15tr", "Mỏng nhẹ < 1.3kg"],
    };
}

export function polishVN(raw: string) {
    const s = (raw || "").trim();
    if (!s) return s;
    const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const bullets = lines.filter((x) => /^[-•]/.test(x)).slice(0, 6);
    const head = lines.find((x) => !/^[-•]/.test(x)) || "Gợi ý nhanh (giá tham khảo thị trường):";
    const tail =
        lines.find((x) => /\bL[ờơ]i khuy[eê]n\b/i.test(x)) ||
        "**Lời khuyên:** Ưu tiên RAM 16GB, SSD ≥512GB; kiểm tra tản nhiệt & bảo hành.";
    let out = head + "\n";
    if (bullets.length) out += bullets.join("\n") + "\n";
    out += tail;
    return out;
}

function memoryExtract(historySnippet: string, userMsg: string, assistantMsg: string) {
    const items: any[] = [];
    const brand = parseBrand(userMsg) || parseBrand(assistantMsg);
    if (brand) items.push({ type: "PREFERENCE", key: "pref.brand", value: brand, score: 0.8 });

    const t = detectTarget(userMsg) || detectTarget(assistantMsg);
    if (t) items.push({ type: "PREFERENCE", key: "pref.target", value: t, score: 0.8 });

    const b = parseBudget(userMsg) || parseBudget(assistantMsg);
    if (b) items.push({ type: "EPHEMERAL", key: "filter.budget", value: JSON.stringify(b), score: 0.5, ttl_hours: 2 });

    if (/sinh\s*vi[eê]n\s*it|lap\s*trinh|dev/i.test(normLower(userMsg + " " + historySnippet))) {
        items.push({ type: "FACT", key: "user.role", value: "STUDENT_IT", score: 0.7 });
    }
    return JSON.stringify({ items });
}

function answerGuard(userMsg: string, context: string, answer: string) {
    const ok = !!answer && answer.length >= 20;
    if (ok) return JSON.stringify({ pass: true, revised: "" });

    const enoughNeed = hasNeed(userMsg) || hasNeed(context);
    const enoughMoney = hasBudget(userMsg) || hasBudget(context);
    let revised = answer || "";
    if (!enoughNeed || !enoughMoney) {
        revised = 'Bạn cho mình **nhu cầu chính** (gaming/văn phòng/đồ hoạ/di chuyển) và **ngân sách (VNĐ)** nhé (vd: ASUS gaming ~20tr).';
    } else {
        revised = 'Gợi ý nhanh: i5/R5 H, RAM 16GB, SSD 512GB, màn 15.6" 144Hz. **Lời khuyên:** Ưu tiên RAM dual-channel, kiểm tra tản nhiệt.';
    }
    return JSON.stringify({ pass: false, revised });
}

/* ============ router by system intent ============ */
function routeChat(messages: ChatMessage[]): string {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const userLast = (messages.slice().reverse().find((m) => m.role === "user")?.content || "").trim();

    // Agent JSON
    if (/Chỉ (được )?xuất MỘT DÒNG JSON|Chỉ trả JSON|Only output ONE LINE JSON/i.test(sys)) {
        return JSON.stringify(agentJSON(userLast));
    }
    // Biên tập
    if (/BIÊN T[ẬA]P VI[EÊ]T|polish/i.test(sys)) {
        const raw = userLast || messages.find((m) => m.role === "assistant")?.content || "";
        return polishVN(raw);
    }
    // Trích xuất ký ức
    if (/TR[ÍI]CH XU[ẤA]T K[ÝY] ỨC|K[YÝ] ỨC/i.test(sys)) {
        const hist = messages.filter((m) => m.role !== "system").map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
        const u = userLast;
        const a = messages.slice().reverse().find((m) => m.role === "assistant")?.content || "";
        return memoryExtract(hist, u, a);
    }
    // Kiểm duyệt
    if (/KIỂM DUYỆT|KIEM DUYET|moderation|review/i.test(sys)) {
        const joined = messages.map((m) => m.content).join("\n");
        const userMsg = /# USER\s*\n([\s\S]*?)\n\s*#/i.exec(joined)?.[1] || userLast;
        const context = /# NGỮ CẢNH\s*\n([\s\S]*?)\n\s*#/i.exec(joined)?.[1] || "";
        const answer = /# ANSWER\s*\n([\s\S]*)$/i.exec(joined)?.[1] || "";
        return answerGuard(userMsg, context, answer);
    }

    // Fallback heuristic
    if (hasNeed(userLast) && hasBudget(userLast)) {
        return [
            "Gợi ý nhanh (**giá tham khảo thị trường**):",
            "- **Phương án 1 (cân bằng)**: i5/R5 H / RAM 16GB / SSD 512GB / 15.6\" 144Hz",
            "- **Phương án 2 (ưu GPU)**: i7/R7 + RTX 4050↑ / RAM 16–32GB / SSD 1TB",
            "**Lời khuyên:** Ưu tiên RAM 16GB dual-channel; kiểm tra tản nhiệt & bảo hành.",
        ].join("\n");
    }
    return 'Bạn mô tả giúp mình **nhu cầu chính** (gaming/văn phòng/đồ hoạ/di chuyển) và **ngân sách (VNĐ)** nhé. Ví dụ: “ASUS gaming ~20tr”.';
}

/* ============ public provider ============ */
export class LocalProvider {
    async embed(text: string) {
        const embedding = tfHashEmbed(text, 512);
        return { embedding, dim: embedding.length };
    }
    async chat(messages: ChatMessage[], _opts?: { temperature?: number; maxTokens?: number }) {
        return { content: routeChat(messages) };
    }
}
