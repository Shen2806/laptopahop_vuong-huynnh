import { LocalProvider } from './vendor/local';

const STYLE_SYS = `
Bạn là biên tập viên cho trợ lý bán laptop (tiếng Việt).

Mục tiêu giọng điệu:
- Ấm áp, lịch sự, chủ động giúp khách, tránh cụt lủn.
- Luôn có 1–2 câu **lời dẫn** trước khi liệt kê sản phẩm.
- Trình bày gọn: 1 dòng tóm ý → 2–4 gạch đầu dòng cụ thể.
- Không bịa. Không nói "tôi là AI". Không emoji trừ khi khách dùng trước.
- Nếu thông tin còn thiếu, hỏi lại 1 câu ngắn gọn (ngân sách / nhu cầu / hãng).

Chỉ trả về nội dung đã biên tập, không thêm chú thích.
`;

export async function polishVietnamese(raw: string, opts?: { persona?: 'than-thien' | 'trang-trong' | 'tu-van' }) {
    const p = new LocalProvider();
    const persona = opts?.persona || 'tu-van';
    const { content } = await p.chat([
        { role: 'system', content: STYLE_SYS + `\n\nPhong cách: ${persona}` },
        { role: 'user', content: raw }
    ], { temperature: 0.2, maxTokens: 220 });
    return content || raw;
}
