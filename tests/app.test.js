"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { initialize, verifyPassword } = require("../server/db");
const { createApp } = require("../server/app");
const { snapshot, restore, TABLES } = require("../server/backup");
const db = new PGlite();
let server, base, cookie, csrf;
const password = "practice-test-password-2026";
async function req(path, options = {}) {
  return fetch(base + path, { redirect: "manual", ...options });
}
async function post(path, body, auth = true) {
  return req(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(body),
  });
}
async function count(table) {
  return Number(
    (await db.query(`SELECT count(*) AS n FROM pp09.${table}`)).rows[0].n,
  );
}
before(async () => {
  await initialize(db, { username: "student", password });
  server = createApp(db, { secureCookies: false });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});

test("TC01: 12 таблиц, 168 записей, повторная инициализация не удваивает данные", async () => {
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM information_schema.tables WHERE table_schema='pp09'",
        )
      ).rows[0].n,
    ),
    12,
  );
  assert.equal(await count("projects"), 24);
  assert.equal(await count("inquiries"), 40);
  assert.equal(await count("project_tags"), 48);
  const before = await Promise.all(TABLES.map(count));
  assert.equal(
    before.reduce((a, b) => a + b, 0),
    168,
  );
  await initialize(db, { username: "student", password });
  assert.deepEqual(await Promise.all(TABLES.map(count)), before);
});
test("TC02: ограничения FK и UNIQUE защищают связи", async () => {
  await assert.rejects(
    db.query(
      "INSERT INTO pp09.projects(slug,title,summary,category_id,client_id) VALUES('bad-fk','Проект','Описание',9999,1)",
    ),
    { code: "23503" },
  );
  await assert.rejects(
    db.query("DELETE FROM pp09.categories WHERE id=1"),
    (e) => ["23503", "23001"].includes(e.code),
  );
  await assert.rejects(
    db.query("INSERT INTO pp09.tags(code,name) VALUES('web','Повтор')"),
    { code: "23505" },
  );
});
test("TC03: публичные страницы, закрытые файлы и заголовки", async () => {
  for (const path of [
    "/",
    "/projects.html",
    "/career.html",
    "/contact.html",
    "/healthz",
  ])
    assert.equal((await req(path)).status, 200);
  const r = await req("/");
  assert.match(
    r.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  for (const path of [
    "/.env",
    "/server/schema.sql",
    "/package.json",
    "/backups/copy.json",
    "/assets/../server/schema.sql",
  ])
    assert.equal((await req(path)).status, 404);
});
test("TC04: фильтры, поиск, порядок, связанные данные", async () => {
  const all = await (await req("/api/projects")).json();
  assert.equal(all.length, 24);
  assert.equal(all[0].tags.length, 2);
  assert.ok(all[0].client_name);
  const logistics = await (
    await req("/api/projects?category=logistics&tag=wms&sort=title")
  ).json();
  assert.equal(logistics.length, 8);
  assert.ok(logistics.every((p) => p.category === "logistics"));
  const q = await (await req("/api/projects?q=ERP")).json();
  assert.ok(q.length > 0);
  assert.ok(
    q.every((p) => (p.title + p.summary).toLowerCase().includes("erp")),
  );
  const client = await (
    await req("/api/projects?client_id=" + all[0].client_id)
  ).json();
  assert.equal(client.length, 3);
  assert.deepEqual(
    await (await req("/api/projects?q=unlikely-no-result-xyz")).json(),
    [],
  );
  assert.equal(
    (await req("/api/projects?sort=title%3BDROP%20TABLE%20projects")).status,
    400,
  );
  assert.deepEqual(
    await (await req("/api/projects?q=%27%20OR%201%3D1--")).json(),
    [],
  );
});
test("TC05: обращение — обязательные поля, сохранение, связь и ограничение повтора", async () => {
  const body = {
    name: "Анна",
    email: "anna@example.test",
    topic: "project",
    channel: "email",
    message: "Требуется обсудить учебный проект",
    privacy: true,
    project_id: 1,
  };
  const send = (b) =>
    req("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
  for (const change of [
    { privacy: false },
    { email: "bad" },
    { name: "A" },
    { message: "short" },
    { project_id: 9999 },
  ])
    assert.equal((await send({ ...body, ...change })).status, 400);
  assert.equal((await send(body)).status, 201);
  assert.equal(await count("inquiries"), 41);
  assert.equal((await send(body)).status, 429);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT project_id FROM pp09.inquiries WHERE email='anna@example.test'",
        )
      ).rows[0].project_id,
    ),
    1,
  );
});
test("TC06: неверный логин и пароль, хеш пароля, корректный вход", async () => {
  for (const fields of [
    { username: "student", password: "wrong" },
    { username: "nobody", password },
  ])
    assert.equal((await post("/login", fields, false)).status, 401);
  const hash = (
    await db.query(
      "SELECT password_hash FROM pp09.admin_users WHERE username='student'",
    )
  ).rows[0].password_hash;
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  const r = await post("/login", { username: "student", password }, false);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/admin");
  const header = r.headers.get("set-cookie");
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  cookie = header.split(";")[0];
  const stored = (await db.query("SELECT token_hash FROM pp09.admin_sessions"))
    .rows[0].token_hash;
  assert.notEqual(stored, cookie.split("=")[1]);
  const page = await req("/admin", { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  csrf = (await page.text()).match(/name="csrf" value="([a-f0-9]+)"/)[1];
});
test("TC07: закрытые разделы и защита CSRF", async () => {
  assert.equal((await req("/admin")).headers.get("location"), "/login");
  assert.equal((await post("/admin/projects", {}, false)).status, 401);
  assert.equal(
    (await post("/admin/projects", { csrf: "0".repeat(64) })).status,
    403,
  );
  assert.equal(
    (await post("/admin/projects", { csrf: "я".repeat(64) })).status,
    403,
  );
  assert.equal(
    (
      await req("/logout", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://other.test",
        },
        body: new URLSearchParams({ csrf }),
      })
    ).status,
    403,
  );
});
test("TC08: добавление проекта с тегами, дубликат, удаление и журнал", async () => {
  const fields = {
    csrf,
    slug: "qa-new-project",
    title: "Проверка проекта",
    summary: "Проверка добавления и удаления",
    category_id: 1,
    client_id: 1,
    image_url: "/assets/img/office-light.webp",
    tags: "1",
  };
  assert.equal((await post("/admin/projects", fields)).status, 303);
  assert.equal(await count("projects"), 25);
  assert.equal((await post("/admin/projects", fields)).status, 409);
  const row = (
    await db.query("SELECT id FROM pp09.projects WHERE slug='qa-new-project'")
  ).rows[0];
  assert.equal(
    (await post(`/admin/projects/${row.id}/delete`, { csrf })).status,
    303,
  );
  assert.equal(await count("projects"), 24);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM pp09.project_tags WHERE project_id=$1",
          [row.id],
        )
      ).rows[0].n,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM pp09.audit_events WHERE action IN ('project.create','project.delete')",
        )
      ).rows[0].n,
    ),
    2,
  );
});
test("TC09: статус обращения, исполнитель и журнал", async () => {
  assert.equal(
    (await post("/admin/inquiries/1/status", { csrf, status_id: 2 })).status,
    303,
  );
  const r = (
    await db.query(
      "SELECT status_id,assigned_to FROM pp09.inquiries WHERE id=1",
    )
  ).rows[0];
  assert.equal(Number(r.status_id), 2);
  assert.equal(Number(r.assigned_to), 1);
  assert.equal(
    (await req("/admin/inquiries", { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal(
    (await req("/admin/audit", { headers: { Cookie: cookie } })).status,
    200,
  );
});
test("TC10: статистика учитывает HTML GET; HEAD и ресурсы счётчик не увеличивают", async () => {
  const sum = async () =>
    Number(
      (
        await db.query(
          "SELECT sum(views) n FROM pp09.daily_views WHERE is_demo=FALSE",
        )
      ).rows[0].n || 0,
    );
  const n = await sum();
  await req("/projects.html");
  await req("/projects.html", { method: "HEAD" });
  await req("/assets/js/main.js");
  assert.equal(await sum(), n + 1);
  assert.equal(
    (await req("/admin/stats", { headers: { Cookie: cookie } })).status,
    200,
  );
});
test("TC11: резервная копия и восстановление в пустую БД сохраняют все записи и связи", async () => {
  const copy = await snapshot(db),
    other = new PGlite();
  try {
    const restored = await restore(other, JSON.parse(JSON.stringify(copy)));
    for (const table of TABLES)
      assert.equal(restored[table], await count(table));
    const connected = await other.query(
      "SELECT p.title,c.name,cl.name client FROM pp09.projects p JOIN pp09.categories c ON c.id=p.category_id JOIN pp09.clients cl ON cl.id=p.client_id",
    );
    assert.equal(connected.rows.length, 24);
    assert.equal(
      Number(
        (await other.query("SELECT count(*) n FROM pp09.admin_sessions"))
          .rows[0].n,
      ),
      0,
    );
    await assert.rejects(restore(other, copy), /пустую/);
    await assert.rejects(
      restore(other, { ...copy, sha256: "bad" }),
      /контрольная/,
    );
  } finally {
    await other.close();
  }
});
test("TC12: выход удаляет сеанс и закрывает доступ", async () => {
  assert.equal((await post("/logout", { csrf })).status, 303);
  assert.equal(await count("admin_sessions"), 0);
  assert.equal(
    (await req("/admin", { headers: { Cookie: cookie } })).headers.get(
      "location",
    ),
    "/login",
  );
});
