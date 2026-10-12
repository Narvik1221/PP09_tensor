"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { verifyPassword, transaction } = require("./db");
const views = require("./views");
const root = path.resolve(__dirname, "..");
const pages = new Set([
  "/index.html",
  "/projects.html",
  "/career.html",
  "/contact.html",
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};
const orderBy = {
  newest: "p.id DESC",
  title: "p.title ASC, p.id ASC",
  category: "c.name ASC, p.id ASC",
};
const text = (v, max) =>
  typeof v === "string" ? v.trim().slice(0, max + 1) : "";
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
function error(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function id(v, optional = false) {
  if (optional && (v === "" || v == null)) return null;
  if (
    !/^\d+$/.test(String(v)) ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < 1
  )
    throw error(400, "Некорректный идентификатор.");
  return Number(v);
}
function parseProject(body) {
  const title = text(body.title, 100),
    summary = text(body.summary, 500),
    slug = text(body.slug, 70),
    image = text(body.image_url || "", 100);
  if (
    !title ||
    title.length > 100 ||
    !summary ||
    summary.length > 500 ||
    !/^[a-z0-9-]{2,70}$/.test(slug) ||
    (image && !/^\/assets\/img\/[a-z0-9-]+\.webp$/.test(image))
  )
    throw error(400, "Неверные данные проекта.");
  const tags = [
    ...new Set(
      (Array.isArray(body.tags) ? body.tags : body.tags ? [body.tags] : []).map(
        (x) => id(x),
      ),
    ),
  ];
  if (tags.length > 8) throw error(400, "Слишком много тегов.");
  return {
    title,
    summary,
    slug,
    image_url: image || null,
    category_id: id(body.category_id),
    client_id: id(body.client_id),
    tags,
  };
}
function parseContact(body) {
  const name = text(body.name, 100),
    email = text(body.email, 200).toLowerCase(),
    topic = text(body.topic, 20),
    channel = text(body.channel, 10),
    message = text(body.message, 2000);
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    !["project", "career", "support"].includes(topic) ||
    !["email", "phone"].includes(channel) ||
    message.length < 10 ||
    message.length > 2000 ||
    body.privacy !== true ||
    body.website
  )
    throw error(400, "Проверьте обязательные поля и согласие.");
  return {
    name,
    email,
    topic,
    channel,
    message,
    project_id: id(body.project_id, true),
  };
}
async function readBody(req) {
  const type = (req.headers["content-type"] || "").split(";")[0];
  if (!["application/json", "application/x-www-form-urlencoded"].includes(type))
    throw error(415, "Неподдерживаемый формат данных.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw error(413, "Слишком большой запрос.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    if (type === "application/json") {
      const v = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw Error();
      return v;
    }
    const p = new URLSearchParams(raw),
      v = Object.fromEntries(p);
    if (p.has("tags")) v.tags = p.getAll("tags");
    return v;
  } catch {
    throw error(400, "Некорректные данные.");
  }
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function html(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(value);
}
function redirect(res, target) {
  res.writeHead(303, { Location: target, "Cache-Control": "no-store" });
  res.end();
}
function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw error(403, "Недопустимый источник запроса.");
  if (req.headers.origin) {
    let host;
    try {
      host = new URL(req.headers.origin).host;
    } catch {
      throw error(403, "Недопустимый источник запроса.");
    }
    if (host !== req.headers.host)
      throw error(403, "Недопустимый источник запроса.");
  }
}
async function catalog(db) {
  const [categories, clients, tags, statuses] = await Promise.all([
    db.query("SELECT id,code,name FROM pp09.categories ORDER BY name"),
    db.query("SELECT id,name FROM pp09.clients ORDER BY name"),
    db.query("SELECT id,code,name FROM pp09.tags ORDER BY name"),
    db.query("SELECT id,code,name FROM pp09.inquiry_statuses ORDER BY id"),
  ]);
  return {
    categories: categories.rows,
    clients: clients.rows,
    tags: tags.rows,
    statuses: statuses.rows,
  };
}
const projectSelect = `SELECT p.id,p.slug,p.title,p.summary,p.image_url,p.category_id,p.client_id,
 c.code AS category,c.name AS category_name,cl.name AS client_name,
 COALESCE((SELECT json_agg(t.name ORDER BY t.name) FROM pp09.project_tags pt JOIN pp09.tags t ON t.id=pt.tag_id WHERE pt.project_id=p.id),'[]'::json) AS tags
 FROM pp09.projects p JOIN pp09.categories c ON c.id=p.category_id JOIN pp09.clients cl ON cl.id=p.client_id`;
async function log(
  db,
  user,
  action,
  details = {},
  project = null,
  inquiry = null,
) {
  await db.query(
    "INSERT INTO pp09.audit_events(user_id,action,details,project_id,inquiry_id) VALUES($1,$2,$3,$4,$5)",
    [user, action, JSON.stringify(details), project, inquiry],
  );
}
function createApp(db, options = {}) {
  const secure = options.secureCookies ?? process.env.NODE_ENV === "production";
  const contacts = new Map(),
    logins = new Map();
  const dummyHash = `scrypt$${"0".repeat(32)}$${crypto.scryptSync("not-a-valid-password", "0".repeat(32), 64).toString("hex")}`;
  const cookie = (token, maxAge = 7200) =>
    `pp09_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  async function session(req) {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("pp09_session="))
      ?.slice(13);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const r = await db.query(
      `SELECT s.token_hash,s.csrf_token,s.user_id,u.display_name FROM pp09.admin_sessions s
   JOIN pp09.admin_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=TRUE`,
      [hash(token)],
    );
    return r.rows[0] || null;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      let url, pathname;
      try {
        url = new URL(req.url, "http://local.test");
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw error(400, "Некорректный адрес.");
      }
      if (req.method === "GET" && pathname === "/healthz") {
        await db.query("SELECT count(*) FROM pp09.categories");
        return json(res, 200, { status: "ok", schema: "pp09" });
      }
      if (req.method === "GET" && pathname === "/api/catalog") {
        const c = await catalog(db);
        delete c.statuses;
        return json(res, 200, c);
      }
      if (req.method === "GET" && pathname === "/api/projects") {
        const q = text(url.searchParams.get("q") || "", 100),
          category = url.searchParams.get("category") || "all",
          sort = url.searchParams.get("sort") || "newest",
          tag = url.searchParams.get("tag") || "all",
          client = id(url.searchParams.get("client_id"), true);
        if (
          q.length > 100 ||
          !["all", "automation", "documents", "logistics"].includes(category) ||
          !Object.hasOwn(orderBy, sort) ||
          ![
            "all",
            "erp",
            "crm",
            "wms",
            "edo",
            "analytics",
            "integration",
            "web",
            "reports",
          ].includes(tag)
        )
          throw error(400, "Неверные параметры поиска.");
        const result = await db.query(
          `${projectSelect} WHERE p.is_published=TRUE
     AND ($1='' OR p.title ILIKE '%'||$1||'%' OR p.summary ILIKE '%'||$1||'%')
     AND ($2='all' OR c.code=$2) AND ($3::bigint IS NULL OR p.client_id=$3)
     AND ($4='all' OR EXISTS(SELECT 1 FROM pp09.project_tags pt JOIN pp09.tags t ON t.id=pt.tag_id WHERE pt.project_id=p.id AND t.code=$4))
     ORDER BY ${orderBy[sort]} LIMIT 100`,
          [q, category, client, tag],
        );
        return json(res, 200, result.rows);
      }
      if (req.method === "POST" && pathname === "/api/contact") {
        sameOrigin(req);
        const body = parseContact(await readBody(req)),
          key = hash((req.socket.remoteAddress || "") + ":" + body.email),
          now = Date.now();
        for (const [k, t] of contacts) if (now - t > 60000) contacts.delete(k);
        if (contacts.has(key) && now - contacts.get(key) < 30000)
          throw error(429, "Повторите отправку позже.");
        if (contacts.size >= 2000) throw error(429, "Сервис временно занят.");
        if (body.project_id) {
          const p = await db.query(
            "SELECT id FROM pp09.projects WHERE id=$1 AND is_published=TRUE",
            [body.project_id],
          );
          if (!p.rows.length) throw error(400, "Выбранный проект недоступен.");
        }
        await db.query(
          `INSERT INTO pp09.inquiries(name,email,topic,channel,message,project_id,status_id)
     VALUES($1,$2,$3,$4,$5,$6,(SELECT id FROM pp09.inquiry_statuses WHERE code='new'))`,
          [
            body.name,
            body.email,
            body.topic,
            body.channel,
            body.message,
            body.project_id,
          ],
        );
        contacts.set(key, now);
        return json(res, 201, { message: "Обращение сохранено." });
      }
      if (pathname === "/login") {
        if (req.method === "GET") return html(res, views.login());
        if (req.method === "POST") {
          sameOrigin(req);
          const body = await readBody(req),
            username = text(body.username, 50),
            password = typeof body.password === "string" ? body.password : "";
          const key = req.socket.remoteAddress || "",
            now = Date.now();
          for (const [k, v] of logins)
            if (now - v.since > 60000) logins.delete(k);
          const failures = logins.get(key) || { since: now, count: 0 };
          if (failures.count >= 5 || logins.size > 2000)
            throw error(
              429,
              "Слишком много попыток. Повторите вход через минуту.",
            );
          if (password.length > 200 || username.length > 50)
            throw error(400, "Неверные данные входа.");
          const r = await db.query(
            "SELECT id,password_hash FROM pp09.admin_users WHERE username=$1 AND is_active=TRUE",
            [username],
          );
          const valid = await verifyPassword(
            password,
            r.rows[0]?.password_hash || dummyHash,
          );
          if (!r.rows[0] || !valid) {
            failures.count++;
            logins.set(key, failures);
            return html(res, views.login("Неверный логин или пароль."), 401);
          }
          const token = crypto.randomBytes(32).toString("hex"),
            csrf = crypto.randomBytes(32).toString("hex"),
            user = r.rows[0].id;
          await transaction(db, async (tx) => {
            await tx.query(
              "DELETE FROM pp09.admin_sessions WHERE expires_at < now()",
            );
            await tx.query(
              "INSERT INTO pp09.admin_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+INTERVAL '2 hours')",
              [hash(token), user, csrf],
            );
            await log(tx, user, "login");
          });
          logins.delete(key);
          res.setHeader("Set-Cookie", cookie(token));
          return redirect(res, "/admin");
        }
      }
      if (
        pathname === "/logout" ||
        pathname === "/admin" ||
        pathname.startsWith("/admin/")
      ) {
        const user = await session(req);
        if (!user) {
          if (req.method === "GET") return redirect(res, "/login");
          throw error(401, "Требуется вход администратора.");
        }
        if (req.method === "GET") {
          if (pathname === "/admin") {
            const r = await db.query(
              `${projectSelect} ORDER BY p.id DESC LIMIT 200`,
            );
            return html(res, views.projects(r.rows, await catalog(db), user));
          }
          if (pathname === "/admin/inquiries") {
            const r = await db.query(
              `SELECT i.*,p.title AS project_title FROM pp09.inquiries i LEFT JOIN pp09.projects p ON p.id=i.project_id ORDER BY i.id DESC LIMIT 200`,
            );
            return html(res, views.inquiries(r.rows, await catalog(db), user));
          }
          if (pathname === "/admin/stats") {
            const r = await db.query(
              "SELECT v.visited_on::text AS day,s.path,s.title,v.views,v.is_demo FROM pp09.daily_views v JOIN pp09.site_pages s ON s.id=v.page_id ORDER BY v.visited_on DESC,s.path LIMIT 100",
            );
            return html(res, views.stats(r.rows, user));
          }
          if (pathname === "/admin/audit") {
            const r = await db.query(
              "SELECT e.id,e.created_at::text AS time,u.username,e.action,e.details FROM pp09.audit_events e LEFT JOIN pp09.admin_users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 100",
            );
            return html(res, views.audit(r.rows, user));
          }
        }
        if (req.method === "POST") {
          sameOrigin(req);
          const body = await readBody(req);
          if (
            typeof body.csrf !== "string" ||
            !/^[a-f0-9]{64}$/.test(body.csrf) ||
            !crypto.timingSafeEqual(
              Buffer.from(body.csrf),
              Buffer.from(user.csrf_token),
            )
          )
            throw error(403, "Неверный защитный токен формы.");
          if (pathname === "/logout") {
            await transaction(db, async (tx) => {
              await tx.query(
                "DELETE FROM pp09.admin_sessions WHERE token_hash=$1",
                [user.token_hash],
              );
              await log(tx, user.user_id, "logout");
            });
            res.setHeader("Set-Cookie", cookie("", 0));
            return redirect(res, "/login");
          }
          if (pathname === "/admin/projects") {
            const p = parseProject(body);
            await transaction(db, async (tx) => {
              const r = await tx.query(
                "INSERT INTO pp09.projects(slug,title,summary,category_id,client_id,image_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
                [
                  p.slug,
                  p.title,
                  p.summary,
                  p.category_id,
                  p.client_id,
                  p.image_url,
                ],
              );
              const project = r.rows[0].id;
              for (const tag of p.tags)
                await tx.query(
                  "INSERT INTO pp09.project_tags(project_id,tag_id) VALUES($1,$2)",
                  [project, tag],
                );
              await log(
                tx,
                user.user_id,
                "project.create",
                { slug: p.slug, title: p.title },
                project,
              );
            });
            return redirect(res, "/admin");
          }
          const del = pathname.match(/^\/admin\/projects\/(\d+)\/delete$/);
          if (del) {
            await transaction(db, async (tx) => {
              const r = await tx.query(
                "DELETE FROM pp09.projects WHERE id=$1 RETURNING id,title",
                [id(del[1])],
              );
              if (!r.rows.length) throw error(404, "Проект не найден.");
              await log(tx, user.user_id, "project.delete", {
                id: r.rows[0].id,
                title: r.rows[0].title,
              });
            });
            return redirect(res, "/admin");
          }
          const update = pathname.match(/^\/admin\/inquiries\/(\d+)\/status$/);
          if (update) {
            const inquiry = id(update[1]),
              status = id(body.status_id);
            await transaction(db, async (tx) => {
              const r = await tx.query(
                "UPDATE pp09.inquiries SET status_id=$1,assigned_to=$2 WHERE id=$3 RETURNING id",
                [status, user.user_id, inquiry],
              );
              if (!r.rows.length) throw error(404, "Обращение не найдено.");
              await log(
                tx,
                user.user_id,
                "inquiry.status",
                { status_id: status },
                null,
                inquiry,
              );
            });
            return redirect(res, "/admin/inquiries");
          }
        }
        throw error(404, "Страница не найдена.");
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const name = pathname === "/" ? "/index.html" : pathname;
        const asset =
          /^\/assets\/(css|js|img)\/[a-zA-Z0-9_.-]+$/.test(name) &&
          !name.includes("..");
        if (pages.has(name) || name === "/robots.txt" || asset) {
          const ext = path.extname(name);
          if (!mime[ext]) throw error(404, "Файл не найден.");
          let data;
          try {
            data = await fs.readFile(path.join(root, name));
          } catch (e) {
            if (e.code === "ENOENT") throw error(404, "Файл не найден.");
            throw e;
          }
          if (pages.has(name) && req.method === "GET")
            await db.query(
              `INSERT INTO pp09.daily_views(page_id,views,is_demo)
      SELECT id,1,FALSE FROM pp09.site_pages WHERE path=$1
      ON CONFLICT(visited_on,page_id) DO UPDATE SET views=pp09.daily_views.views+1,is_demo=FALSE`,
              [name],
            );
          res.writeHead(200, {
            "Content-Type": mime[ext],
            "Cache-Control":
              ext === ".html" ? "no-cache" : "public, max-age=3600",
          });
          return res.end(req.method === "HEAD" ? undefined : data);
        }
      }
      throw error(404, "Страница не найдена.");
    } catch (e) {
      let status = e.status || 500,
        message = e.message;
      if (e.code === "23505") {
        status = 409;
        message = "Такая запись уже существует.";
      }
      if (e.code === "23503" || e.code === "23001" || e.code === "23514") {
        status = 400;
        message = "Некорректные связи или данные записи.";
      }
      if (status === 500) {
        console.error("Server error:", e.code || e.name);
        message = "Внутренняя ошибка сервера.";
      }
      if (!res.headersSent) json(res, status, { error: message });
      else res.end();
    }
  });
  return server;
}
module.exports = { createApp, parseProject, parseContact };
