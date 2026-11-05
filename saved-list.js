"use strict";

function initializeSavedList(limit) {
  const list = document.getElementById("saved-list");
  const status = document.getElementById("saved-status");
  const busy = new Set();
  let revision = 0;

  function showError(error) {
    status.dataset.error = "true";
    status.textContent = t("operationFailed", [error.message || String(error)]);
  }

  async function request(message) {
    const result = await browser.runtime.sendMessage(message);
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  function iconButton(text, path, className, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `icon-button ${className}`;
    element.title = text;
    element.setAttribute("aria-label", text);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    icon.append(shape);
    element.append(icon);
    element.addEventListener("click", handler);
    return element;
  }

  function recordElement(record) {
    const item = document.createElement("article");
    item.className = "saved-item";
    const title = document.createElement("h3");
    title.textContent = record.title;
    title.title = record.title;
    const details = document.createElement("p");
    details.className = "saved-meta";
    const date = new Intl.DateTimeFormat(browser.i18n.getUILanguage(), limit ? {
      month: "2-digit", day: "2-digit"
    } : {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(record.savedAt));
    details.textContent = t(limit ? "savedDetailsCompact" : "savedDetails", [date, record.count]);
    details.title = new Date(record.savedAt).toLocaleString(browser.i18n.getUILanguage());
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    const restore = iconButton(t("restoreNewWindow"), "M14 3h7v7m0-7L11 13M10 5H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6", "restore-saved", async () => {
      busy.add(record.id);
      item.querySelectorAll("button").forEach(element => { element.disabled = true; });
      status.dataset.error = "false";
      status.textContent = t("creatingTabs");
      try {
        const result = await request({ type: "restore-saved", id: record.id });
        status.dataset.error = String(result.failed > 0);
        status.textContent = t("importComplete", [result.created, result.failed, result.skipped]);
        if (result.failed) status.textContent += t("firstError", [result.firstError]);
      } catch (error) {
        showError(error);
      } finally {
        busy.delete(record.id);
        void refresh();
      }
    });
    const remove = iconButton(t("deleteSaved"), "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7", "delete-saved", async () => {
      busy.add(record.id);
      item.querySelectorAll("button").forEach(element => { element.disabled = true; });
      status.textContent = "";
      try {
        await request({ type: "delete-saved", id: record.id });
      } catch (error) {
        showError(error);
      } finally {
        busy.delete(record.id);
        await refresh();
      }
    });
    actions.append(restore, remove);
    item.append(title, details, actions);
    if (busy.has(record.id)) item.querySelectorAll("button").forEach(element => { element.disabled = true; });
    return item;
  }

  async function refresh() {
    const current = ++revision;
    list.setAttribute("aria-busy", "true");
    try {
      const result = await request({ type: "list-saved", limit });
      if (current !== revision) return;
      list.replaceChildren(...result.records.map(recordElement));
      if (!result.records.length) {
        const empty = document.createElement("p");
        empty.className = "saved-empty muted";
        empty.textContent = t("noSavedTabs");
        list.append(empty);
      }
    } catch (error) {
      if (current === revision) showError(error);
    } finally {
      if (current === revision) list.setAttribute("aria-busy", "false");
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.savedWindows) void refresh();
  });
  void refresh();
}
