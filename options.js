"use strict";

const fields = document.getElementById("fields");
const closeOption = document.getElementById("save-on-close");
const directOption = document.getElementById("save-to-folder");
const folderInput = document.getElementById("folder");
const formatInput = document.getElementById("auto-format");
const status = document.getElementById("status");

function updatePath() {
  document.getElementById("path-preview").textContent =
    t("savePath", [folderInput.value.trim().replace(/\\/g, "/")]);
}

function showLastSave(value) {
  document.getElementById("last-save").textContent = value
    ? t("lastAutoSave", [new Date(value.at).toLocaleString(), value.key ? t(value.key, value.args) : value.message]) : "";
}

folderInput.addEventListener("input", updatePath);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastAutoSave) showLastSave(changes.lastAutoSave.newValue);
});

document.getElementById("settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  fields.disabled = true;
  try {
    const settings = validateSettings({ saveOnClose: closeOption.checked,
      saveToFolder: directOption.checked, folder: folderInput.value, format: formatInput.value });
    const result = await browser.runtime.sendMessage({ type: "save-settings", settings });
    if (!result.ok) throw new Error(result.error);
    folderInput.value = settings.folder;
    updatePath();
    status.dataset.error = "false";
    status.textContent = t("settingsSaved");
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message;
  } finally {
    fields.disabled = false;
  }
});

(async () => {
  try {
    const settings = await readSettings();
    closeOption.checked = settings.saveOnClose;
    directOption.checked = settings.saveToFolder;
    folderInput.value = settings.folder;
    formatInput.value = settings.format;
    updatePath();
    const { lastAutoSave } = await browser.storage.local.get("lastAutoSave");
    showLastSave(lastAutoSave);
    fields.disabled = false;
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message;
  }
})();
