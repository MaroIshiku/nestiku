import { state } from './state.js';

export function initTheme() {
  const theme = getStoredTheme();
  const mode = getStoredMode();
  applyTheme(theme, mode, false);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getStoredTheme(), getStoredMode(), false));
}

export function applyTheme(theme, mode, persist = true) {
  if (!state.themes.includes(theme)) theme = 'lavender';
  if (!state.modes.includes(mode)) mode = 'system';
  const resolved = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.resolvedMode = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#141218' : '#f9f6ff');
  if (persist) {
    localStorage.setItem('nestiku-theme', theme);
    localStorage.setItem('nestiku-mode', mode);
  }
}

export function getStoredTheme() { return localStorage.getItem('nestiku-theme') || 'lavender'; }
export function getStoredMode() { return localStorage.getItem('nestiku-mode') || 'system'; }
