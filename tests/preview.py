"""Generate static localized UI fixtures, without browser permissions or actions."""
import html
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / ".preview"
out.mkdir(exist_ok=True)
for asset in [*root.glob("*.css"), root / "icon.svg"]:
    (out / asset.name).write_bytes(asset.read_bytes())
for locale in ("ko", "en"):
    messages = json.loads((root / "_locales" / locale / "messages.json").read_text(encoding="utf-8"))
    for page in ("popup", "import", "options"):
        source = (root / f"{page}.html").read_text(encoding="utf-8")
        source = re.sub(r'<script\b[^>]*>.*?</script>', '', source, flags=re.S)
        source = source.replace('lang="en"', f'lang="{locale}"').replace(' disabled', '')
        source = re.sub(r'(<([\w]+)\b[^>]*data-i18n="(\w+)"[^>]*>)[^<]*(</\2>)',
                        lambda m: m[1] + html.escape(messages[m[3]]["message"]) + m[4], source)
        source = source.replace(messages['loadingTabs']['message'], messages['windowTabCount']['message'].replace('$1', '12'))
        source = source.replace('placeholder="Firefox Tabs"', 'placeholder="Firefox Tabs" value="Firefox Tabs"')
        source = source.replace('<p id="path-preview" class="path-preview"></p>', '<p id="path-preview" class="path-preview">Downloads/Firefox Tabs</p>')
        for theme in ('light', 'dark'):
            fixture = source.replace('</head>', f'<style>:root {{ color-scheme: {theme}; }}</style></head>')
            (out / f'{page}-{locale}-{theme}.html').write_text(fixture, encoding='utf-8')
print(out)
