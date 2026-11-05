const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function event() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); },
    async emit(...args) { return Promise.all(listeners.map(fn => fn(...args))); } };
}

async function setup({ enabled = true, session = {}, windows, savedWindows = [] } = {}) {
  const normalTabs = [
    { id: 1, index: 0, title: '한글', url: 'https://a.example/', pinned: true, windowId: 7 },
    { id: 2, index: 1, title: '두 번째', url: 'https://b.example/', pinned: false, windowId: 7, active: true }
  ];
  windows ??= [{ id: 7, type: 'normal', incognito: false, tabs: normalTabs },
    { id: 8, type: 'normal', incognito: true, tabs: [{ ...normalTabs[0], windowId: 8 }] }];
  const local = { savedWindows, settings: { saveOnClose: enabled, saveToFolder: false, folder: 'Tabs/Backup', format: 'json' } };
  const storage = data => ({ async get(key) { return structuredClone({ [key]: data[key] }); },
    async set(value) { Object.assign(data, structuredClone(value)); } });
  const downloads = [];
  const browser = {
    i18n: { getMessage(key, args = []) {
      const messages = require('../_locales/en/messages.json');
      return messages[key]?.message.replace(/\$(\d+)/g, (_, n) => args[Number(n) - 1] ?? '') || '';
    } },
    storage: { local: storage(local), session: storage(session) },
    windows: { async getAll() { return structuredClone(windows); },
      async get(id) { return windows.find(win => win.id === id); }, onRemoved: event() },
    tabs: Object.fromEntries(['onCreated','onUpdated','onMoved','onRemoved','onDetached','onAttached','onActivated'].map(name => [name, event()])),
    runtime: { id: 'test', onMessage: event() }
  };
  browser.tabs.get = async id => normalTabs.find(tab => tab.id === id);
  const context = vm.createContext({ browser, console, URL, Blob, crypto: require('node:crypto').webcrypto,
    async downloadTabFile(file, options) { downloads.push({ file, options }); return 1; } });
  for (const file of ['i18n.js', 'settings.js', 'export.js', 'import.js', 'saved-windows.js', 'autosave.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  await vm.runInContext('autoQueue', context);
  return { context, browser, downloads, session, local, normalTabs };
}

test('closing preserves all tabs, latest title and order, with silent folder download', async () => {
  const app = await setup();
  const { browser, normalTabs } = app;
  const update = browser.tabs.onUpdated.emit(2, { title: '새 제목' }, { ...normalTabs[1], title: '새 제목' });
  const move = browser.tabs.onMoved.emit(2, { windowId: 7, toIndex: 0 });
  const remove1 = browser.tabs.onRemoved.emit(1, { windowId: 7, isWindowClosing: true });
  const remove2 = browser.tabs.onRemoved.emit(2, { windowId: 7, isWindowClosing: true });
  const close = browser.windows.onRemoved.emit(7);
  await Promise.all([update, move, remove1, remove2, close]);
  const saved = app.downloads[0];
  assert.equal(app.downloads.length, 1);
  assert.equal(saved.options.saveAs, false);
  assert.match(saved.options.filename, /^Tabs\/Backup\/새 제목-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(app.local.savedWindows[0].title, '새 제목');
  const tabs = JSON.parse(saved.file.content).tabs;
  assert.deepEqual(tabs.map(tab => tab.title), ['새 제목', '한글']);
  assert.equal(tabs[1].pinned, true);
  assert.equal(app.session.autoSnapshots[7], undefined);
});

test('individual tab deletion is excluded, last tab close is backed up', async () => {
  const app = await setup();
  await app.browser.tabs.onRemoved.emit(1, { windowId: 7, isWindowClosing: false });
  await app.browser.tabs.onRemoved.emit(2, { windowId: 7, isWindowClosing: false });
  await app.browser.windows.onRemoved.emit(7);
  assert.deepEqual(JSON.parse(app.downloads[0].file.content).tabs.map(tab => tab.url), ['https://b.example/']);
});

test('private windows and disabled setting produce no backup', async () => {
  const privateApp = await setup();
  assert.equal(privateApp.session.autoSnapshots[8], undefined);
  await privateApp.browser.windows.onRemoved.emit(8);
  assert.equal(privateApp.downloads.length, 0);
  assert.equal(privateApp.local.savedWindows.length, 0);
  const disabled = await setup({ enabled: false });
  await disabled.browser.windows.onRemoved.emit(7);
  assert.equal(disabled.downloads.length, 0);
});

test('background restart can save a window already absent from getAll', async () => {
  const initial = await setup();
  const resumed = await setup({ session: initial.session, windows: [] });
  await resumed.browser.windows.onRemoved.emit(7);
  assert.equal(JSON.parse(resumed.downloads[0].file.content).tabs.length, 2);
});

test('settings enable snapshots, disable clears snapshots, paths stay relative', async () => {
  const app = await setup({ enabled: false });
  for (const folder of ['C:\\Backups', '/tmp', '../outside', 'tabs/../outside', 'tabs//empty', 'CON', 'tabs.']) {
    assert.throws(() => app.context.validateSettings({ folder, format: 'json' }));
  }
  assert.equal(app.context.validateSettings({ folder: '한글\\탭', format: 'markdown' }).folder, '한글/탭');
  const send = saveOnClose => app.browser.runtime.onMessage.emit({ type: 'save-settings',
    settings: { saveOnClose, saveToFolder: true, folder: '', format: 'markdown' } }, { id: 'test' });
  await send(true);
  assert.equal(app.session.autoSnapshots[7].tabs.length, 2);
  await send(false);
  assert.deepEqual(app.session.autoSnapshots, {});
  await app.browser.windows.onRemoved.emit(7);
  assert.equal(app.downloads.length, 0);
});

test('a tab moved to another window is not saved with its old window', async () => {
  const app = await setup();
  await app.browser.tabs.onDetached.emit(1, { oldWindowId: 7 });
  await app.browser.windows.onRemoved.emit(7);
  assert.equal(JSON.parse(app.downloads[0].file.content).tabs.length, 1);
});

test('two normal windows each save their own tabs once', async () => {
  const app = await setup({ windows: [7, 9].map(id => ({ id, type: 'normal', incognito: false,
    tabs: [{ id: id * 10, index: 0, title: `창 ${id}`, url: `https://window${id}.example/` }] })) });
  await Promise.all([app.browser.windows.onRemoved.emit(7), app.browser.windows.onRemoved.emit(9)]);
  assert.equal(app.downloads.length, 2);
  assert.deepEqual(app.downloads.map(item => JSON.parse(item.file.content).tabs[0].title), ['창 7', '창 9']);
});

test('manual export respects direct-save setting and retains Blob downloads', async () => {
  const app = await setup();
  const calls = [];
  app.browser.tabs.query = async () => app.normalTabs;
  app.browser.downloads = { onChanged: event(), onErased: event(),
    async download(options) { calls.push(options); return calls.length; },
    async search() { return [{ state: 'complete' }]; } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), app.context);
  for (const direct of [false, true]) {
    app.local.settings.saveToFolder = direct;
    const result = await app.context.exportWindowTabs({ windowId: 7, format: 'markdown' });
    assert.equal(result.ok, true);
    assert.equal(calls.at(-1).saveAs, !direct);
    assert.match(calls.at(-1).url, /^blob:/);
    assert.match(calls.at(-1).filename, /^Tabs\/Backup\/두 번째-\d{4}-\d{2}-\d{2}\.md$/);
    assert.equal(calls.at(-1).conflictAction, 'uniquify');
    assert.equal(result.stored, true);
  }
  assert.equal(app.local.savedWindows.length, 2);
});

async function savedMessage(app, message, sender = { id: 'test' }) {
  const results = await app.browser.runtime.onMessage.emit(message, sender);
  return results.find(result => result !== undefined);
}

test('activation selects the saved title and is frozen during window close', async () => {
  const app = await setup();
  await app.browser.tabs.onActivated.emit({ windowId: 7, tabId: 1 });
  await app.browser.tabs.onRemoved.emit(1, { windowId: 7, isWindowClosing: true });
  await app.browser.tabs.onActivated.emit({ windowId: 7, tabId: 2 });
  await app.browser.windows.onRemoved.emit(7);
  assert.equal(app.local.savedWindows[0].title, '한글');
  assert.deepEqual(app.local.savedWindows[0].tabs.map(tab => tab.active), [true, false]);
  assert.match(app.downloads[0].file.filename, /^한글-/);
});

test('records survive restart, list newest five, and deletion leaves downloads intact', async () => {
  const app = await setup();
  for (let i = 0; i < 7; i++) {
    await app.context.saveWindowRecord([{ ...app.normalTabs[1], title: `Saved ${i}` }]);
  }
  const resumed = await setup({ savedWindows: app.local.savedWindows });
  const recent = await savedMessage(resumed, { type: 'list-saved', limit: 5 });
  assert.equal(recent.total, 7);
  assert.deepEqual(Array.from(recent.records, record => record.title), ['Saved 6', 'Saved 5', 'Saved 4', 'Saved 3', 'Saved 2']);
  assert.equal(recent.records[0].tabs, undefined);
  assert.equal((await savedMessage(resumed, { type: 'delete-saved', id: recent.records[0].id })).ok, true);
  assert.equal((await savedMessage(resumed, { type: 'list-saved' })).records.length, 6);
  assert.equal(resumed.local.savedWindows.some(record => record.id === recent.records[0].id), false);
  assert.equal(await savedMessage(resumed, { type: 'delete-saved', id: recent.records[1].id }, { id: 'foreign' }), undefined);
  assert.equal(resumed.downloads.length, 0);
});

test('concurrent saves and deletions do not lose unrelated records', async () => {
  const app = await setup();
  const oldId = await app.context.saveWindowRecord(app.normalTabs);
  await Promise.all([
    ...Array.from({ length: 10 }, () => app.context.saveWindowRecord(app.normalTabs)),
    savedMessage(app, { type: 'delete-saved', id: oldId })
  ]);
  assert.equal(app.local.savedWindows.length, 10);
  assert.equal(new Set(app.local.savedWindows.map(record => record.id)).size, 10);
  assert.equal(app.local.savedWindows.some(record => record.id === oldId), false);
});

test('file failure retains a usable record; storage failure still allows the file and later saves', async () => {
  const app = await setup();
  const download = app.context.downloadTabFile;
  app.context.downloadTabFile = async () => { throw new Error('Canceled'); };
  const file = app.context.createTabExport(app.normalTabs, 'json');
  const canceled = await app.context.saveTabBackup(app.normalTabs, file, {});
  assert.equal(canceled.stored, true);
  assert.equal(canceled.downloaded, false);
  assert.equal(canceled.warning, true);
  assert.equal(app.local.savedWindows.length, 1);
  const write = app.browser.storage.local.set;
  app.browser.storage.local.set = async () => { throw new Error('Quota exceeded'); };
  const failed = await app.context.saveTabBackup(app.normalTabs, file, {});
  assert.equal(failed.ok, false);
  app.context.downloadTabFile = download;
  const exported = await app.context.saveTabBackup(app.normalTabs, file, {});
  assert.equal(exported.ok, true);
  assert.equal(exported.stored, false);
  assert.equal(exported.downloaded, true);
  app.browser.storage.local.set = write;
  assert.equal((await app.context.saveTabBackup(app.normalTabs, file, {})).stored, true);
  assert.equal(app.local.savedWindows.length, 2);
});

test('manual private export downloads without retaining a library record', async () => {
  const app = await setup();
  app.browser.tabs.query = async () => app.normalTabs;
  const calls = [];
  app.browser.downloads = { onChanged: event(), onErased: event(),
    async download(options) { calls.push(options); return 1; }, async search() { return [{ state: 'complete' }]; } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), app.context);
  const result = await app.context.exportWindowTabs({ windowId: 8, format: 'json' });
  assert.equal(result.ok, true);
  assert.equal(result.stored, false);
  assert.equal(calls[0].incognito, true);
  assert.equal(app.local.savedWindows.length, 0);
});

function enableRestore(app, { failUrls = [] } = {}) {
  let nextId = 100;
  const tabs = [{ id: 99, windowId: 20, url: 'about:blank', pinned: false }];
  const created = [];
  const focused = [];
  const removedWindows = [];
  app.browser.downloads = { onChanged: event(), onErased: event() };
  app.browser.windows.create = async options => {
    created.push(options);
    return { id: 20, tabs: [...tabs] };
  };
  app.browser.windows.get = async id => ({ id });
  app.browser.windows.update = async (id, options) => { focused.push({ id, ...options }); };
  app.browser.windows.remove = async id => { removedWindows.push(id); };
  app.browser.tabs.query = async ({ windowId }) => tabs.filter(tab => tab.windowId === windowId);
  app.browser.tabs.create = async options => {
    if (failUrls.includes(options.url)) throw new Error('Tab creation failed');
    const tab = { id: nextId++, ...options };
    tabs.splice(options.index, 0, tab);
    return tab;
  };
  app.browser.tabs.update = async (id, options) => { Object.assign(tabs.find(tab => tab.id === id), options); };
  app.browser.tabs.remove = async ids => {
    for (const id of ids) tabs.splice(tabs.findIndex(tab => tab.id === id), 1);
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), app.context);
  return { tabs, created, focused, removedWindows };
}

