"use strict";

function tabGroupTitle(tabs) {
  return tabs.find(tab => tab.active)?.title?.trim() || t("untitled");
}

function tabFilename(tabs, now) {
  let title = tabGroupTitle(tabs).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/\s+/g, " ").replace(/^\.+/, "").trim();
  // At most 58 Unicode code points leaves room for the date and extension,
  // even when every character uses four UTF-8 bytes.
  title = [...title].slice(0, 58).join("").replace(/[. ]+$/, "") || "firefox-tabs";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)) title = `_${title}`;
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")].join("-");
  return `${title}-${date}`;
}

function createTabExport(tabs, format, now = new Date()) {
  const items = [...tabs].sort((a, b) => a.index - b.index).map(tab => ({
    title: tab.title || tab.url || t("untitled"),
    url: tab.url || "",
    pinned: Boolean(tab.pinned)
  }));
  let content;
  let extension = "txt";
  let mime = "text/plain";
  if (format === "json") {
    content = JSON.stringify({ exportedAt: now.toISOString(), tabs: items }, null, 2) + "\n";
    extension = "json";
    mime = "application/json";
  } else if (format === "urls") {
    content = items.map(tab => tab.url).join("\r\n") + "\r\n";
  } else if (format === "markdown") {
    content = items.map(tab => {
      const title = tab.title.replace(/[\r\n]+/g, " ")
        .replace(/[\\`*_[\]{}()<>#+.!|~&-]/g, "\\$&");
      const url = tab.url.replace(/[\s<>\\()[\]]/g, character =>
        encodeURIComponent(character).replace(/\(/g, "%28").replace(/\)/g, "%29")
      ).replace(/&/g, "&amp;");
      return `- [${title}](${url})`;
    }).join("\n") + "\n";
    extension = "md";
    mime = "text/markdown";
  } else if (format === "text") {
    content = items.map((tab, i) => `${i + 1}. ${tab.title.replace(/[\r\n]+/g, " ")}\r\n${tab.url}`).join("\r\n\r\n") + "\r\n";
  } else {
    throw new Error(t("unsupportedFormat"));
  }
  return { content, mime, filename: `${tabFilename(tabs, now)}.${extension}` };
}
