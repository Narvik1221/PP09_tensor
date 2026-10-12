"use strict";
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: npm run smoke -- https://your-service.onrender.com");
  process.exit(2);
}
const targets = [
  ["/", 200, "text/html"],
  ["/projects.html", 200, "text/html"],
  ["/career.html", 200, "text/html"],
  ["/contact.html", 200, "text/html"],
  ["/api/projects", 200, "application/json"],
  ["/healthz", 200, "application/json"],
  ["/login", 200, "text/html"],
  ["/api/catalog", 200, "application/json"],
  ["/admin", 303, "text/html"],
];
(async () => {
  for (const [path, status, type] of targets) {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(60000),
      redirect: "manual",
    });
    if (
      response.status !== status ||
      (status !== 303 && !response.headers.get("content-type")?.includes(type))
    ) {
      throw Error(
        `${path}: expected ${status} ${type}, got ${response.status} ${response.headers.get("content-type")}`,
      );
    }
    if (path === "/api/projects") {
      const projects = await response.json();
      if (!Array.isArray(projects) || projects.length < 1)
        throw Error("В базе отсутствуют опубликованные проекты");
    }
    console.log(`OK ${path} ${response.status}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
