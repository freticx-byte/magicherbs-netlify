const express = require("express");
const crypto = require("crypto");
const { client } = require("../db");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

function genToken() {
  return crypto.randomBytes(24).toString("hex");
}

function userToJson(u) {
  return {
    id: u.id,
    type: u.auth_type,
    name: u.name,
    sub: u.auth_type === "telegram" ? (u.username ? "@" + u.username : "Telegram ID " + u.telegram_id) : u.email,
    photo: u.photo_url || "",
    token: u.session_token,
  };
}

/**
 * Проверка подлинности Telegram.WebApp.initData (HMAC), см.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Требует переменную окружения TELEGRAM_BOT_TOKEN.
 */
function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return computedHash === hash;
}

// POST /api/auth/telegram   body: { initData } или { user } (dev-режим)
router.post(
  "/telegram",
  asyncHandler(async (req, res) => {
    const { initData, user: fallbackUser } = req.body || {};
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    let tgUser = null;

    if (initData) {
      if (botToken) {
        const valid = verifyTelegramInitData(initData, botToken);
        if (!valid) {
          return res.status(401).json({ error: "Данные Telegram не прошли проверку подлинности (неверный hash)." });
        }
      }
      const params = new URLSearchParams(initData);
      const userJson = params.get("user");
      if (userJson) {
        try {
          tgUser = JSON.parse(userJson);
        } catch (e) {
          tgUser = null;
        }
      }
    } else if (fallbackUser) {
      tgUser = fallbackUser;
    }

    if (!tgUser || !tgUser.id) {
      return res.status(400).json({ error: "Не удалось получить данные пользователя Telegram." });
    }

    const telegramId = String(tgUser.id);
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Пользователь Telegram";
    const username = tgUser.username || null;
    const photoUrl = tgUser.photo_url || "";
    const token = genToken();

    const existing = await client.execute({ sql: "SELECT * FROM users WHERE telegram_id = ?", args: [telegramId] });

    let userId;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await client.execute({
        sql: "UPDATE users SET name=?, username=?, photo_url=?, session_token=?, last_login_at=datetime('now') WHERE id=?",
        args: [name, username, photoUrl, token, userId],
      });
    } else {
      const info = await client.execute({
        sql: "INSERT INTO users (auth_type, telegram_id, name, username, photo_url, session_token) VALUES ('telegram', ?, ?, ?, ?, ?)",
        args: [telegramId, name, username, photoUrl, token],
      });
      userId = Number(info.lastInsertRowid);
    }

    const userRes = await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [userId] });
    res.json(userToJson(userRes.rows[0]));
  })
);

// POST /api/auth/email  (демо-вход без реальной отправки кода)
router.post(
  "/email",
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
    if (!emailOk) return res.status(400).json({ error: "Введите корректный e-mail" });

    const token = genToken();
    const name = email.split("@")[0];

    const existing = await client.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });

    let userId;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await client.execute({
        sql: "UPDATE users SET name=?, session_token=?, last_login_at=datetime('now') WHERE id=?",
        args: [name, token, userId],
      });
    } else {
      const info = await client.execute({
        sql: "INSERT INTO users (auth_type, email, name, session_token) VALUES ('email', ?, ?, ?)",
        args: [email, name, token],
      });
      userId = Number(info.lastInsertRowid);
    }

    const userRes = await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [userId] });
    res.json(userToJson(userRes.rows[0]));
  })
);

// POST /api/auth/logout
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
      await client.execute({ sql: "UPDATE users SET session_token = NULL WHERE session_token = ?", args: [token] });
    }
    res.json({ ok: true });
  })
);

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Не авторизован" });
  res.json(userToJson(req.user));
});

module.exports = router;
