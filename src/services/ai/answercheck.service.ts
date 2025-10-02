// src/services/ai/answercheck.service.ts
import OpenAI from "openai";
import 'dotenv/config';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHECK_PROMPT = `
Bạn là bộ kiểm tra câu trả lời.
- Câu trả lời có trả lời trực tiếp câu hỏi không?
- Có dùng đúng ngữ cảnh (context) đính kèm không?
- Nếu thiếu thông tin, hãy đề nghị cách hỏi lại ngắn gọn.
Trả JSON: { pass: boolean, revised?: string }.
`;

export async function answerCheck(question: string, context: string, answer: string) {
    const sys = { role: "system" as const, content: CHECK_PROMPT };
    const usr = { role: "user" as const, content: JSON.stringify({ question, context, answer }) };

    const out = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [sys, usr],
        temperature: 0,
        response_format: { type: "json_object" }
    });

    try {
        return JSON.parse(out.choices[0].message.content || "{}");
    } catch {
        return { pass: true };
    }
}
