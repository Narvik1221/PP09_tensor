"use strict";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const csrf = (s) =>
  `<input type="hidden" name="csrf" value="${esc(s.csrf_token)}">`;
function layout(title, body, session) {
  const nav = session
    ? `<nav><a href="/admin">Проекты</a><a href="/admin/inquiries">Обращения</a><a href="/admin/stats">Статистика</a><a href="/admin/audit">Журнал</a><a href="/projects.html">На сайт</a><form method="post" action="/logout">${csrf(session)}<button>Выйти</button></form></nav><p>Пользователь: ${esc(session.display_name)}</p>`
    : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/assets/css/admin.css"></head><body><main><h1>${esc(title)}</h1>${nav}${body}</main></body></html>`;
}
function login(error = "") {
  return layout(
    "Вход администратора",
    `<p>Управление проектами, обращениями и статистикой сайта.</p>${error ? `<p role="alert">${esc(error)}</p>` : ""}<form method="post" action="/login" class="login"><label>Логин<input name="username" autocomplete="username" required maxlength="50"></label><label>Пароль<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label><button type="submit">Войти</button></form><p><a href="/">На главную</a></p>`,
  );
}
const selectOptions = (rows, current) =>
  rows
    .map(
      (x) =>
        `<option value="${x.id}"${String(x.id) === String(current) ? " selected" : ""}>${esc(x.name)}</option>`,
    )
    .join("");
function projects(rows, cat, session) {
  const items = rows
    .map(
      (p) =>
        `<tr><td>${p.id}</td><td>${esc(p.title)}</td><td>${esc(p.category_name)}</td><td>${esc(p.client_name)}</td><td><form method="post" action="/admin/projects/${p.id}/delete">${csrf(session)}<button type="submit">Удалить</button></form></td></tr>`,
    )
    .join("");
  return layout(
    "Проекты",
    `<p>Записей: ${rows.length}</p><div class="table-scroll"><table><thead><tr><th>ID</th><th>Название</th><th>Категория</th><th>Заказчик</th><th>Действие</th></tr></thead><tbody>${items}</tbody></table></div><h2>Добавить проект</h2><form method="post" action="/admin/projects">${csrf(session)}<label>Код проекта<input name="slug" required pattern="[a-z0-9-]{2,70}" maxlength="70"></label><label>Название<input name="title" required maxlength="100"></label><label>Описание<textarea name="summary" required maxlength="500"></textarea></label><label>Категория<select name="category_id">${selectOptions(cat.categories)}</select></label><label>Заказчик<select name="client_id">${selectOptions(cat.clients)}</select></label><label>Изображение<input name="image_url" value="/assets/img/office-light.webp" maxlength="100"></label><fieldset><legend>Теги</legend>${cat.tags.map((t) => `<label class="check"><input type="checkbox" name="tags" value="${t.id}">${esc(t.name)}</label>`).join("")}</fieldset><button type="submit">Добавить</button></form>`,
    session,
  );
}
function inquiries(rows, cat, session) {
  const items = rows
    .map(
      (v) =>
        `<tr><td>${v.id}</td><td>${esc(v.name)}<br>${esc(v.email)}${v.is_demo ? "<br>Учебная запись" : ""}</td><td>${esc(v.project_title || "Без проекта")}</td><td>${esc(v.message)}</td><td><form method="post" action="/admin/inquiries/${v.id}/status">${csrf(session)}<select name="status_id" aria-label="Статус обращения ${v.id}">${selectOptions(cat.statuses, v.status_id)}</select><button>Сохранить статус</button></form></td></tr>`,
    )
    .join("");
  return layout(
    "Обращения",
    `<p>Записей: ${rows.length}. Сведения доступны только администратору.</p><div class="table-scroll"><table><thead><tr><th>ID</th><th>Отправитель</th><th>Проект</th><th>Сообщение</th><th>Статус</th></tr></thead><tbody>${items}</tbody></table></div>`,
    session,
  );
}
function stats(rows, session) {
  return layout(
    "Статистика посещений",
    `<p>Учитываются открытия страниц. IP-адреса и уникальные посетители не сохраняются.</p><table><thead><tr><th>Дата</th><th>Страница</th><th>Просмотры</th><th>Набор</th></tr></thead><tbody>${rows.map((v) => `<tr><td>${esc(v.day)}</td><td>${esc(v.title)} (${esc(v.path)})</td><td>${Number(v.views)}</td><td>${v.is_demo ? "Учебные данные" : "Просмотры сайта"}</td></tr>`).join("")}</tbody></table>`,
    session,
  );
}
function audit(rows, session) {
  return layout(
    "Журнал действий",
    `<p>Регистрация входа, выхода и изменений записей.</p><table><thead><tr><th>ID</th><th>Время</th><th>Пользователь</th><th>Действие</th><th>Сведения</th></tr></thead><tbody>${rows.map((v) => `<tr><td>${v.id}</td><td>${esc(v.time)}</td><td>${esc(v.username || "Система")}</td><td>${esc(v.action)}</td><td>${esc(JSON.stringify(v.details))}</td></tr>`).join("")}</tbody></table>`,
    session,
  );
}
module.exports = { login, projects, inquiries, stats, audit };
