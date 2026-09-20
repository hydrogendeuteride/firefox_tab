"use strict";

// session storage survives an MV3 background-page suspension, but not Firefox exit.
let snapshots = {};
let autoSettings;
const closingWindows = new Set();

function snapshotTab(tab) {
  return { id: tab.id, index: tab.index, title: tab.title, url: tab.url, pinned: tab.pinned };
}

function reindex(snapshot) {
  snapshot.tabs.forEach((tab, index) => { tab.index = index; });
}

async function seedSnapshots(preserve) {
  const windows = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
  if (!preserve) snapshots = {};
  for (const win of windows) {
    if (!win.incognito && (!preserve || !snapshots[win.id])) {
      snapshots[win.id] = { tabs: (win.tabs || []).map(snapshotTab) };
    }
  }
}

async function persistSnapshots() {
  await browser.storage.session.set({ autoSnapshots: snapshots });
}

async function reportAutoSave(key, args = []) {
  await browser.storage.local.set({ lastAutoSave: { at: new Date().toISOString(), key, args } });
}

let autoQueue = (async () => {
  autoSettings = await readSettings();
  if (autoSettings.saveOnClose) {
    const saved = await browser.storage.session.get("autoSnapshots");
    snapshots = saved.autoSnapshots || {};
    await seedSnapshots(true);
  }
  await persistSnapshots();
})();

function queueAutoTask(task) {
  const result = autoQueue.then(task);
  autoQueue = result.catch(error => {
    console.error("Automatic tab backup failed", error);
    return reportAutoSave("autoSaveError", [error.message || String(error)]).catch(console.error);
  });
  return result;
}

function onTabEvent(task) {
  return queueAutoTask(async () => {
    if (!autoSettings.saveOnClose) return;
    await task();
    await persistSnapshots();
  });
}

browser.tabs.onCreated.addListener(tab => onTabEvent(async () => {
  if (tab.incognito || closingWindows.has(tab.windowId)) return;
  if (!snapshots[tab.windowId]) {
    const win = await browser.windows.get(tab.windowId);
    if (win.type !== "normal" || win.incognito) return;
    snapshots[tab.windowId] = { tabs: [] };
  }
  const snapshot = snapshots[tab.windowId];
  snapshot.tabs = snapshot.tabs.filter(item => item.id !== tab.id);
  snapshot.tabs.splice(tab.index, 0, snapshotTab(tab));
  delete snapshot.lastTab;
  reindex(snapshot);
}));

browser.tabs.onUpdated.addListener((id, change, tab) => onTabEvent(() => {
  const snapshot = snapshots[tab.windowId];
  if (!snapshot || closingWindows.has(tab.windowId)) return;
  const index = snapshot.tabs.findIndex(item => item.id === id);
  if (index !== -1) snapshot.tabs[index] = { ...snapshotTab(tab), index };
}));

browser.tabs.onMoved.addListener((id, info) => onTabEvent(() => {
  const snapshot = snapshots[info.windowId];
  if (!snapshot || closingWindows.has(info.windowId)) return;
  const index = snapshot.tabs.findIndex(item => item.id === id);
  if (index === -1) return;
  const [tab] = snapshot.tabs.splice(index, 1);
  snapshot.tabs.splice(info.toIndex, 0, tab);
  reindex(snapshot);
}));

function removeSnapshotTab(id, windowId) {
  const snapshot = snapshots[windowId];
  if (!snapshot) return;
  const removed = snapshot.tabs.find(tab => tab.id === id);
  snapshot.tabs = snapshot.tabs.filter(tab => tab.id !== id);
  // Some close paths report the final tab removal before the window removal.
  if (!snapshot.tabs.length && removed) snapshot.lastTab = removed;
  reindex(snapshot);
}

browser.tabs.onRemoved.addListener((id, info) => {
  if (info.isWindowClosing) {
    // Keep the complete pre-close snapshot while Firefox removes every tab.
    return onTabEvent(() => closingWindows.add(info.windowId));
  }
  return onTabEvent(() => removeSnapshotTab(id, info.windowId));
});

browser.tabs.onDetached.addListener((id, info) => onTabEvent(() => {
  removeSnapshotTab(id, info.oldWindowId);
  if (snapshots[info.oldWindowId]) delete snapshots[info.oldWindowId].lastTab;
}));

browser.tabs.onAttached.addListener((id, info) => {
  // Read immediately; the tab could be gone by the time earlier writes finish.
  const tabResult = browser.tabs.get(id).catch(() => null);
  return onTabEvent(async () => {
    const tab = await tabResult;
    if (!tab || tab.incognito || closingWindows.has(info.newWindowId)) return;
    if (!snapshots[info.newWindowId]) {
      const win = await browser.windows.get(info.newWindowId);
      if (win.type !== "normal" || win.incognito) return;
      snapshots[info.newWindowId] = { tabs: [] };
    }
    const snapshot = snapshots[info.newWindowId];
    snapshot.tabs = snapshot.tabs.filter(item => item.id !== id);
    snapshot.tabs.splice(info.newPosition, 0, snapshotTab(tab));
    delete snapshot.lastTab;
    reindex(snapshot);
  });
});

browser.windows.onRemoved.addListener(windowId => queueAutoTask(async () => {
  const snapshot = snapshots[windowId];
  delete snapshots[windowId];
  closingWindows.delete(windowId);
  await persistSnapshots();
  if (!autoSettings.saveOnClose || !snapshot) return;
  const tabs = snapshot.tabs.length ? snapshot.tabs : snapshot.lastTab ? [snapshot.lastTab] : [];
  if (!tabs.length) return;
  const file = createTabExport(tabs, autoSettings.format);
  file.filename = file.filename.replace("firefox-tabs-", `firefox-tabs-window-${windowId}-`);
  const filename = savedFilename(file, autoSettings);
  await downloadTabFile(file, { filename, saveAs: false });
  await reportAutoSave("autoSaveStarted", [tabs.length, filename]);
}));

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || message?.type !== "save-settings") return undefined;
  return queueAutoTask(async () => {
    const settings = validateSettings(message.settings);
    const wasEnabled = autoSettings.saveOnClose;
    if (settings.saveOnClose && !wasEnabled) await seedSnapshots(false);
    if (!settings.saveOnClose) snapshots = {};
    await persistSnapshots();
    await browser.storage.local.set({ settings });
    autoSettings = settings;
    return { ok: true };
  }).catch(error => ({ ok: false, error: error.message || String(error) }));
});
