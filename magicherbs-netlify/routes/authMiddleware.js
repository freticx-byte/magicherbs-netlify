const { client } = require("../db");
const asyncHandler = require("./asyncHandler");

const attachUser = asyncHandler(async (req, res, next) => {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.user = null;
  if (token) {
    const result = await client.execute({ sql: "SELECT * FROM users WHERE session_token = ?", args: [token] });
    if (result.rows[0]) req.user = result.rows[0];
  }
  next();
});

function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Требуется авторизация. Передайте заголовок Authorization: Bearer <token>." });
  }
  next();
}

module.exports = { attachUser, requireUser };
