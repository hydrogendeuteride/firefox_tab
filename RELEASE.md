# Release

## Package

```powershell
node --test tests/*.test.cjs
npx --yes web-ext lint --source-dir . --ignore-files "*.md" "tests/**" "scripts/**" "dist/**" ".preview/**"
python scripts/package.py
```

Output: `dist/window-tabs-<version>.zip`, containing runtime files and translations only. The package is unsigned.

## Publish

Upload the ZIP to the [AMO Developer Hub](https://addons.mozilla.org/developers/). Choose public listing or unlisted distribution, complete the listing and license details, and obtain a Mozilla-signed package. Keep the extension ID unchanged for updates.

Before submitting, verify export, file drop, and auto-save in Firefox. See [Mozilla's submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

## Listing summary

Save current-window tabs as Markdown, text, or JSON, and reopen them by dropping a file. Includes optional auto-save, a folder within Downloads, English and Korean, and light and dark themes. No analytics or remote server.

Auto-save may not finish when Firefox exits. Unsupported addresses are skipped during import. Requires Firefox desktop 142+.
