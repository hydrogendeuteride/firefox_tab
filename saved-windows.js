"use strict";

// Serialize read/modify/write operations so concurrent window closes and
// deletions cannot overwrite one another's records.
let savedWindowsQueue = Promise.resolve();
const restoringRecords = new Set();

function changeSavedWindows(change) {
  const task = savedWindowsQueue.then(async () => {
    const { savedWindows = [] } = await browser.storage.local.get("savedWindows");
    const result = change(savedWindows);
    await browser.storage.local.set({ savedWindows });
    return result;
  });
  savedWindowsQueue = task.catch(() => {});
  return task;
}

function saveWindowRecord(tabs, now = new Date()) {
  const record = {
    id: crypto.randomUUID(), title: tabGroupTitle(tabs), savedAt: now.toISOString(),
    tabs: [...tabs].sort((a, b) => a.index - b.index).map(tab => ({
      title: tab.title || "", url: tab.url || "", pinned: Boolean(tab.pinned), active: Boolean(tab.active)
    }))
  };
  return changeSavedWindows(records => { records.unshift(record); return record.id; });
}

async function saveTabBackup(tabs, file, options) {
  const results = await Promise.allSettled([
    options.incognito ? Promise.resolve(false) : saveWindowRecord(tabs).then(() => true),
    downloadTabFile(file, options)
  ]);
  const stored = results[0].status === "fulfilled" && results[0].value;
  const downloaded = results[1].status === "fulfilled";
  const messages = [];
  if (stored) messages.push(t("librarySaved", [tabs.length]));
  if (downloaded) messages.push(t("downloadStarted", [tabs.length]));
  results.forEach((result, index) => {
    if (result.status === "rejected") messages.push(t(index === 0 ? "librarySaveFailed" : "fileSaveFailed",
      [result.reason?.message || String(result.reason)]));
  });
  return { ok: Boolean(stored || downloaded), stored: Boolean(stored), downloaded,
    warning: results.some(result => result.status === "rejected"), message: messages.join(" ") };
}

async function restoreWindowRecord(id) {
  if (restoringRecords.has(id)) throw new Error(t("restoreBusy"));
  restoringRecords.add(id);
  try {
    await savedWindowsQueue;
    const { savedWindows = [] } = await browser.storage.local.get("savedWindows");
    const record = savedWindows.find(item => item.id === id);
    if (!record) throw new Error(t("savedNotFound"));
    const tabs = record.tabs.filter(tab => normalizeImportTab(tab));
    if (!tabs.length) throw new Error(t("noRestorableTabs"));
    const win = await browser.windows.create({ url: "about:blank", focused: false });
    const result = await importWindowTabs({ windowId: win.id, tabs });
    if (!result.ok || !result.created) {
      await browser.windows.remove(win.id);
      throw new Error(result.error || result.firstError || t("noRestorableTabs"));
    }
    const activeIndex = tabs.findIndex(tab => tab.active);
    const activeId = result.tabIds[activeIndex] || result.tabIds.find(Boolean);
    await browser.tabs.update(activeId, { active: true });
    const placeholders = (win.tabs || []).map(tab => tab.id);
    if (placeholders.length) await browser.tabs.remove(placeholders);
    await browser.windows.update(win.id, { focused: true });
    return { ...result, skipped: record.tabs.length - tabs.length };
  } finally {
    restoringRecords.delete(id);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || !["list-saved", "delete-saved", "restore-saved"].includes(message?.type)) {
    return undefined;
  }
  return (async () => {
    if (message.type === "restore-saved") return restoreWindowRecord(message.id);
    if (message.type === "delete-saved") {
      await changeSavedWindows(records => {
        const index = records.findIndex(record => record.id === message.id);
        if (index !== -1) records.splice(index, 1);
      });
      return { ok: true };
    }
    await savedWindowsQueue;
    const { savedWindows = [] } = await browser.storage.local.get("savedWindows");
    const records = message.limit === 5 ? savedWindows.slice(0, 5) : savedWindows;
    return { ok: true, total: savedWindows.length, records: records.map(record => ({
      id: record.id, title: record.title, savedAt: record.savedAt, count: record.tabs.length
    })) };
  })().catch(error => ({ ok: false, error: error.message || String(error) }));
});
