# Window Tabs

Export Firefox tabs as Markdown, text, or JSON. Drop an exported file to reopen tabs. English and Korean supported. Requires Firefox desktop 142+.

Load `manifest.json` through `about:debugging` to try it. Use **Settings** for auto-save and the download folder. Auto-save may not finish when Firefox exits.

```sh
npm ci
npm test
npm run lint
npm run package
```

Package: `dist/window-tabs-<version>.zip`.

[Release](RELEASE.md) · [Privacy](PRIVACY.md)
