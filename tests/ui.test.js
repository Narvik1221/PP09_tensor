"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");
const { PGlite } = require("@electric-sql/pglite");
const { initialize } = require("../server/db");
const { createApp } = require("../server/app");
const db = new PGlite();
let server, base;
before(async () => {
  await initialize(db, {
    username: "student",
    password: "practice-test-password-2026",
  });
  server = createApp(db, { secureCookies: false });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});
async function waitFor(check) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Сценарий не завершился.");
}
async function page(path) {
  const errors = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(e));
  const dom = await JSDOM.fromURL(base + path, {
    resources: "usable",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w) {
      w.AbortController = global.AbortController;
      w.AbortSignal = global.AbortSignal;
      w.fetch = (url, options) => fetch(new URL(url, base), options);
      w.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      });
    },
  });
  await new Promise((r) =>
    dom.window.addEventListener("load", r, { once: true }),
  );
  return { dom, w: dom.window, d: dom.window.document, errors };
}
test("UI01: меню, переходы и мобильное меню", async () => {
  const { dom, w, d, errors } = await page("/");
  try {
    d.querySelector("[data-menu-button]").click();
    assert.ok(d.querySelector("[data-menu-panel]").classList.contains("open"));
    assert.ok(
      [...d.querySelectorAll("a[href]")].some(
        (a) => a.getAttribute("href") === "projects.html",
      ),
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.ok(!d.querySelector("[data-menu-panel]").classList.contains("open"));
    w.innerWidth = 390;
    d.querySelector("[data-menu-button]").click();
    assert.ok(d.querySelector("[data-mobile-menu]").classList.contains("open"));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
test("UI02: карточки API, фильтр, сброс, модальное окно и возврат фокуса", async () => {
  const { dom, w, d, errors } = await page("/projects.html");
  try {
    await waitFor(
      () => d.querySelectorAll("#projectList article").length === 24,
    );
    await waitFor(
      () => d.querySelector("[data-client-filter]").options.length === 9,
    );
    const category = d.querySelector("[name=category]");
    category.value = "logistics";
    category.dispatchEvent(new w.Event("change", { bubbles: true }));
    await waitFor(
      () => d.querySelectorAll("#projectList article").length === 8,
    );
    const button = d.querySelector("#projectList [data-modal-open]");
    button.focus();
    button.click();
    assert.ok(d.querySelector("[data-modal]").classList.contains("open"));
    assert.ok(d.body.classList.contains("no-scroll"));
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.ok(!d.querySelector("[data-modal]").classList.contains("open"));
    assert.equal(d.activeElement, button);
    d.querySelector("[type=reset]").click();
    await waitFor(
      () => d.querySelectorAll("#projectList article").length === 24,
    );
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
test("UI03: пустые поля, ошибочный email и сохранение корректной формы", async () => {
  const { dom, w, d, errors } = await page("/contact.html");
  try {
    await waitFor(() => d.querySelector("#project_id").options.length === 25);
    const f = d.querySelector("#contactForm"),
      status = d.querySelector("#formStatus");
    f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    assert.match(status.textContent, /Проверьте/);
    assert.match(
      d.querySelector("[data-error=name]").textContent,
      /2 символов/,
    );
    f.elements.name.value = "Анна";
    f.elements.email.value = "bad";
    f.elements.topic.value = "project";
    f.elements.message.value = "Требуется обсудить учебный проект";
    f.elements.privacy.checked = true;
    f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    assert.match(
      d.querySelector("[data-error=email]").textContent,
      /корректный/,
    );
    f.elements.email.value = "dom-user@example.test";
    f.elements.project_id.value = "1";
    f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => status.textContent === "Обращение сохранено.");
    assert.equal(f.elements.name.value, "");
    assert.equal(d.querySelector("#submitButton").disabled, true);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
test("UI04: карусель меняет активный слайд", async () => {
  const { dom, d, errors } = await page("/");
  try {
    const before = d.querySelector("[data-slide].active");
    d.querySelector("[data-carousel-next]").click();
    assert.notEqual(d.querySelector("[data-slide].active"), before);
    d.querySelector("[data-carousel-prev]").click();
    assert.equal(d.querySelector("[data-slide].active"), before);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
