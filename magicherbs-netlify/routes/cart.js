const express = require("express");
const { client } = require("../db");
const { requireUser } = require("./authMiddleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();
router.use(requireUser);

async function getCartWithProducts(userId) {
  const result = await client.execute({
    sql: `SELECT ci.product_id, ci.variant_label, ci.qty,
                 p.title, p.price, p.image, p.volume, p.slug
          FROM cart_items ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
          ORDER BY ci.id ASC`,
    args: [userId],
  });
  return result.rows;
}

// GET /api/cart
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getCartWithProducts(req.user.id));
  })
);

// POST /api/cart  body: { productId, qty, variantLabel? } — qty может быть отрицательным (уменьшение)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { productId, qty, variantLabel = "" } = req.body || {};
    if (!productId || typeof qty !== "number") {
      return res.status(400).json({ error: "Нужны productId и qty (число)" });
    }

    const product = await client.execute({ sql: "SELECT id FROM products WHERE id = ?", args: [productId] });
    if (!product.rows[0]) return res.status(404).json({ error: "Товар не найден" });

    const existingRes = await client.execute({
      sql: "SELECT * FROM cart_items WHERE user_id=? AND product_id=? AND variant_label=?",
      args: [req.user.id, productId, variantLabel],
    });
    const existing = existingRes.rows[0];
    const newQty = (existing ? existing.qty : 0) + qty;

    if (newQty <= 0) {
      if (existing) await client.execute({ sql: "DELETE FROM cart_items WHERE id = ?", args: [existing.id] });
    } else if (existing) {
      await client.execute({
        sql: "UPDATE cart_items SET qty=?, updated_at=datetime('now') WHERE id=?",
        args: [newQty, existing.id],
      });
    } else {
      await client.execute({
        sql: "INSERT INTO cart_items (user_id, product_id, variant_label, qty) VALUES (?,?,?,?)",
        args: [req.user.id, productId, variantLabel, newQty],
      });
    }

    res.json(await getCartWithProducts(req.user.id));
  })
);

// PUT /api/cart  body: { productId, qty, variantLabel? } — устанавливает точное количество
router.put(
  "/",
  asyncHandler(async (req, res) => {
    const { productId, qty, variantLabel = "" } = req.body || {};
    if (!productId || typeof qty !== "number") {
      return res.status(400).json({ error: "Нужны productId и qty (число)" });
    }
    if (qty <= 0) {
      await client.execute({
        sql: "DELETE FROM cart_items WHERE user_id=? AND product_id=? AND variant_label=?",
        args: [req.user.id, productId, variantLabel],
      });
    } else {
      await client.execute({
        sql: `INSERT INTO cart_items (user_id, product_id, variant_label, qty) VALUES (?,?,?,?)
              ON CONFLICT(user_id, product_id, variant_label) DO UPDATE SET qty=excluded.qty, updated_at=datetime('now')`,
        args: [req.user.id, productId, variantLabel, qty],
      });
    }
    res.json(await getCartWithProducts(req.user.id));
  })
);

// DELETE /api/cart/:productId?variantLabel=
router.delete(
  "/:productId",
  asyncHandler(async (req, res) => {
    const variantLabel = req.query.variantLabel || "";
    await client.execute({
      sql: "DELETE FROM cart_items WHERE user_id=? AND product_id=? AND variant_label=?",
      args: [req.user.id, req.params.productId, variantLabel],
    });
    res.json(await getCartWithProducts(req.user.id));
  })
);

// DELETE /api/cart — очистить всю корзину
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await client.execute({ sql: "DELETE FROM cart_items WHERE user_id=?", args: [req.user.id] });
    res.json([]);
  })
);

// PUT /api/cart/bulk  body: { items: { [productId]: qty, ... } }
// Полностью заменяет корзину пользователя — одной атомарной транзакцией (batch).
router.put(
  "/bulk",
  asyncHandler(async (req, res) => {
    const { items } = req.body || {};
    if (!items || typeof items !== "object") {
      return res.status(400).json({ error: "Нужен объект items: { productId: qty }" });
    }

    // Проверяем, какие из переданных id действительно существуют в каталоге
    const ids = Object.keys(items);
    let validIds = new Set();
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const existingRes = await client.execute({
        sql: `SELECT id FROM products WHERE id IN (${placeholders})`,
        args: ids,
      });
      validIds = new Set(existingRes.rows.map((r) => r.id));
    }

    const statements = [{ sql: "DELETE FROM cart_items WHERE user_id=?", args: [req.user.id] }];
    for (const [productId, qty] of Object.entries(items)) {
      const n = Number(qty);
      if (!n || n <= 0 || !validIds.has(productId)) continue;
      statements.push({
        sql: "INSERT INTO cart_items (user_id, product_id, variant_label, qty) VALUES (?,?,?,?)",
        args: [req.user.id, productId, "", n],
      });
    }

    await client.batch(statements, "write");
    res.json(await getCartWithProducts(req.user.id));
  })
);

module.exports = router;
