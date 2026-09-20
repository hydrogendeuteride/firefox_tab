"""Create an unsigned AMO upload package using only runtime files."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
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
    assert all(not name.startswith(("tests/", "scripts/", ".preview/")) for name in archive.namelist())
print(destination)
print(f"{len(files)} runtime files; unsigned, ready for AMO submission.")
