// src/socket.ts
import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { prisma } from "config/client";

let io: Server | null = null;

export const initSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: ["http://localhost:8080", "http://localhost:3000"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        // ===== ROOMS =====
        socket.on("join-admin-room", () => socket.join("admins"));
        socket.on("join-user-room", (userId: number | string) => {
            if (userId) socket.join(`user-${userId}`);
        });

        // ===== CREATE SESSION =====
        socket.on("chat:create_session", async (payload, cb) => {
            const { name, gender = "OTHER", productId = null, userId = null } = payload || {};
            const session = await prisma.chatSession.create({
                data: { name, gender, productId, userId },
            });
            socket.join(`chat_${session.id}`);

            // thông báo admin có phiên mới (unread = 0)
            io!.to("admins").emit("admin:new_session", { ...session, unread: 0 });

            cb?.(session);
        });

        // ===== REJOIN SESSION (user đã có sessionId trong localStorage) =====
        socket.on("chat:join", async ({ sessionId }) => {
            if (!sessionId) return;
            socket.join(`chat_${sessionId}`);
            const sess = await prisma.chatSession.findUnique({
                where: { id: Number(sessionId) },
                select: { status: true },
            });
            socket.emit("chat:status", { sessionId, status: sess?.status || "OPEN" });
        });

        // ===== ADMIN JOIN PHÒNG =====
        socket.on("admin:join", async ({ sessionId }) => {
            if (!sessionId) return;
            socket.join(`chat_${sessionId}`);
            const sess = await prisma.chatSession.findUnique({
                where: { id: Number(sessionId) },
                select: { status: true },
            });
            socket.emit("chat:status", { sessionId, status: sess?.status || "OPEN" });
        });

        // ===== SEND MESSAGE =====
        socket.on("chat:message", async ({ sessionId, sender, content }) => {
            if (!sessionId || !content) return;

            const sidNum = Number(sessionId);
            const sess = await prisma.chatSession.findUnique({
                where: { id: sidNum },
                select: { status: true, userId: true },
            });

            // ⛔ chặn nhắn khi CLOSED
            if (!sess || sess.status === "CLOSED") {
                socket.emit("chat:closed", { sessionId });
                return;
            }

            // lưu tin nhắn
            const saved = await prisma.chatMessage.create({
                data: { sessionId: sidNum, sender, content, isRead: false },
            });

            // phát cho cả phòng
            const payload = {
                id: saved.id,
                sessionId: sidNum,
                sender: saved.sender,
                content: saved.content,
                isRead: saved.isRead,
                createdAt: saved.createdAt,
            };
            io!.to(`chat_${sidNum}`).emit("chat:message", payload);

            // ====== (1) USER nhắn → tăng unread cho ADMIN + thông báo chuông ======
            if (sender === "USER") {
                // thông báo chuông + preview
                io!.to("admins").emit("notify:chat_message", {
                    sessionId: sidNum,
                    preview: content.slice(0, 80),
                    at: new Date().toISOString(),
                });

                // >>> CẬP NHẬT SỐ UNREAD CHO PHIÊN (USER → ADMIN)
                const unread = await prisma.chatMessage.count({
                    where: { sessionId: sidNum, sender: "USER", isRead: false },
                });
                io!.to("admins").emit("admin:session_unread", { sessionId: sidNum, unread });
            }

            // ADMIN nhắn → báo về user-room để hiện badge/âm thanh mini (nếu cần)
            if (sender === "ADMIN" && sess.userId) {
                io!.to(`user-${sess.userId}`).emit("chat-incoming", {
                    sessionId: sidNum,
                    preview: content.slice(0, 80),
                    at: new Date().toISOString(),
                });
            }
        });

        // ===== READ (✓/✓✓) =====
        socket.on("chat:read", async ({ sessionId, readerRole }) => {
            if (!sessionId || !readerRole) return;
            const sidNum = Number(sessionId);

            const updated = await prisma.chatMessage.updateMany({
                where: {
                    sessionId: sidNum,
                    sender: readerRole === "ADMIN" ? "USER" : "ADMIN",
                    isRead: false,
                },
                data: { isRead: true },
            });

            if (updated.count > 0) {
                io!.to(`chat_${sidNum}`).emit("chat:read", { sessionId: sidNum, readerRole });
            }

            // ====== (2) ADMIN đọc → reset unread về 0 cho phiên đó ======
            if (readerRole === "ADMIN") {
                const unread = await prisma.chatMessage.count({
                    where: { sessionId: sidNum, sender: "USER", isRead: false },
                });
                io!.to("admins").emit("admin:session_unread", { sessionId: sidNum, unread });
            }
        });

        // ===== TYPING =====
        socket.on("chat:typing", ({ sessionId, who, isTyping }) => {
            socket.to(`chat_${sessionId}`).emit("chat:typing", { who, isTyping });
        });

        // ===== CLOSE SESSION =====
        socket.on("chat:close", async ({ sessionId }) => {
            const sidNum = Number(sessionId);
            await prisma.chatSession.update({
                where: { id: sidNum },
                data: { status: "CLOSED" },
            });
            io!.to(`chat_${sidNum}`).emit("chat:closed");
        });

        // ===== DEBUG =====
        socket.on("debug:ping", (msg, cb) => cb?.({ ok: true, got: msg, sid: socket.id }));
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized. Call initSocket(server) first.");
    return io;
};
