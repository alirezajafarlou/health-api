"use strict";

(() => {
    const savedTheme = localStorage.getItem("health-api-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");
})();
