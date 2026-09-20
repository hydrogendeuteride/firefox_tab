const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const en = require('../_locales/en/messages.json');
const ko = require('../_locales/ko/messages.json');

test('both locales cover every message and substitution', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  for (const key of Object.keys(en)) {
    assert.ok(en[key].message.trim());
    assert.ok(ko[key].message.trim());
    assert.deepEqual(en[key].message.match(/\$\d+/g), ko[key].message.match(/\$\d+/g));
  }
  for (const file of fs.readdirSync(root).filter(name => /\.(html|js|json)$/.test(name))) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    const keys = [...content.matchAll(/\bt\("([\w]+)"|data-i18n(?:-label)?="(\w+)"|__MSG_(\w+)__/g)];
    for (const match of keys) assert.ok(en[match[1] || match[2] || match[3]], `${file}: ${match[0]}`);
    assert.ok(!/[가-힣]/.test(content), `${file} contains unlocalized Korean`);
  }
});

test('errors and Markdown round trips work in both locales', () => {
  for (const messages of [en, ko]) {
    const context = vm.createContext({ URL, browser: { i18n: {
      getMessage(key, args = []) { return messages[key]?.message.replace(/\$(\d+)/g, (_, n) => args[Number(n) - 1] ?? '') || ''; }
    } } });
    for (const file of ['i18n.js', 'export.js', 'import.js', 'settings.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
    }
    assert.throws(() => context.parseTabImport(''), { message: messages.emptyFile.message });
    const file = context.createTabExport([{index:0,title:'한글 [title] 😀',url:'https://example.org/a(b)?x=1&y=2'}], 'markdown');
    const parsed = context.parseTabImport(file.content, file.filename);
    assert.equal(parsed.tabs[0].url, 'https://example.org/a%28b%29?x=1&y=2');
    assert.equal(context.t('windowTabCount', [12]), messages.windowTabCount.message.replace('$1', '12'));
  }
});
