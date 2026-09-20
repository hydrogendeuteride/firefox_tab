"use strict";

function normalizeImportTab(item) {
  if (!item || typeof item.url !== "string") return null;
  const url = item.url.trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) &&
        !["about:blank", "about:newtab"].includes(url)) return null;
  } catch {
    return null;
  }
  return { url, pinned: item.pinned === true };
}

function parseTabImport(text, filename = "") {
  const input = text.replace(/^\uFEFF/, "").trim();
  if (!input) throw new Error(t("emptyFile"));
  let items;
  if (/\.json$/i.test(filename) || /^[{\[]/.test(input)) {
    let data;
    try { data = JSON.parse(input); }
    catch { throw new Error(t("invalidJson")); }
    items = Array.isArray(data) ? data : data?.tabs;
    if (!Array.isArray(items)) throw new Error(t("missingTabs"));
  } else {
    const lines = input.split(/\r?\n/);
    items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Exported titles start with a number; only the next line is the URL.
      const markdownLink = line.match(/^[-*+]\s+\[(?:\\.|[^\]\\])*\]\((.*)\)$/);
      if (markdownLink) {
        // Our Markdown exporter escapes ampersands once; percent escapes stay intact.
        items.push({ url: markdownLink[1].replace(/&amp;/g, "&") });
      } else if (/^\d+\.\s/.test(line)) {
        items.push({ url: (lines[++i] || "").trim() });
      } else {
        items.push({ url: line });
      }
    }
  }
  const tabs = items.map(normalizeImportTab).filter(Boolean);
  return { tabs, skipped: items.length - tabs.length };
}
