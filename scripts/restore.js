"use strict";
const fs = require("node:fs/promises");
const { Pool } = require("pg");
const { restore } = require("../server/backup");
(async () => {
  const target = process.env.RESTORE_DATABASE_URL_DIRECT;
  if (!target || !process.argv[2])
    throw new Error(
      "Задайте RESTORE_DATABASE_URL_DIRECT отдельной пустой БД и путь к копии.",
    );
  if (
    target === process.env.DATABASE_URL_DIRECT ||
    target === process.env.DATABASE_URL
  )
    throw new Error("БД назначения должна отличаться от рабочей БД.");
  const data = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  const pool = new Pool({
    connectionString: target,
    max: 1,
    connectionTimeoutMillis: 30000,
  });
  try {
    console.table(await restore(pool, data));
    console.log("Восстановление завершено. Активные сеансы не восстановлены.");
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("Восстановление не выполнено:", e.message);
  process.exitCode = 1;
});
