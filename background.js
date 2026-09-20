"use strict";

const downloadUrls = new Map();

function releaseDownload(id) {
  const url = downloadUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    downloadUrls.delete(id);
  }
}

browser.downloads.onChanged.addListener(delta => {
  if (["complete", "interrupted"].includes(delta.state?.current)) {
    releaseDownload(delta.id);
  }
});

browser.downloads.onErased.addListener(releaseDownload);

async function downloadTabFile(file, options) {
  let url;
  try {
    // The background page owns the URL so closing the popup cannot destroy it.
    url = URL.createObjectURL(new Blob([file.content], {
      type: `${file.mime};charset=utf-8`
    }));
    const id = await browser.downloads.download({
      url,
      filename: options.filename || file.filename,
      saveAs: options.saveAs,
      conflictAction: "uniquify",
      incognito: options.incognito === true
    });
    downloadUrls.set(id, url);
    // Small files can finish before download() resolves and the ID is tracked.
    browser.downloads.search({ id }).then(items => {
      if (!items.length || ["complete", "interrupted"].includes(items[0].state)) {
        releaseDownload(id);
      }
    }).catch(error => console.error("Download state lookup failed", error));
    return id;
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    throw error;
  }
}

async function exportWindowTabs(message) {
  try {
    if (!Number.isInteger(message.windowId) || message.windowId < 0) {
      throw new Error(t("invalidWindow"));
    }
    const sourceWindow = await browser.windows.get(message.windowId);
    const tabs = await browser.tabs.query({ windowId: sourceWindow.id });
    if (!tabs.length) throw new Error(t("noTabs"));
    const settings = await readSettings();
    const file = createTabExport(tabs, message.format);
    await downloadTabFile(file, {
      filename: savedFilename(file, settings),
      saveAs: !settings.saveToFolder,
      incognito: sourceWindow.incognito
    });
    return { ok: true, count: tabs.length };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

const importingWindows = new Set();

async function importWindowTabs(message) {
  const windowId = message.windowId;
  if (!Number.isInteger(windowId) || windowId < 0 || !Array.isArray(message.tabs)) {
    return { ok: false, error: t("invalidImport") };
  }
  if (importingWindows.has(windowId)) {
    return { ok: false, error: t("importBusy") };
  }
  importingWindows.add(windowId);
  try {
    await browser.windows.get(windowId);
    const tabs = message.tabs.map(normalizeImportTab);
    if (!tabs.length || tabs.some(tab => !tab)) throw new Error(t("unsupportedUrl"));
    let created = 0;
    let failed = 0;
    let firstError = "";
    for (const tab of tabs) {
      try {
        const existing = await browser.tabs.query({ windowId });
        await browser.tabs.create({
          windowId,
          url: tab.url === "about:newtab" ? undefined : tab.url,
          pinned: tab.pinned,
          active: false,
          index: tab.pinned ? existing.filter(item => item.pinned).length : existing.length
        });
        created++;
      } catch (error) {
        failed++;
        if (!firstError) firstError = error.message || String(error);
      }
    }
    return { ok: true, created, failed, firstError };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  } finally {
    importingWindows.delete(windowId);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === browser.runtime.id && message?.type === "import-tabs") {
    return importWindowTabs(message);
  }
  if (sender.id === browser.runtime.id && message?.type === "export-tabs") {
    return exportWindowTabs(message);
  }
  return undefined;
});
