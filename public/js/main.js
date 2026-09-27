// Light/dark theme toggle. The initial theme is already set (before this
// script even loads) by the inline anti-flash script in the page <head>,
// which reads localStorage or falls back to the OS preference. This script
// only needs to handle the button click and persist the choice.
(function () {
    var STORAGE_KEY = "theme";
    var toggleButton = document.getElementById("themeToggle");
    var icon = document.getElementById("themeToggleIcon");

    function applyIcon(theme) {
        if (icon) {
            icon.textContent = theme === "dark" ? "☀️" : "🌙";
        }
    }

    var currentTheme = document.documentElement.getAttribute("data-bs-theme") || "light";
    applyIcon(currentTheme);

    if (toggleButton) {
        toggleButton.addEventListener("click", function () {
            currentTheme = currentTheme === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-bs-theme", currentTheme);
            try {
                localStorage.setItem(STORAGE_KEY, currentTheme);
            } catch (e) {
                // localStorage may be unavailable (private browsing, etc.);
                // the toggle still works for the current page view.
            }
            applyIcon(currentTheme);
        });
    }
})();
