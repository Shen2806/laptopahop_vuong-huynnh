/// <reference path="./types/index.d.ts" />
import express from 'express';
import 'dotenv/config'; // phải đứng trước mọi import khác
import webRoutes from 'src/routes/web';
import initDatabase from 'config/seed';
import passport from 'passport';
import configPassportLocal from 'src/middleware/passport.local';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { PrismaClient } from '@prisma/client';
import apiRoutes from './routes/api';
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { initSocket } from "./socket";
import "./middleware/passport.google";
import "./middleware/passport.jwt";
import path from "path";
import paymentRoutes from './routes/payment';
const app = express();
app.use(cookieParser());

// config cors
app.use(cors({
    origin: "http://localhost:8080", // hoặc domain frontend
    credentials: true
}))

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
//configure body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//configure static files
app.use(express.static('public'));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
// config session
app.use(session({
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // ms
    },
    secret: 'a santa at nasa',
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(
        new PrismaClient(),
        {
            checkPeriod: 1 * 24 * 60 * 60 * 1000,  //ms
            dbRecordIdIsSessionId: true,
            dbRecordIdFunction: undefined,
        })

}))
// configure passport
app.use(passport.initialize());
app.use(passport.authenticate('session'));
configPassportLocal();
// config global user
app.use((req, res, next) => {
    res.locals.user = req.user || null; // Pass user object to all views
    next();
});

const PORT = process.env.PORT || 8080;
//configure web routes
webRoutes(app);

// api routes
apiRoutes(app);

// payment routes (VNPAY return/IPN)
app.use('/payment', paymentRoutes);
// seeding data
initDatabase()


// handle 404 not found
app.use((req, res) => {
    res.render("status/404.ejs");
})
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});