test('restore opens a new window with order, duplicates, pinned and active state; skips unsafe URLs', async () => {
  const app = await setup();
  const id = await app.context.saveWindowRecord([
    ...app.normalTabs,
    { index: 2, url: app.normalTabs[1].url },
    { index: 3, url: 'javascript:alert(1)' }
  ]);
  const restored = enableRestore(app);
  const result = await savedMessage(app, { type: 'restore-saved', id });
  assert.equal(result.ok, true);
  assert.equal(result.created, 3);
  assert.equal(result.skipped, 1);
  assert.deepEqual(restored.tabs.map(tab => tab.url), ['https://a.example/', 'https://b.example/', 'https://b.example/']);
  assert.equal(restored.tabs[0].pinned, true);
  assert.equal(restored.tabs[1].active, true);
  assert.equal(restored.tabs.some(tab => tab.id === 99), false);
  assert.equal(restored.focused[0].id, 20);
  assert.equal(app.local.savedWindows.length, 1);
});

test('restore reports partial failure and never opens a window for missing or unsupported records', async () => {
  const app = await setup();
  const id = await app.context.saveWindowRecord(app.normalTabs);
  const restored = enableRestore(app, { failUrls: ['https://b.example/'] });
  const result = await savedMessage(app, { type: 'restore-saved', id });
  assert.equal(result.created, 1);
  assert.equal(result.failed, 1);
  assert.equal(restored.tabs[0].active, true);
  assert.equal((await savedMessage(app, { type: 'restore-saved', id: 'missing' })).ok, false);
  const unsupported = await app.context.saveWindowRecord([{ url: 'about:config' }]);
  assert.equal((await savedMessage(app, { type: 'restore-saved', id: unsupported })).ok, false);
  assert.equal(restored.created.length, 1);
});

test('concurrent restores of one record are rejected and all-failed restore closes its empty window', async () => {
  const app = await setup();
  const id = await app.context.saveWindowRecord(app.normalTabs);
  const restored = enableRestore(app, { failUrls: app.normalTabs.map(tab => tab.url) });
  const results = await Promise.all([
    savedMessage(app, { type: 'restore-saved', id }), savedMessage(app, { type: 'restore-saved', id })
  ]);
  assert.ok(results.every(result => !result.ok));
  assert.equal(restored.created.length, 1);
  assert.deepEqual(restored.removedWindows, [20]);
  assert.equal(app.local.savedWindows.length, 1);
});
