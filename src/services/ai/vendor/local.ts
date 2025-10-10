// src/services/ai/vendor/local.ts
// Local LLM + Embedding using @xenova/transformers (offline, no API keys)
import 'dotenv/config';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string }
export interface ChatOpts { temperature?: number; maxTokens?: number }

// --- ESM-safe dynamic import: tránh TS transpile sang require() ---
const dynImport: (s: string) => Promise<any> =
    new Function('s', 'return import(s)') as any;

let _loaded = false;
let _loadingPromise: Promise<void> | null = null;
let _tr: any = null;          // transformers namespace
let _generator: any = null;   // text-generation pipeline
let _embedder: any = null;    // feature-extraction pipeline

async function ensureLoaded() {
    if (_loaded) return;
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = (async () => {
        _tr = await dynImport('@xenova/transformers');

        // Cấu hình cache local
        const dir = process.env.AI_LOCAL_MODELS_DIR || './models';
        _tr.env.localModelPath = dir;
        _tr.env.cacheDir = dir;

        // Cho phép tải model lần đầu (set AI_LOCAL_OFFLINE=1 nếu muốn chặn hoàn toàn)
        if (process.env.AI_LOCAL_OFFLINE === '1') {
            _tr.env.allowRemoteModels = false;
        }

        // (Tùy chọn) tăng tốc bằng onnxruntime-node nếu có
        try { await dynImport('onnxruntime-node'); } catch { /* optional */ }

        _loaded = true;
    })();
    await _loadingPromise;
}

function buildPrompt(gen: any, messages: ChatMessage[]): string {
    // Ưu tiên chat template của tokenizer (Phi/Qwen/Llama…)
    if (gen?.tokenizer?.apply_chat_template) {
        return gen.tokenizer.apply_chat_template(
            messages.map(m => ({ role: m.role, content: m.content })),
            { tokenize: false, add_generation_prompt: true }
        );
    }
    // Fallback: ghép role theo định dạng đơn giản
    const lines: string[] = [];
    for (const m of messages) {
        const role = m.role.toUpperCase();
        lines.push(`[${role}]: ${m.content}`);
    }
    lines.push('[ASSISTANT]:'); // hint sinh tiếp
    return lines.join('\n');
}

export class LocalProvider {
    chatModel = process.env.AI_LOCAL_CHAT_MODEL || 'Xenova/Phi-3-mini-4k-instruct';
    embedModel = process.env.AI_LOCAL_EMBED_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

    async _generator() {
        await ensureLoaded();
        if (_generator) return _generator;

        const candidates = [
            this.chatModel, // từ .env
            'Xenova/Qwen2.5-0.5B-Instruct',
            'Xenova/TinyLlama-1.1B-Chat-v1.0'
        ].filter(Boolean) as string[];

        let lastErr: any = null;
        for (const m of candidates) {
            try {
                _generator = await _tr.pipeline('text-generation', m);
                this.chatModel = m;
                console.warn('[LocalProvider] using chat model:', m);
                return _generator;
            } catch (e) {
                lastErr = e;
                console.warn('[LocalProvider] failed to load', m, e?.message || e);
            }
        }
        throw lastErr || new Error('No supported chat model');
    }


    async _embedder() {
        await ensureLoaded();
        if (!_embedder) {
            _embedder = await _tr.pipeline('feature-extraction', this.embedModel);
        }
        return _embedder;
    }

    /** Chat (CPU, offline khi đã cache) */
    async chat(messages: ChatMessage[], opts: ChatOpts = {}) {
        const gen = await this._generator();
        const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.3;
        const max_new_tokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : 256;

        const prompt = buildPrompt(gen, messages);

        const out = await gen(prompt, {
            max_new_tokens,
            temperature,
            top_p: 0.95,
            repetition_penalty: 1.1,
            do_sample: temperature > 0,
            // return_full_text: true (mặc định)
        });

        const full = String(out?.[0]?.generated_text || '');
        const answer = full.startsWith(prompt) ? full.slice(prompt.length).trim() : full.trim();
        return { content: answer, usage: null };
    }

    /** Embedding (mean-pooling + L2-normalize) */
    async embed(input: string): Promise<{ embedding: number[]; dim: number }> {
        const emb = await this._embedder();
        const res = await emb(input);
        // res: Tensor [1, seq, dim]
        const data: Float32Array = res.data;
        const dims: number[] = res.dims || res.shape || []; // phòng trường hợp version khác
        if (dims.length < 3) {
            // Một số model trả [1, dim] -> xử lý mềm
            const dim = dims.at(-1) ?? data.length;
            const vec = Array.from(data.slice(0, dim));
            // L2 normalize
            let s = 0; for (let j = 0; j < dim; j++) s += vec[j] * vec[j];
            const norm = Math.sqrt(s) || 1;
            return { embedding: vec.map(v => v / norm), dim };
        }

        const seq = dims[dims.length - 2];
        const dim = dims[dims.length - 1];
        const mean = new Float64Array(dim);
        for (let i = 0; i < seq; i++) {
            const base = i * dim;
            for (let j = 0; j < dim; j++) mean[j] += data[base + j];
        }
        for (let j = 0; j < dim; j++) mean[j] /= Math.max(1, seq);

        // L2 normalize
        let s = 0; for (let j = 0; j < dim; j++) s += mean[j] * mean[j];
        const norm = Math.sqrt(s) || 1;
        const vec = Array.from(mean).map(v => v / norm);
        return { embedding: vec, dim };
    }

    /** (Tùy chọn) Warm-up cả 2 pipeline để lần gọi đầu nhanh hơn */
    async warm() {
        await Promise.all([this._generator(), this._embedder()]);
    }

}
export const localProvider = new LocalProvider();