// src/services/ai/style.service.ts
import { polishVN as localPolish } from './vendor/local';

const STYLE_SYS = `
Bạn là biên tập viên cho trợ lý bán laptop (tiếng Việt).

Mục tiêu giọng điệu:
- Ấm áp, lịch sự, chủ động giúp khách, tránh cụt lủn.
- Luôn có 1–2 câu lời dẫn trước khi liệt kê sản phẩm.
- Trình bày gọn: 1 dòng tóm ý → 2–4 gạch đầu dòng cụ thể.
- Không bịa. Không nói "tôi là AI". Không emoji trừ khi khách dùng trước.
- Nếu thông tin còn thiếu, hỏi lại 1 câu ngắn gọn (ngân sách / nhu cầu / hãng).

Chỉ trả về nội dung đã biên tập, không thêm chú thích.
`;

// Giữ API cũ để không phải sửa nơi khác.
// Thực tế: dùng localPolish() – logic biên tập đã được viết ở vendor/local.ts
export async function polishVietnamese(raw: string, _opts?: { persona?: 'than-thien' | 'trang-trong' | 'tu-van' }) {
  // Đảm bảo có lời dẫn/bullets/“Lời khuyên” (localPolish lo phần khung)
  return localPolish(String(raw || '').trim());
}
