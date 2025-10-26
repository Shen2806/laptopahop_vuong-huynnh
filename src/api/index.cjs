// api/index.cjs
// Express app của bạn PHẢI export default app ở dist/app.js
const appModule = require('../dist/app.js');
const app = appModule.default || appModule;

// Vercel Node Function nhận (req, res). Express app là 1 handler (req, res, next)
module.exports = (req, res) => app(req, res);
