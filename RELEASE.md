# Release

## Package

```powershell
npm ci
npm test
npm run lint
npm run package
```

Requires Node.js 24 and Python 3.13+. Output: `dist/window-tabs-<version>.zip` and its `.sha256` checksum. The package contains runtime files and translations only and is unsigned.

## GitHub Actions

Push the workflow to GitHub to enable CI. Every push, pull request, or manual run tests on Linux and Windows and uploads an unsigned package artifact.

To create a draft release, update `manifest.json`, commit, and push a matching tag:

```sh
git tag v1.5.0
git push origin v1.5.0
```

Both platforms must pass. A tag/version mismatch fails the build. Reruns update draft assets but never overwrite a published release. No custom secrets are needed; Mozilla signing remains manual.

If a tag run did not start, run CI manually from the default branch and set `release_tag` to the existing tag. It checks out and verifies that tag before creating the draft.

## Publish

Upload the ZIP to the [AMO Developer Hub](https://addons.mozilla.org/developers/). Choose public listing or unlisted distribution, complete the listing and license details, and obtain a Mozilla-signed package. Keep the extension ID unchanged for updates.

Before submitting, verify export, file drop, and auto-save in Firefox. See [Mozilla's submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

## Listing summary

Save current-window tabs as Markdown, text, or JSON, and reopen them by dropping a file. Includes optional auto-save, a folder within Downloads, English and Korean, and light and dark themes. No analytics or remote server.

Auto-save may not finish when Firefox exits. Unsupported addresses are skipped during import. Requires Firefox desktop 142+.
