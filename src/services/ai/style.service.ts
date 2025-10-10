import { LocalProvider } from './vendor/local';

const STYLE_SYS = `
Bạn là BIÊN TẬP VIÊT cho trợ lý bán laptop (tiếng Việt).
Yêu cầu:
- Giọng thân thiện, gọn, không ba hoa.
- Ưu tiên câu trả lời theo khuôn: 1 dòng tóm ý → 2–4 gạch đầu dòng cụ thể.
- Không bịa. Không nhắc tới “tôi là AI”. Không chèn emoji trừ khi user dùng trước.
- Nếu user chưa nêu đủ điều kiện mua, hãy kết thúc bằng 1 câu hỏi gợi mở (ngân sách/hãng/nhu cầu).
Trả về nội dung đã biên tập, không thêm chú thích.
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
