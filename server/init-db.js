"use strict";
const { Pool } = require("pg");
const { initialize } = require("./db");
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("Не задана DATABASE_URL_DIRECT или DATABASE_URL");
  process.exit(1);
}
const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 30000,
  max: 1,
});
(async () => {
  try {
    await initialize(pool, {
      username: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASSWORD,
      displayName: process.env.ADMIN_DISPLAY_NAME || "Администратор",
    });
    console.log(
      "Готово: схема pp09, 12 таблиц, демонстрационные данные и учетная запись администратора.",
    );
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("Инициализация не выполнена:", e.message);
  process.exitCode = 1;
});
