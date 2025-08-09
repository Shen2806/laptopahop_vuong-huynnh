// const express = require('express');
import express from 'express';
require('dotenv').config();
import webRoutes from './routes/web';

const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
//configure body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//configure static files
app.use(express.static('public'));
const PORT = process.env.PORT || 8080;
//configure web routes
webRoutes(app);


app.listen(PORT, () => {
    console.log(`My app is running on port : ${PORT}`);
});