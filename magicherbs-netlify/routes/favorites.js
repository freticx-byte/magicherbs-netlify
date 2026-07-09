const express = require("express");
const { client } = require("../db");
const { requireUser } = require("./authMiddleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();
router.use(requireUser);

async function getFavoritesWithProducts(userId) {
  const result = await client.execute({
    sql: `SELECT p.* FROM favorites f
          JOIN products p ON p.id = f.product_id
          WHERE f.user_id = ?
          ORDER BY f.id DESC`,
    args: [userId],
  });
  return result.rows;
}

// GET /api/favorites
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getFavoritesWithProducts(req.user.id));
  })
);

// POST /api/favorites  body: { productId }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ error: "Нужен productId" });
    const product = await client.execute({ sql: "SELECT id FROM products WHERE id = ?", args: [productId] });
    if (!product.rows[0]) return res.status(404).json({ error: "Товар не найден" });

    await client.execute({
      sql: "INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)",
      args: [req.user.id, productId],
    });
    res.json(await getFavoritesWithProducts(req.user.id));
  })
);

// DELETE /api/favorites/:productId
router.delete(
  "/:productId",
  asyncHandler(async (req, res) => {
    await client.execute({
      sql: "DELETE FROM favorites WHERE user_id=? AND product_id=?",
      args: [req.user.id, req.params.productId],
    });
    res.json(await getFavoritesWithProducts(req.user.id));
  })
);

// PUT /api/favorites/bulk  body: { productIds: [id1, id2, ...] }
router.put(
  "/bulk",
  asyncHandler(async (req, res) => {
    const { productIds } = req.body || {};
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: "Нужен массив productIds" });
    }

    let validIds = new Set();
    if (productIds.length) {
      const placeholders = productIds.map(() => "?").join(",");
      const existingRes = await client.execute({
        sql: `SELECT id FROM products WHERE id IN (${placeholders})`,
        args: productIds,
      });
      validIds = new Set(existingRes.rows.map((r) => r.id));
    }

    const statements = [{ sql: "DELETE FROM favorites WHERE user_id=?", args: [req.user.id] }];
    for (const productId of productIds) {
      if (!validIds.has(productId)) continue;
      statements.push({
        sql: "INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)",
        args: [req.user.id, productId],
      });
    }

    await client.batch(statements, "write");
    res.json(await getFavoritesWithProducts(req.user.id));
  })
);

module.exports = router;
