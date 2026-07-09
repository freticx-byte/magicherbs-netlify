const express = require("express");
const { client } = require("../db");
const { requireUser } = require("./authMiddleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();
router.use(requireUser);

const REQUIRED_FIELDS = ["name", "phone", "email", "country", "city", "address", "zip"];

// POST /api/orders
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const missing = REQUIRED_FIELDS.filter((f) => !String(body[f] || "").trim());
    if (missing.length) {
      return res.status(400).json({ error: "Заполните все обязательные поля", missing });
    }

    const cartRes = await client.execute({
      sql: `SELECT ci.product_id, ci.variant_label, ci.qty, p.title, p.price
            FROM cart_items ci JOIN products p ON p.id = ci.product_id
            WHERE ci.user_id = ?`,
      args: [req.user.id],
    });
    const cartItems = cartRes.rows;

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    const deliveryMethod = body.delivery || "standard";
    const deliveryPrice = Number(body.deliveryPrice) || 0;
    const paymentMethod = body.payment || "ozonpay";

    const itemsTotal = cartItems.reduce((sum, it) => sum + it.price * it.qty, 0);
    const total = itemsTotal + deliveryPrice;

    // Шаг 1: создаём заказ, чтобы получить его id
    const orderInsert = await client.execute({
      sql: `INSERT INTO orders (user_id, status, name, phone, email, country, city, address, zip,
                                 delivery_method, delivery_price, payment_method, items_total, total)
            VALUES (?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        req.user.id,
        body.name.trim(),
        body.phone.trim(),
        body.email.trim(),
        body.country.trim(),
        body.city.trim(),
        body.address.trim(),
        body.zip.trim(),
        deliveryMethod,
        deliveryPrice,
        paymentMethod,
        itemsTotal,
        total,
      ],
    });
    const orderId = Number(orderInsert.lastInsertRowid);

    // Шаг 2: одной атомарной операцией — позиции заказа + очистка корзины
    const statements = cartItems.map((it) => ({
      sql: "INSERT INTO order_items (order_id, product_id, title, variant_label, price, qty) VALUES (?,?,?,?,?,?)",
      args: [orderId, it.product_id, it.title, it.variant_label, it.price, it.qty],
    }));
    statements.push({ sql: "DELETE FROM cart_items WHERE user_id = ?", args: [req.user.id] });
    await client.batch(statements, "write");

    const orderRes = await client.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
    const itemsRes = await client.execute({ sql: "SELECT * FROM order_items WHERE order_id = ?", args: [orderId] });

    res.status(201).json({ ...orderRes.rows[0], items: itemsRes.rows });
  })
);

// GET /api/orders — список заказов текущего пользователя
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const ordersRes = await client.execute({
      sql: "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.user.id],
    });
    const orders = ordersRes.rows;
    const result = [];
    for (const o of orders) {
      const itemsRes = await client.execute({ sql: "SELECT * FROM order_items WHERE order_id = ?", args: [o.id] });
      result.push({ ...o, items: itemsRes.rows });
    }
    res.json(result);
  })
);

// GET /api/orders/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const orderRes = await client.execute({
      sql: "SELECT * FROM orders WHERE id = ? AND user_id = ?",
      args: [req.params.id, req.user.id],
    });
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    const itemsRes = await client.execute({ sql: "SELECT * FROM order_items WHERE order_id = ?", args: [order.id] });
    res.json({ ...order, items: itemsRes.rows });
  })
);

module.exports = router;
