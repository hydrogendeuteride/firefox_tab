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

async function setup({ enabled = true, session = {}, windows } = {}) {
  const normalTabs = [
    { id: 1, index: 0, title: '한글', url: 'https://a.example/', pinned: true, windowId: 7 },
    { id: 2, index: 1, title: '두 번째', url: 'https://b.example/', pinned: false, windowId: 7 }
  ];
  windows ??= [{ id: 7, type: 'normal', incognito: false, tabs: normalTabs },
    { id: 8, type: 'normal', incognito: true, tabs: [{ ...normalTabs[0], windowId: 8 }] }];
  const local = { settings: { saveOnClose: enabled, saveToFolder: false, folder: 'Tabs/Backup', format: 'json' } };
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
    tabs: Object.fromEntries(['onCreated','onUpdated','onMoved','onRemoved','onDetached','onAttached'].map(name => [name, event()])),
    runtime: { id: 'test', onMessage: event() }
  };
  browser.tabs.get = async id => normalTabs.find(tab => tab.id === id);
  const context = vm.createContext({ browser, console, URL, Blob,
    async downloadTabFile(file, options) { downloads.push({ file, options }); return 1; } });
  for (const file of ['i18n.js', 'settings.js', 'export.js', 'autosave.js']) {
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
  assert.match(saved.options.filename, /^Tabs\/Backup\/firefox-tabs-window-7-.*\.json$/);
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
    assert.match(calls.at(-1).filename, /^Tabs\/Backup\/.*\.md$/);
  }
});
