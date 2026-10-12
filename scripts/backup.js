"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const { snapshot } = require("../server/backup");
(async () => {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) throw new Error("Не задан DATABASE_URL_DIRECT.");
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 30000,
  });
  try {
    const copy = await snapshot(pool);
    const target = path.resolve(
      process.argv[2] || `backups/pp09-${Date.now()}.json`,
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(copy, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    console.log("Резервная копия:", target);
    console.table(
      Object.fromEntries(
        Object.entries(copy.tables).map(([t, v]) => [t, v.rows.length]),
      ),
    );
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("Копирование не выполнено:", e.message);
  process.exitCode = 1;
});
