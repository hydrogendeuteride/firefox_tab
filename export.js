"use strict";

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
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return { content, mime, filename: `firefox-tabs-${timestamp}.${extension}` };
}
