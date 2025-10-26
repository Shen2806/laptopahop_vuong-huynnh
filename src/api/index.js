// api/index.js  (CommonJS)
const appModule = require('../dist/app.js');
const app = appModule.default || appModule;

// Vercel Node Function: nhận (req, res)
module.exports = (req, res) => app(req, res);
