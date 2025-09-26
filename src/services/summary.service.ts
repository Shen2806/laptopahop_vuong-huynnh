import OpenAI from "openai";
import { prisma } from "config/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function rollupSummary(sessionId: number, maxTokens = 900) {
    const msgs = await prisma.aiChatMessage.findMany({
        where: { sessionId },
        orderBy: { id: "asc" },
        take: 20
    });
    const joined = msgs.map(m => `${m.role}: ${m.content}`).join("\n");

    const sys = {
        role: "system" as const, content:
            `Tóm tắt đa lượt súc tích, giữ nguyên ý định & các ràng buộc quan trọng. <= ${Math.floor(maxTokens / 2)} tokens.`
    };
    const usr = { role: "user" as const, content: joined.slice(0, 6000) };

    const out = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [sys, usr],
        temperature: 0.2
    });

    const summary = out.choices[0].message.content?.trim() || "";
    await prisma.aiChatSession.update({ where: { id: sessionId }, data: { summary } });
    return summary;
}
