"use strict";

function closeAllMenus() {
  document
    .querySelectorAll("[data-menu-panel], [data-mobile-menu]")
    .forEach((menu) => {
      menu.classList.remove("open");
    });
}

document.addEventListener("click", (event) => {
  const menuButton = event.target.closest("[data-menu-button]");
  const insideMenu = event.target.closest("[data-menu-panel]");

  if (menuButton) {
    const header = menuButton.closest("header");
    const panel = header.querySelector("[data-menu-panel]");
    const mobileMenu = header.querySelector("[data-mobile-menu]");

    if (window.innerWidth >= 768) {
      panel.classList.toggle("open");
      mobileMenu.classList.remove("open");
    } else {
      mobileMenu.classList.toggle("open");
      panel.classList.remove("open");
    }
    return;
  }

  if (!insideMenu) closeAllMenus();
});

let modalTrigger = null;
function openModal(title, text) {
  const modal = document.querySelector("[data-modal]");
  if (!modal) return;
  modal.querySelector("[data-modal-title]").textContent = title;
  modal.querySelector("[data-modal-text]").textContent = text;
  modalTrigger = document.activeElement;
  modal.classList.add("open");
  modal.querySelector("[data-modal-close]").focus();
  document.body.classList.add("no-scroll");
}

function closeModal() {
  const modal = document.querySelector("[data-modal]");
  if (!modal) return;
  const wasOpen = modal.classList.contains("open");
  modal.classList.remove("open");
  if (wasOpen && modalTrigger) modalTrigger.focus();
  document.body.classList.remove("no-scroll");
}

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-modal-open]");
  const closeButton = event.target.closest("[data-modal-close]");
  const modal = event.target.closest("[data-modal]");

  if (openButton) {
    openModal(
      openButton.dataset.modalTitle || "Информация",
      openButton.dataset.modalText || "Описание отсутствует.",
    );
  }
  if (closeButton) closeModal();
  if (modal && event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  const modal = document.querySelector("[data-modal].open");
  if (event.key === "Tab" && modal) {
    const nodes = [
      ...modal.querySelectorAll(
        "button, a[href], input, select, textarea, [tabindex='0']",
      ),
    ];
    const first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Escape") {
    closeAllMenus();
    closeModal();
  }
});

const slides = Array.from(document.querySelectorAll("[data-slide]"));
let slideIndex = 0;

function showSlide(index) {
  if (!slides.length) return;
  slideIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, currentIndex) => {
    slide.classList.toggle("active", currentIndex === slideIndex);
  });
}

document.querySelectorAll("[data-carousel-next]").forEach((button) => {
  button.addEventListener("click", () => showSlide(slideIndex + 1));
});
document.querySelectorAll("[data-carousel-prev]").forEach((button) => {
  button.addEventListener("click", () => showSlide(slideIndex - 1));
});
if (slides.length) setInterval(() => showSlide(slideIndex + 1), 7000);

const form = document.getElementById("contactForm");
const submitButton = document.getElementById("submitButton");

function setError(fieldName, message) {
  const errorNode = document.querySelector(`[data-error="${fieldName}"]`);
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (errorNode) errorNode.textContent = message;
  if (field && field.type !== "checkbox" && field.type !== "radio") {
    field.classList.toggle("input-error", Boolean(message));
    field.classList.toggle(
      "input-ok",
      !message && field.value.trim().length > 0,
    );
  }
}

function validateForm() {
  if (!form) return false;
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  const topic = form.elements.topic.value.trim();
  const message = form.elements.message.value.trim();
  const privacy = form.elements.privacy.checked;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let valid = true;

  if (name.length < 2) {
    setError("name", "Введите имя не короче 2 символов.");
    valid = false;
  } else setError("name", "");
  if (!emailPattern.test(email)) {
    setError("email", "Введите корректный email.");
    valid = false;
  } else setError("email", "");
  if (!topic) {
    setError("topic", "Выберите тему обращения.");
    valid = false;
  } else setError("topic", "");
  if (message.length < 10) {
    setError("message", "Сообщение должно быть не короче 10 символов.");
    valid = false;
  } else setError("message", "");
  if (!privacy) {
    setError("privacy", "Подтвердите согласие на обработку данных.");
    valid = false;
  } else setError("privacy", "");

  return valid;
}

