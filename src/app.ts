// const express = require('express');
import express from 'express';
require('dotenv').config();
import webRoutes from 'src/routes/web';
import initDatabase from 'config/seed';
import passport from 'passport';
import configPassportLocal from 'src/middleware/passport.local';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { PrismaClient } from '@prisma/client';
const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
//configure body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//configure static files
app.use(express.static('public'));
// config session
app.use(session({
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // ms
    },
    secret: 'a santa at nasa',
    resave: true,
    saveUninitialized: true,
    store: new PrismaSessionStore(
        new PrismaClient(),
        {
            checkPeriod: 2 * 60 * 1000,  //ms
            dbRecordIdIsSessionId: true,
            dbRecordIdFunction: undefined,
        })

}))
// configure passport
app.use(passport.initialize());
app.use(passport.authenticate('session'));
configPassportLocal();
const PORT = process.env.PORT || 8080;
//configure web routes
webRoutes(app);

// seeding data
initDatabase()

// handle 404 not found
app.use((req, res) => {
    res.send("404 Not Found !");
})
app.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});