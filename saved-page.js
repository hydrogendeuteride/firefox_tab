"use strict";

initializeSavedList();
document.getElementById("open-import").addEventListener("click", () => {
  window.location.href = browser.runtime.getURL("import.html");
});
document.getElementById("open-settings").addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch(error => {
    const status = document.getElementById("saved-status");
    status.dataset.error = "true";
    status.textContent = t("operationFailed", [error.message || String(error)]);
  });
});
