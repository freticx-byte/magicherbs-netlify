// netlify/functions/api.js
// Оборачивает общий Express-app (../../app.js) в Netlify Function.
//
// netlify.toml делает редирект  /api/*  ->  /.netlify/functions/api/:splat
// Поэтому сюда прилетает путь вида /.netlify/functions/api/products —
// basePath ниже отрезает "/.netlify/functions", и Express видит "/api/products",
// как и раньше (маршруты в app.js остаются без изменений).
const serverless = require("serverless-http");
const app = require("../../app");

exports.handler = serverless(app, { basePath: "/.netlify/functions" });
