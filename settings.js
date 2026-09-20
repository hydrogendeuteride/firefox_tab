"use strict";

const DEFAULT_SETTINGS = {
  saveOnClose: false,
  saveToFolder: false,
  folder: "Firefox Tabs",
  format: "markdown"
};

function validateSettings(value) {
  const folder = String(value.folder ?? "").trim().replace(/\\/g, "/");
  if (folder && folder.split("/").some(part =>
    !part || /^\./.test(part) || /[. ]$/.test(part) || /[<>:"|?*\x00-\x1f]/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  )) throw new Error(t("invalidFolder"));
  if (!["text", "urls", "markdown", "json"].includes(value.format)) {
    throw new Error(t("invalidFormat"));
  }
  return { saveOnClose: value.saveOnClose === true, saveToFolder: value.saveToFolder === true,
    folder, format: value.format };
}

async function readSettings() {
  const { settings } = await browser.storage.local.get("settings");
  return validateSettings({ ...DEFAULT_SETTINGS, ...settings });
}

function savedFilename(file, settings) {
  return settings.folder ? `${settings.folder}/${file.filename}` : file.filename;
}
