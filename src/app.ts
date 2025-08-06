// const express = require('express');
import express from 'express';
require('dotenv').config();
const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
const PORT = process.env.PORT || 8080;
app.get("/", (req, res) => {
    res.render("home.ejs")
});

app.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});