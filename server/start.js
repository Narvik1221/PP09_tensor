"use strict";
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
  console.error("Set ADMIN_USER and ADMIN_PASSWORD");
  process.exit(1);
}
const { Pool } = require("pg");
const { createApp } = require("./app");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});
const port = Number(process.env.PORT || 3000);
const server = createApp(pool);
server.listen(port, "0.0.0.0", () =>
  console.log(`Server listening on ${port}`),
);
process.on("SIGTERM", () => server.close(() => pool.end()));
