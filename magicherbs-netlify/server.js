// server.js — запуск для локальной разработки: npm run dev
// На Netlify этот файл не используется — там работает netlify/functions/api.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const app = require("./app");

const PORT = process.env.PORT || 3000;

// Отдаём фронтенд из public/ (на Netlify это делает сам Netlify как статику)
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`MagicHerbs backend (локальная разработка): http://localhost:${PORT}`);
  if (!process.env.TURSO_DATABASE_URL) {
    console.log("TURSO_DATABASE_URL не задан — используется локальный файл db/magicherbs.db");
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log("ВНИМАНИЕ: TELEGRAM_BOT_TOKEN не задан — проверка Telegram initData отключена (dev-режим).");
  }
});
