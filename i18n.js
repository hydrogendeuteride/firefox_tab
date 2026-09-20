"use strict";

function t(key, substitutions = []) {
  return browser.i18n.getMessage(key, substitutions.map(String)) || key;
}

if (typeof document !== "undefined") {
  // Loaded with defer: translate before page scripts populate dynamic statuses.
  document.documentElement.lang = browser.i18n.getUILanguage().startsWith("ko") ? "ko" : "en";
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-label]").forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nLabel));
  });
}
