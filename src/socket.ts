// src/socket.ts
import { Server } from "socket.io";

let io: Server;

export const initSocket = (server: any) => {
    io = new Server(server, {
        cors: {
            origin: ["http://localhost:8080", "http://localhost:3000"],
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        // Admin vào phòng chung
        socket.on("join-admin-room", () => {
            socket.join("admins");
            console.log(`Admin ${socket.id} joined room "admins"`);
        });

        // User vào phòng riêng
        socket.on("join-user-room", (userId: number | string) => {
            if (!userId) return;
            socket.join(`user-${userId}`);
            console.log(`User ${userId} joined room "user-${userId}"`);
        });

        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });
    });
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized. Call initSocket(server) first.");
    return io;
};
