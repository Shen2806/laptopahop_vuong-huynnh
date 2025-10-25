// cspell:words rerank deaccent
// src/services/ai/reranker.service.ts

export type RerankDoc = { text: string; meta?: any };
export type RerankScored = RerankDoc & { rscore: number };

/* ---------- utils: VN-friendly tokenization ---------- */
function deaccent(s = "") {
    return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function tok(s: string) {
    return deaccent(String(s || ""))
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

/* ---------- Jaccard overlap ---------- */
function jaccard(a: string[], b: string[]) {
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const uni = A.size + B.size - inter || 1;
    return inter / uni;
}

/* ---------- cheap hash-TF embedding + cosine ---------- */
function tfHashEmbed(text: string, dim = 256) {
    const tks = tok(text);
    const v = new Array<number>(dim).fill(0);
    for (const t of tks) {
        let h = 2166136261 >>> 0; // FNV-like
        for (let i = 0; i < t.length; i++) h = ((h ^ t.charCodeAt(i)) * 16777619) >>> 0;
        v[h % dim] += 1;
    }
    // L2 normalize
    let s = 0;
    for (const x of v) s += x * x;
    s = Math.sqrt(s) || 1;
    for (let i = 0; i < v.length; i++) v[i] = v[i] / s;
    return v;
}
function cosine(a: number[], b: number[]) {
    const n = Math.min(a.length, b.length);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
    const d = Math.sqrt(na) * Math.sqrt(nb) || 1;
    return dot / d;
}

/**
 * Rerank tài liệu cho query:
 * score = 0.6 * Jaccard(token overlap) + 0.4 * Cosine(hash-embed)
 */
export async function rerank(
    query: string,
    docs: RerankDoc[],
    topK = 8
): Promise<RerankScored[]> {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const tq = tok(query);
    const qv = tfHashEmbed(query, 256);

    const scored = docs.map((d) => {
        const dt = tok(d.text || "");
        const dv = tfHashEmbed(d.text || "", 256);
        const sJac = jaccard(tq, dt);
        const sCos = cosine(qv, dv);
        const rscore = 0.6 * sJac + 0.4 * sCos;
        return { ...d, rscore };
    });

    scored.sort((a, b) => b.rscore - a.rscore);
    return scored.slice(0, topK);
}

export function rerankLocal(
    query: string,
    docs: RerankDoc[],
    topK = 8
): RerankScored[] {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const tq = tok(query);
    const qv = tfHashEmbed(query, 256);
    const scored = docs.map((d) => {
        const dt = tok(d.text || "");
        const dv = tfHashEmbed(d.text || "", 256);
        const sJac = jaccard(tq, dt);
        const sCos = cosine(qv, dv);
        const rscore = 0.6 * sJac + 0.4 * sCos;
        return { ...d, rscore };
    });
    scored.sort((a, b) => b.rscore - a.rscore);
    return scored.slice(0, topK);
}