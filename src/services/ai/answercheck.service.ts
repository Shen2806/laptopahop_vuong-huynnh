import { LocalProvider } from './vendor/local';
const provider = new LocalProvider();

export async function answerCheck(userMsg: string, context: string, answer: string) {
    if (!answer || answer.length < 4) {
        return { pass: false, revised: 'Mình chưa rõ ý bạn. Bạn cho mình **ngân sách + nhu cầu + hãng** nhé (vd: ASUS gaming ~20tr).' };
    }
    const SYS = `Bạn là bộ KIỂM DUYỆT câu trả lời cho trợ lý bán laptop.
Trả về JSON {"pass": boolean, "revised": "..."}. Nếu câu trả lời không bám ngữ cảnh hoặc chưa hữu ích, hãy sửa ngắn gọn, không bịa.`;

    const USER = `# USER\n${userMsg}\n\n# NGỮ CẢNH\n${context}\n\n# ANSWER\n${answer}`;

    try {
        const { content } = await provider.chat([
            { role: 'system', content: SYS },
            { role: 'user', content: USER }
        ], { temperature: 0.1 });
        const o = JSON.parse(content || '{}');
        return { pass: !!o.pass, revised: o.revised };
    } catch {
        return { pass: true };
    }
}
