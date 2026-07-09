const express = require("express");
const { client } = require("../db");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

function rowToProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    price: row.price,
    volume: row.volume,
    image: row.image,
    images: row.images ? JSON.parse(row.images) : undefined,
    variants: row.variants ? JSON.parse(row.variants) : undefined,
    desc: row.desc,
    isNew: !!row.is_new,
    outOfStock: !!row.out_of_stock,
  };
}

// GET /api/products?category=&search=&maxPrice=&newOnly=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, search, maxPrice, newOnly } = req.query;

    let sql = "SELECT * FROM products WHERE 1=1";
    const args = [];

    if (category && category !== "Все") {
      sql += " AND category = ?";
      args.push(category);
    }
    if (search) {
      sql += " AND (title LIKE ? OR desc LIKE ?)";
      args.push(`%${search}%`, `%${search}%`);
    }
    if (maxPrice) {
      sql += " AND price <= ?";
      args.push(Number(maxPrice));
    }
    if (newOnly === "true" || newOnly === "1") {
      sql += " AND is_new = 1";
    }
    sql += " ORDER BY rowid ASC";

    const result = await client.execute({ sql, args });
    res.json(result.rows.map(rowToProduct));
  })
);

// GET /api/products/categories — список категорий (для вкладок)
router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const result = await client.execute(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY rowid ASC"
    );
    res.json(["Все", ...result.rows.map((r) => r.category)]);
  })
);

// GET /api/products/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await client.execute({ sql: "SELECT * FROM products WHERE id = ?", args: [req.params.id] });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "Товар не найден" });
    res.json(rowToProduct(row));
  })
);

module.exports = router;
