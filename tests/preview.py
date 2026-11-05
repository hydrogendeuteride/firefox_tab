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
    for page in ("popup", "import", "options", "saved"):
        source = (root / f"{page}.html").read_text(encoding="utf-8")
        source = re.sub(r'<script\b[^>]*>.*?</script>', '', source, flags=re.S)
        source = source.replace('lang="en"', f'lang="{locale}"').replace(' disabled', '')
        source = re.sub(r'(<([\w]+)\b[^>]*data-i18n="(\w+)"[^>]*>)[^<]*(</\2>)',
                        lambda m: m[1] + html.escape(messages[m[3]]["message"]) + m[4], source)
        source = source.replace(messages['loadingTabs']['message'], messages['windowTabCount']['message'].replace('$1', '12'))
        source = source.replace('placeholder="Firefox Tabs"', 'placeholder="Firefox Tabs" value="Firefox Tabs"')
        source = source.replace('<p id="path-preview" class="path-preview"></p>', '<p id="path-preview" class="path-preview">Downloads/Firefox Tabs</p>')
        if page in ("popup", "saved"):
            titles = ["자료 조사", "작업 메모", "다음 주 여행 계획", "Firefox 확장 개발", "읽을 거리"] if locale == "ko" else ["Research", "Work notes", "Travel plans", "Firefox extension", "Reading list"]
            records = []
            for index, title in enumerate(titles):
                date = f"11.{5-index:02}" if page == "popup" else f"2026-11-0{5-index} 14:30"
                details = messages["savedDetailsCompact" if page == "popup" else "savedDetails"]["message"].replace("$1", date).replace("$2", str(12-index*2))
                icons = []
                for key, name, shape in [("restoreNewWindow", "restore-saved", "M14 3h7v7m0-7L11 13M10 5H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"),
                                         ("deleteSaved", "delete-saved", "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7")]:
                    label = html.escape(messages[key]["message"])
                    icons.append(f'<button class="icon-button {name}" title="{label}" aria-label="{label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="{shape}"/></svg></button>')
                records.append(f'<article class="saved-item"><h3>{html.escape(title)}</h3>'
                               f'<p class="saved-meta">{html.escape(details)}</p><div class="saved-actions">'
                               + ''.join(icons) + '</div></article>')
            source = source.replace('<div id="saved-list" class="saved-list" aria-busy="true"></div>',
                                    '<div id="saved-list" class="saved-list">' + ''.join(records) + '</div>')
        for theme in ('light', 'dark'):
            fixture = source.replace('</head>', f'<style>:root {{ color-scheme: {theme}; }}</style></head>')
            (out / f'{page}-{locale}-{theme}.html').write_text(fixture, encoding='utf-8')
print(out)
