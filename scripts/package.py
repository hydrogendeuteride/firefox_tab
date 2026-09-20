"""Create an unsigned AMO upload package using only runtime files."""
import json
import hashlib
import os
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
tag = os.environ.get("GITHUB_REF", "")
if tag.startswith("refs/tags/") and tag != f"refs/tags/v{manifest['version']}":
    raise SystemExit(f"Tag must match manifest version: v{manifest['version']}")
destination = root / "dist" / f"window-tabs-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
files = [root / "manifest.json", root / "icon.svg"]
for pattern in ("*.js", "*.html", "*.css", "_locales/*/messages.json"):
    files.extend(root.glob(pattern))
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for file in sorted(set(files)):
        archive.write(file, file.relative_to(root).as_posix())
with ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert "manifest.json" in archive.namelist()
    assert json.loads(archive.read("manifest.json"))["version"] == manifest["version"]
    assert all(not name.startswith(("tests/", "scripts/", ".preview/")) for name in archive.namelist())
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix(".sha256").write_text(f"{checksum}  {destination.name}\n", encoding="utf-8")
print(destination)
print(f"{len(files)} runtime files; unsigned, ready for AMO submission.")
