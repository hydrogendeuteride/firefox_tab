"use strict";

const summary = document.getElementById("summary");
const status = document.getElementById("status");
const exportButton = document.getElementById("export");
const format = document.getElementById("format");
const importButton = document.getElementById("open-import");
let sourceWindow;

function showError(error) {
  status.dataset.error = "true";
  status.textContent = t("operationFailed", [error.message || String(error)]);
}

async function initialize() {
  try {
    sourceWindow = await browser.windows.getCurrent();
    importButton.disabled = false;
    const tabs = await browser.tabs.query({ windowId: sourceWindow.id });
    summary.textContent = t("windowTabCount", [tabs.length]);
    exportButton.disabled = tabs.length === 0;
  } catch (error) {
    summary.textContent = t("cannotReadTabs");
    showError(error);
  }
}

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  status.dataset.error = "false";
  status.textContent = t("preparingSave");
  try {
    const result = await browser.runtime.sendMessage({
      type: "export-tabs",
      windowId: sourceWindow.id,
      format: format.value
    });
    if (!result.ok) throw new Error(result.error);
    status.textContent = t("downloadStarted", [result.count]);
  } catch (error) {
    showError(error);
  } finally {
    exportButton.disabled = false;
  }
});

importButton.addEventListener("click", async () => {
  try {
    await browser.tabs.create({
      windowId: sourceWindow.id,
      url: browser.runtime.getURL("import.html")
    });
    window.close();
  } catch (error) {
    showError(error);
  }
});

document.getElementById("open-settings").addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch(showError);
});

initialize();
