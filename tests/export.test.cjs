const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ t: () => 'Untitled' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'export.js'), 'utf8'), context);

test('each format uses the active title and local calendar date without changing export order', () => {
  const now = new Date(2026, 10, 5, 0, 15);
  const tabs = [
    { index: 1, active: true, title: '현재 탭', url: 'https://b.example/' },
    { index: 0, title: 'First', url: 'https://a.example/', pinned: true }
  ];
  for (const [format, extension] of [['text', 'txt'], ['urls', 'txt'], ['markdown', 'md'], ['json', 'json']]) {
    const file = context.createTabExport(tabs, format, now);
    assert.equal(file.filename, `현재 탭-2026-11-05.${extension}`);
    assert.ok(file.content.indexOf('https://a.example/') < file.content.indexOf('https://b.example/'));
  }
  assert.equal(JSON.parse(context.createTabExport(tabs, 'json', now).content).tabs[0].pinned, true);
  assert.equal(tabs[0].index, 1);
});

test('titles cannot become paths or unsafe filenames and long Unicode names fit a file component', () => {
  const now = new Date(2026, 10, 5);
  for (const title of ['../folder\\name:<bad>?*|\u0000', 'CON', 'NUL.txt', '...', '  ', '😀'.repeat(200), '한글'.repeat(200)]) {
    const { filename } = context.createTabExport([{ title, active: true }], 'json', now);
    assert.ok(!/[<>:"/\\|?*\x00-\x1f]/.test(filename), filename);
    assert.ok(!filename.startsWith('.'), filename);
    assert.ok(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename), filename);
    assert.ok(Buffer.byteLength(filename) <= 255, filename);
    assert.match(filename, /-2026-11-05\.json$/);
    assert.ok(!filename.includes('\uFFFD'));
  }
  assert.equal(context.createTabExport([{}], 'text', now).filename, 'Untitled-2026-11-05.txt');
});
