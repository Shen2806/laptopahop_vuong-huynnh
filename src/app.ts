/// <reference path="./types/index.d.ts" />
import "dotenv/config";
import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";
import passport from "passport";
import { PrismaClient } from "@prisma/client";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";

import webRoutes from "./routes/web";
import apiRoutes from "./routes/api";
import paymentRoutes from "./routes/payment";
import aiRoutes from "./routes/ai";
import aiAdmin from "./routes/ai.admin.router";
import aiTeach from "./routes/ai.teach.router";
import locationRoutes from "./routes/location.routes";

import configPassportLocal from "./middleware/passport.local";
import { headerCartCount } from "./middleware/headerCartCount";
import initDatabase from "config/seed";
import { initSocket } from "./socket";
import "./middleware/passport.google";
import "./middleware/passport.jwt";
import uploadRouter from "./routes/upload";

const app = express();
app.set("trust proxy", 1);

// CORS (cho cấu hình qua env, fallback dev)
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:8080";
app.use(cors({ origin: ORIGIN, credentials: true }));

// Parsers
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Static & Views: dùng ROOT để bền vững khi chạy dist/
const ROOT = process.cwd();
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(path.join(ROOT, "uploads")));

app.set("view engine", "ejs");
const viewsSrc = path.join(ROOT, "src", "views");
const viewsDist = path.join(__dirname, "views");
app.set("views", fs.existsSync(viewsSrc) ? viewsSrc : viewsDist);

// Session
app.use(session({
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    secret: process.env.SESSION_SECRET || "a santa at nasa",
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(
        new PrismaClient(),
        { checkPeriod: 24 * 60 * 60 * 1000, dbRecordIdIsSessionId: true }
    )
}));

// Passport
app.use(passport.initialize());
app.use(passport.authenticate("session"));
configPassportLocal();

// Expose user cho view
app.use((req, res, next) => {
    res.locals.user = (req as any).user || null;
    next();
});
app.use(headerCartCount);

// Health check cho Render
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Routes
webRoutes(app);
apiRoutes(app);
app.use("/api", aiRoutes);
app.use("/api", aiAdmin);
app.use("/api", aiTeach);
app.use(locationRoutes);
app.use("/api/upload", uploadRouter);

// Seed DB (giữ nguyên hành vi cũ)
initDatabase();
if (process.env.SEED_ON_BOOT === "true") {
    initDatabase().catch(err => console.error("Seed failed:", err));
}

// 404
app.use((_req, res) => {
    res.render("status/404.ejs");
});

const PORT = Number(process.env.PORT || 10000);
const server = http.createServer(app);
initSocket(server);

// Bind đúng host/port
server.listen(PORT, "0.0.0.0", () => {
    console.log(`My app is running on port: ${PORT}`);
});

// Tránh timeout theo khuyến nghị Render
// @ts-ignore
server.keepAliveTimeout = 120000;
// @ts-ignore
server.headersTimeout = 121000;

module.exports = (req, res) => app(req, res);