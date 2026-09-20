"use strict";

const dropZone = document.getElementById("drop-zone");
const importButton = document.getElementById("import");
const preview = document.getElementById("preview");
const status = document.getElementById("status");
let prepared;
let selection = 0;
let importing = false;

async function prepareFile(file) {
  const version = ++selection;
  prepared = undefined;
  importButton.disabled = true;
  status.textContent = "";
  preview.textContent = t("readingFile", [file.name]);
  try {
    if (!/\.(md|markdown|txt|json)$/i.test(file.name)) {
      throw new Error(t("unsupportedFile"));
    }
    const parsed = parseTabImport(await file.text(), file.name);
    if (version !== selection) return;
    prepared = parsed;
    preview.textContent = t("importPreview", [file.name, parsed.tabs.length, parsed.skipped]);
    importButton.disabled = parsed.tabs.length === 0;
  } catch (error) {
    if (version === selection) preview.textContent = error.message;
  }
}

// Prevent Firefox from navigating to a file dropped outside the target as well.
document.addEventListener("dragover", event => { event.preventDefault(); });
document.addEventListener("drop", event => { event.preventDefault(); });
dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  event.dataTransfer.dropEffect = importing ? "none" : "copy";
  if (!importing) dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  if (importing) return;
  const files = event.dataTransfer.files;
  if (files.length !== 1) {
    ++selection;
    prepared = undefined;
    importButton.disabled = true;
    preview.textContent = t("oneFileOnly");
    return;
  }
  void prepareFile(files[0]);
});

importButton.addEventListener("click", async () => {
  if (!prepared || importing) return;
  importing = true;
  importButton.disabled = true;
  dropZone.setAttribute("aria-disabled", "true");
  status.dataset.error = "false";
  status.textContent = t("creatingTabs");
  try {
    const current = await browser.windows.getCurrent();
    const result = await browser.runtime.sendMessage({
      type: "import-tabs", windowId: current.id, tabs: prepared.tabs
    });
    if (!result.ok) throw new Error(result.error);
    status.textContent = t("importComplete", [result.created, result.failed, prepared.skipped]);
    if (result.failed) {
      status.dataset.error = "true";
      status.textContent += t("firstError", [result.firstError]);
    }
    prepared = undefined;
    preview.textContent = t("dropAnother");
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = t("importFailed", [error.message]);
    // Do not retry automatically: some tabs may already have been created.
  } finally {
    importing = false;
    dropZone.setAttribute("aria-disabled", "false");
  }
});
