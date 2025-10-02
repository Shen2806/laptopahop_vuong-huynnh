// src/cron.ts
import cron from "node-cron";
import { cleanupExpiredMemories } from "services/ai/cleanup";

export function startCron() {
    // 30 phút chạy 1 lần
    cron.schedule("*/30 * * * *", async () => {
        try { await cleanupExpiredMemories(); } catch { }
    });
}
