import { LocalProvider } from './vendor/local';

let _pipe: any = null;
async function getPipe() {
    if (_pipe) return _pipe;
    const p = new LocalProvider();
    // Xenova/bge-reranker-base (onnx) – hỗ trợ rerank; nếu nặng quá chuyển tiny
    const tr: any = await (new Function('s', 'return import(s)'))('@xenova/transformers');
    _pipe = await tr.pipeline('text-classification', 'Xenova/bge-reranker-base');
    return _pipe;
}

/** Score cặp (query, doc) càng cao càng liên quan */
export async function rerank(query: string, docs: { text: string, meta?: any }[], topK = 8) {
    if (!docs.length) return [];
    try {
        const pipe = await getPipe();
        const inputs = docs.map(d => ({ text: query, text_pair: d.text }));
        const scores = await pipe(inputs, { top_k: docs.length });
        // scores là 1 array score theo từng input
        const out = docs.map((d, i) => ({ ...d, rscore: Number(scores[i]?.score || 0) }));
        out.sort((a, b) => b.rscore - a.rscore);
        return out.slice(0, topK);
    } catch {
        return docs.slice(0, topK); // nếu model thiếu, cứ trả topK cũ
    }
}
