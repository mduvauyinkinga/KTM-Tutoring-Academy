const THEME_KEY = 'mdu_theme';

function applyTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
}

function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}

  // Fallback to system preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  return 'dark';
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_) {}
}

function syncToggleUI(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  const next = theme === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} mode`);
  btn.dataset.nextTheme = next;

  const icon = btn.querySelector('#themeToggleIcon');
  if (!icon) return;
} 




function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme);
  syncToggleUI(theme);

  const btn = document.getElementById('themeToggle');
  btn?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persistTheme(next);
    syncToggleUI(next);
  });
}

document.addEventListener('DOMContentLoaded', initTheme);




