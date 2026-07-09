// scripts/seed.js
// Заполняет таблицу products данными из products.json.
// Работает и с локальным файлом SQLite, и с Turso — в зависимости от того,
// заданы ли TURSO_DATABASE_URL / TURSO_AUTH_TOKEN в .env.
// Запуск: npm run seed

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { client, ready } = require("../db");

async function main() {
  await ready();

  const productsPath = path.join(__dirname, "products.json");
  const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));

  const statements = products.map((p) => ({
    sql: `INSERT INTO products (id, slug, title, category, price, volume, image, images, variants, desc, is_new, out_of_stock)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            slug=excluded.slug, title=excluded.title, category=excluded.category,
            price=excluded.price, volume=excluded.volume, image=excluded.image,
            images=excluded.images, variants=excluded.variants, desc=excluded.desc,
            is_new=excluded.is_new, out_of_stock=excluded.out_of_stock`,
    args: [
      p.id,
      p.slug || null,
      p.title,
      p.category || null,
      p.price,
      p.volume || "",
      p.image || null,
      p.images ? JSON.stringify(p.images) : null,
      p.variants ? JSON.stringify(p.variants) : null,
      p.desc || "",
      p.isNew ? 1 : 0,
      p.outOfStock ? 1 : 0,
    ],
  }));

  await client.batch(statements, "write");
  console.log(`Готово: загружено/обновлено ${products.length} товаров в базу данных.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ошибка при наполнении базы данных:", err);
  process.exit(1);
});
