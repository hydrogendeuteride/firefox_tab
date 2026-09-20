# Window Tabs

Export the current Firefox window's tabs as Markdown (default), text, or JSON. Drop an exported file to reopen tabs. Supports English and Korean, light and dark themes, and optional auto-save on window close.

Requires Firefox desktop 142+. No build dependencies.

## Use

1. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select `manifest.json`.
2. Click **Export tabs**, or **Import tabs** to drop an MD, TXT, or JSON file.
3. Open **Settings** to enable auto-save and choose a folder within Downloads.

Temporary installations are removed when Firefox exits. Click **Reload** after code changes.

Imports keep existing tabs and skip unsupported addresses. JSON restores pinned tabs; Markdown import supports this extension's link-list format. Auto-save excludes private windows and may not finish when Firefox exits.

## Development

```powershell
node --test tests/*.test.cjs
python scripts/package.py
```

See [Release](RELEASE.md) for distribution and [Privacy](PRIVACY.md) for data handling.
