"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
async function verifyPassword(password, encoded) {
  const [algorithm, salt, digest] = String(encoded).split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(digest || "")
  )
    return false;
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(digest, "hex"));
}
async function transaction(db, work) {
  if (typeof db.transaction === "function") return db.transaction(work);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
async function runSQL(db, filename) {
  const sql = await fs.readFile(path.join(__dirname, filename), "utf8");
  return typeof db.exec === "function" ? db.exec(sql) : db.query(sql);
}
async function initialize(
  db,
  { username, password, displayName = "Администратор", seed = true },
) {
  if (
    !/^[A-Za-z0-9_.-]{3,50}$/.test(username || "") ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 200
  )
    throw new Error(
      "ADMIN_USER: 3–50 букв/цифр; ADMIN_PASSWORD: 12–200 символов.",
    );
  await transaction(db, async (client) => {
    await runSQL(client, "schema.sql");
    const empty =
      Number(
        (await client.query("SELECT count(*) AS n FROM pp09.categories"))
          .rows[0].n,
      ) === 0;
    if (seed && empty) await runSQL(client, "seed.sql");
    const hash = await hashPassword(password);
    await client.query(
      `INSERT INTO pp09.admin_users(username,password_hash,display_name) VALUES($1,$2,$3)
   ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,display_name=EXCLUDED.display_name,is_active=TRUE`,
      [username, hash, displayName],
    );
    await client.query(
      "DELETE FROM pp09.admin_sessions WHERE expires_at < now()",
    );
  });
}
module.exports = {
  initialize,
  transaction,
  hashPassword,
  verifyPassword,
  runSQL,
};
