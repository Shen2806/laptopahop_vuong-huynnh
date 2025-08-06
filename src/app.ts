// const express = require('express');
import express from 'express';
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 8080;
app.get("/", (req, res) => {
    res.send("Hello Minh Vuong - nodemon");

});

app.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});