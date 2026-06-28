import {
  initPixelSoftUtilityApp
} from './psu/app-shell.js';
import {
  PSU_MODES,
  PSU_THEMES,
  setPixelSoftUtilityMode,
  setPixelSoftUtilityTheme
} from './psu/theme-controller.js';

const THEME_LABELS = {
  lavender: 'Lavender',
  mint: 'Mint',
  sky: 'Sky',
  amber: 'Amber',
  rose: 'Rose',
  graphite: 'Graphite'
};

const MODE_LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
};

let toastTimer = null;

export async function initNestikuShell() {
  await injectIconSprite();
  const config = await loadManifest();
  initPixelSoftUtilityApp(config);
  bindThemeControls();
  bindLogoutControls();
  window.Nestiku = {
    config,
    showToast,
    initials
  };
  window.dispatchEvent(new CustomEvent('nestiku:shell-ready', { detail: { config } }));
  return config;
}

export function showToast(message, type = '') {
  const toast = document.querySelector('[data-nestiku-toast]');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `nestiku-toast show${type ? ` ${type}` : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'nestiku-toast';
  }, 3200);
}

export function initials(value) {
  const text = String(value || '').trim();
  if (!text) return 'N';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

async function loadManifest() {
  const response = await fetch('/app.manifest.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('App-Manifest konnte nicht geladen werden.');
  return response.json();
}

async function injectIconSprite() {
  const host = document.getElementById('icon-sprite');
  if (!host || host.dataset.loaded) return;
  const response = await fetch('/icons/psu-icons.svg', { cache: 'force-cache' });
  if (!response.ok) return;
  host.innerHTML = await response.text();
  host.dataset.loaded = 'true';
}

function bindThemeControls() {
  document.querySelectorAll('[data-theme-picker]').forEach((host) => {
    host.innerHTML = PSU_THEMES.map((theme) => (
      `<button class="psu-button psu-button--outlined nestiku-theme-button" type="button" data-theme-value="${theme}">${THEME_LABELS[theme]}</button>`
    )).join('');
  });

  document.querySelectorAll('[data-mode-picker]').forEach((host) => {
    host.innerHTML = PSU_MODES.map((mode) => (
      `<button type="button" data-mode-value="${mode}" aria-selected="false">${MODE_LABELS[mode]}</button>`
    )).join('');
  });

  document.addEventListener('click', (event) => {
    const themeButton = event.target.closest('[data-theme-value]');
    const modeButton = event.target.closest('[data-mode-value]');
    if (themeButton) setPixelSoftUtilityTheme(themeButton.dataset.themeValue);
    if (modeButton) setPixelSoftUtilityMode(modeButton.dataset.modeValue);
    updateThemeControls();
  });

  window.addEventListener('psu:themechange', updateThemeControls);
  updateThemeControls();
}

function updateThemeControls() {
  const root = document.documentElement;
  document.querySelectorAll('[data-theme-value]').forEach((button) => {
    const selected = button.dataset.themeValue === root.dataset.theme;
    button.classList.toggle('psu-button--filled', selected);
    button.classList.toggle('psu-button--outlined', !selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-mode-value]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.modeValue === root.dataset.mode));
  });
}

function bindLogoutControls() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-logout]');
    if (!button) return;
    button.disabled = true;
    try {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      button.disabled = false;
      showToast('Logout fehlgeschlagen.', 'error');
    }
  });
}
