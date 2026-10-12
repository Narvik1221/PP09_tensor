"use strict";
const crypto = require("node:crypto");
const { transaction, runSQL } = require("./db");
const fs = require("node:fs/promises");
const path = require("node:path");
const TABLES = [
  "categories",
  "clients",
  "tags",
  "inquiry_statuses",
  "admin_users",
  "projects",
  "project_tags",
  "inquiries",
  "site_pages",
  "daily_views",
  "audit_events",
];
async function snapshot(db) {
  return transaction(db, async (tx) => {
    // Единственный согласованный снимок всех таблиц; активные сеансы не копируются.
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = {};
    for (const table of TABLES) {
      const columns = (
        await tx.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='pp09' AND table_name=$1 ORDER BY ordinal_position`,
          [table],
        )
      ).rows.map((x) => x.column_name);
      if (!columns.length) throw new Error("Схема pp09 не инициализирована.");
      const rows = (
        await tx.query(
          `SELECT * FROM pp09.${table} ORDER BY ${columns.includes("id") ? "id" : columns[0]}`,
        )
      ).rows;
      tables[table] = { columns, rows };
    }
    const payload = {
      format: "pp09-json-v1",
      created_at: new Date().toISOString(),
      tables,
    };
    return {
      ...payload,
      sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
    };
  });
}
async function restore(db, data) {
  const { sha256, ...payload } = data;
  if (
    payload.format !== "pp09-json-v1" ||
    sha256 !==
      crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  )
    throw new Error("Неверный формат или контрольная сумма копии.");
  if (
    Object.keys(payload.tables || {}).length !== TABLES.length ||
    !TABLES.every((t) => payload.tables[t])
  )
    throw new Error("Неполный набор таблиц.");
  return transaction(db, async (tx) => {
    await runSQL(tx, "schema.sql");
    for (const table of [...TABLES, "admin_sessions"]) {
      if (
        Number(
          (await tx.query(`SELECT count(*) AS n FROM pp09.${table}`)).rows[0].n,
        ) !== 0
      )
        throw new Error("Восстановление разрешено только в пустую схему pp09.");
    }
    for (const table of TABLES) {
      const { columns, rows } = payload.tables[table];
      const actual = (
        await tx.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='pp09' AND table_name=$1 ORDER BY ordinal_position`,
          [table],
        )
      ).rows.map((x) => x.column_name);
      if (
        JSON.stringify(columns) !== JSON.stringify(actual) ||
        !Array.isArray(rows)
      )
        throw new Error("Структура копии не совпадает с БД.");
      const sql = `INSERT INTO pp09.${table} (${columns.map((c) => '"' + c + '"').join(",")}) VALUES(${columns.map((_, i) => "$" + (i + 1)).join(",")})`;
      for (const row of rows)
        await tx.query(
          sql,
          columns.map((c) =>
            row[c] && typeof row[c] === "object"
              ? JSON.stringify(row[c])
              : row[c],
          ),
        );
      if (columns.includes("id"))
        await tx.query(
          `SELECT setval(pg_get_serial_sequence('pp09.${table}','id'),COALESCE((SELECT max(id) FROM pp09.${table}),1),EXISTS(SELECT 1 FROM pp09.${table}))`,
        );
    }
    return Object.fromEntries(
      TABLES.map((t) => [t, payload.tables[t].rows.length]),
    );
  });
}
module.exports = { TABLES, snapshot, restore };
