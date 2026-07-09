// db/index.js
// Подключение к базе данных через @libsql/client.
//
// Локально (без переменных окружения) работает как обычный файл SQLite —
// удобно для разработки. На Netlify задайте TURSO_DATABASE_URL и
// TURSO_AUTH_TOKEN (из аккаунта Turso, https://turso.tech) — тогда те же
// самые запросы пойдут в облачную базу данных, которая переживает между
// вызовами serverless-функций (в отличие от локального файла).

const path = require("path");
const { createClient } = require("@libsql/client");

const DB_URL = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, "magicherbs.db")}`;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url: DB_URL, authToken: DB_TOKEN });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE,
  title         TEXT NOT NULL,
  category      TEXT,
  price         INTEGER NOT NULL,
  volume        TEXT,
  image         TEXT,
  images        TEXT,
  variants      TEXT,
  desc          TEXT,
  is_new        INTEGER DEFAULT 0,
  out_of_stock  INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_type     TEXT NOT NULL,
  telegram_id   TEXT UNIQUE,
  email         TEXT UNIQUE,
  name          TEXT,
  username      TEXT,
  photo_url     TEXT,
  session_token TEXT UNIQUE,
  created_at    TEXT DEFAULT (datetime('now')),
  last_login_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_label TEXT DEFAULT '',
  qty           INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id, variant_label)
);

CREATE TABLE IF NOT EXISTS favorites (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'new',
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL,
  country        TEXT NOT NULL,
  city           TEXT NOT NULL,
  address        TEXT NOT NULL,
  zip            TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'standard',
  delivery_price INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'ozonpay',
  items_total    INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  variant_label TEXT DEFAULT '',
  price         INTEGER NOT NULL,
  qty           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
`;

// В serverless-окружении функция может "просыпаться" много раз — схему
// нужно применять один раз за "тёплый" процесс, а не при каждом запросе.
// Кэшируем промис инициализации.
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = client.executeMultiple(SCHEMA);
  }
  return readyPromise;
}

module.exports = { client, ready, DB_URL };
