// app.js
// Общий Express-app: используется и для локального запуска (server.js),
// и внутри Netlify Function (netlify/functions/api.js) через serverless-http.
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { ready, DB_URL } = require("./db");
const { attachUser } = require("./routes/authMiddleware");
const asyncHandler = require("./routes/asyncHandler");

const productsRouter = require("./routes/products");
const authRouter = require("./routes/auth");
const cartRouter = require("./routes/cart");
const favoritesRouter = require("./routes/favorites");
const ordersRouter = require("./routes/orders");

const app = express();

app.use(cors());
app.use(express.json());

// Гарантируем, что схема БД создана прежде, чем обрабатывать любой запрос.
// Промис кэшируется в db/index.js, поэтому реально выполняется один раз за
// "тёплый" процесс/функцию, а не при каждом запросе.
app.use(
  asyncHandler(async (req, res, next) => {
    await ready();
    next();
  })
);

app.use(attachUser);

app.use("/api/products", productsRouter);
app.use("/api/auth", authRouter);
app.use("/api/cart", cartRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/orders", ordersRouter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: DB_URL.startsWith("file:") ? "local sqlite file" : "turso (remote)" });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

module.exports = app;
