// ── theme.js — shared light/dark theme toggle (loaded by all pages) ──
(function () {
    const STORAGE_KEY = 'od-theme';
    const LIGHT = 'light';
    const DARK  = 'dark';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.setAttribute('aria-label', theme === DARK ? 'Switch to light mode' : 'Switch to dark mode');
            const sun = btn.querySelector('.theme-icon-sun');
            const moon = btn.querySelector('.theme-icon-moon');
            if (sun) sun.style.display = theme === DARK ? 'block' : 'none';
            if (moon) moon.style.display = theme === LIGHT ? 'block' : 'none';
        });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || DARK;
        applyTheme(current === DARK ? LIGHT : DARK);
    }

    // Apply saved theme immediately (before paint)
    const saved = localStorage.getItem(STORAGE_KEY) || DARK;
    document.documentElement.setAttribute('data-theme', saved);

    // Expose globally so inline onclick can call it too
    window.__odToggleTheme = toggleTheme;

    // Wire up buttons once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(localStorage.getItem(STORAGE_KEY) || DARK);
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.addEventListener('click', toggleTheme);
        });
    });
})();