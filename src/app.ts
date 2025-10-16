/// <reference path="./types/index.d.ts" />
import "dotenv/config";
import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import http from "http";
import passport from "passport";
import { PrismaClient } from "@prisma/client";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";

import webRoutes from "src/routes/web";
import apiRoutes from "./routes/api";
import paymentRoutes from "./routes/payment";
import aiRoutes from "./routes/ai";                // POST /api/ai/chat
import aiAdmin from "./routes/ai.admin.router";    // /api/ai/admin/*
import aiTeach from "./routes/ai.teach.router";    // /api/ai/admin/teach
import aiWebLLMRouter from "./routes/ai.webllm.router"; // nếu có endpoint phụ cho WebLLM
import locationRoutes from "./routes/location.routes";

import configPassportLocal from "src/middleware/passport.local";
import { headerCartCount } from "./middleware/headerCartCount";
import initDatabase from "config/seed";
import { initSocket } from "./socket";
import "./middleware/passport.google";
import "./middleware/passport.jwt";

const app = express();

// Nếu chạy sau proxy (Heroku/NGINX) thì bật:
app.set("trust proxy", 1);

// CORS
app.use(cors({
    origin: "http://localhost:8080",
    credentials: true
}));

// Parsers
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Static & Views
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session
app.use(session({
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 ngày
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

// Web pages
webRoutes(app);

// API chính (giỏ hàng, thanh toán nhanh…)
apiRoutes(app);

// ==== AI routers ====
// Server LLM
app.use("/api", aiRoutes);       // POST /api/ai/chat
// Admin ops
app.use("/api", aiAdmin);        // /api/ai/admin/*
app.use("/api", aiTeach);        // /api/ai/admin/teach
// (Tuỳ chọn) WebLLM endpoints nếu có -> gom về /ai/*
app.use("/ai", aiWebLLMRouter);  // VD: GET /ai/webllm/*

// Payment callbacks
app.use("/payment", paymentRoutes);

// Địa lý
app.use(locationRoutes);

// Seed DB (nếu cần)
initDatabase();

// 404
app.use((_req, res) => {
    res.render("status/404.ejs");
});

const PORT = Number(process.env.PORT || 8080);
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});
