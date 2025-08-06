// const express = require('express');
import express from 'express';
require('dotenv').config();
import webRoutes from './routes/web';
const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
//configure web routes
webRoutes(app);

const PORT = process.env.PORT || 8080;


app.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});