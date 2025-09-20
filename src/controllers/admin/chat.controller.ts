// controllers/admin/chat.controller.ts
import { prisma } from "config/client";
import { Request, Response } from "express";

/**
 * Trả danh sách phiên kèm:
 * - unread: số tin từ USER chưa đọc
 * - lastMsg / lastAt: tin nhắn cuối (nếu có), dùng để sort
 * - status: OPEN/CLOSED
 */
export const getAdminChatSessions = async (req: Request, res: Response) => {
    // Lấy tất cả phiên (không cần updatedAt)
    const sessions = await prisma.chatSession.findMany({
        select: { id: true, name: true, status: true, createdAt: true },
    });

    // Lấy dữ liệu phụ cho từng phiên
    const enriched = await Promise.all(
        sessions.map(async (s) => {
            const [unread, last] = await Promise.all([
                prisma.chatMessage.count({
                    where: { sessionId: s.id, sender: "USER", isRead: false },
                }),
                prisma.chatMessage.findFirst({
                    where: { sessionId: s.id },
                    orderBy: { id: "desc" }, // dùng id mới nhất (ổn định), hoặc { createdAt: "desc" } nếu có
                    select: { content: true, createdAt: true, sender: true, id: true },
                }),
            ]);

            const lastAt = last?.createdAt ?? s.createdAt;

            return {
                id: s.id,
                name: s.name,
                status: s.status,              // "OPEN" | "CLOSED"
                unread,                        // số tin chưa đọc từ USER
                lastMsg: last?.content ?? "",
                lastAt,                        // dùng để sort phía server
            };
        })
    );

    // Sort theo thời điểm mới nhất (tin cuối cùng của phiên)
    enriched.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));

    res.json(enriched);
};

export const getChatMessages = async (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ error: "Invalid session id" });
    }
    const msgs = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { id: "asc" }, // hoặc { createdAt: "asc" } nếu có
    });
    res.json(msgs);
};