if (form) {
  form.addEventListener("input", () => {
    if (submitButton) submitButton.disabled = !form.elements.privacy.checked;
    const status = document.getElementById("formStatus");
    if (status) status.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("formStatus");
    if (!validateForm()) {
      status.textContent = "Проверьте заполнение формы.";
      return;
    }
    if (submitButton) submitButton.disabled = true;
    status.textContent = "Отправка…";
    try {
      const data = Object.fromEntries(new FormData(form));
      data.privacy = form.elements.privacy.checked;
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ошибка сервера.");
      status.textContent = "Обращение сохранено.";
      form.reset();
      form
        .querySelectorAll(".input-ok, .input-error")
        .forEach((x) => x.classList.remove("input-ok", "input-error"));
    } catch (error) {
      status.textContent = error.message || "Не удалось отправить обращение.";
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const filters = document.getElementById("projectFilters");
if (filters) {
  const list = document.getElementById("projectList");
  const status = document.getElementById("projectStatus");
  let timer, controller;
  async function loadProjects() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const query = new URLSearchParams(new FormData(filters));
    status.textContent = "Загрузка проектов…";
    try {
      const response = await fetch(`/api/projects?${query}`, {
        signal: request.signal,
      });
      if (!response.ok) throw new Error("Не удалось получить проекты.");
      const projects = await response.json();
      list.replaceChildren();
      for (const project of projects) {
        const card = document.createElement("article");
        card.className =
          "card-hover flex flex-col overflow-hidden rounded-3xl bg-white shadow-card";
        if (project.image_url) {
          const img = document.createElement("img");
          img.className = "photo-cover";
          img.src = project.image_url;
          img.alt = `Иллюстрация проекта «${project.title}»`;
          img.loading = "lazy";
          card.append(img);
        }
        const body = document.createElement("div");
        body.className = "flex flex-1 flex-col p-8";
        const title = document.createElement("h2");
        title.className = "text-2xl font-bold";
        title.textContent = project.title;
        const summary = document.createElement("p");
        summary.className = "mt-5 flex-1 text-muted";
        summary.textContent = project.summary;
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "mt-7 rounded-full border-2 border-brand px-6 py-3 font-semibold text-brand";
        button.textContent = "Детали";
        button.dataset.modalOpen = "";
        button.dataset.modalTitle = project.title;
        button.dataset.modalText = project.summary;
        const details = document.createElement("p");
        details.className = "mt-3 text-sm text-muted";
        details.textContent = `${project.category_name} · ${project.client_name} · ${project.tags.join(", ")}`;
        body.append(title, details, summary, button);
        card.append(body);
        list.append(card);
      }
      status.textContent = projects.length
        ? `Найдено проектов: ${projects.length}`
        : "По запросу ничего не найдено.";
    } catch (error) {
      if (error.name === "AbortError") return;
      list.replaceChildren();
      status.textContent = error.message;
    }
  }
  filters.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadProjects, 250);
  });
  filters.addEventListener("change", () => {
    clearTimeout(timer);
    loadProjects();
  });
  filters.addEventListener("reset", () => {
    clearTimeout(timer);
    setTimeout(loadProjects, 0);
  });
  filters.addEventListener("submit", (e) => e.preventDefault());
  loadProjects();
}

// Справочники загружаются из PostgreSQL через API.
async function loadCatalog() {
  const client = document.querySelector("[data-client-filter]");
  const tag = document.querySelector("[data-tag-filter]");
  const project = document.getElementById("project_id");
  if (!client && !tag && !project) return;
  try {
    if (client || tag) {
      const response = await fetch("/api/catalog");
      if (!response.ok) throw new Error("Не удалось загрузить справочники.");
      const catalog = await response.json();
      for (const row of catalog.clients)
        client?.add(new Option(row.name, row.id));
      for (const row of catalog.tags) tag?.add(new Option(row.name, row.code));
    }
    if (project) {
      const response = await fetch("/api/projects?sort=title");
      if (!response.ok) throw new Error("Не удалось загрузить проекты.");
      for (const row of await response.json())
        project.add(new Option(row.title, row.id));
    }
  } catch (error) {
    const status =
      document.getElementById("projectStatus") ||
      document.getElementById("formStatus");
    if (status) status.textContent = error.message;
  }
}
loadCatalog();
