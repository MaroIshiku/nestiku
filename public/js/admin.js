import { initNestikuShell } from './nestiku-shell.js';

let settings = null;
let links = [];
let searchEngines = {};
let editingIndex = -1;
let geocodeTimer = null;
let user = null;

await initNestikuShell();
init();

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function isImageRef(value) {
  return /^(https?:|\/|\.{0,2}\/)/.test(value || '') || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(value || '');
}

function autoIcon(title) {
  return window.Nestiku?.initials(title) || 'N';
}

function normalizeHttpUrl(raw) {
  let value = String(raw || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /^[^\s.]+\.[^\s]+/.test(value)) {
    value = `https://${value}`;
  }
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL muss mit http:// oder https:// beginnen');
  return url.toString();
}

function domainColorIndex(rawUrl) {
  try {
    const clean = new URL(normalizeHttpUrl(rawUrl)).hostname.replace(/^www\./, '').toLowerCase();
    let hash = 0;
    for (let index = 0; index < clean.length; index += 1) {
      hash = ((hash << 5) - hash + clean.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % 10;
  } catch {
    return 0;
  }
}

function populateProfile() {
  const label = user?.displayName || user?.username || 'Nestiku';
  $('avatar-button').textContent = window.Nestiku.initials(label);
  $('profile-avatar').textContent = window.Nestiku.initials(label);
  $('profile-name').textContent = label;
  $('profile-id').textContent = user?.username ? `@${user.username}` : 'Admin';
  $('admin-data-dir').textContent = user?.dataDir || '-';
  $('admin-setup-state').textContent = user?.setupCompleted ? 'completed' : 'pending';
  $('admin-log-level').textContent = user?.logLevel || 'info';
}

function populateSettingsForm() {
  $('name').value = settings.name || '';
  $('latitude').value = settings.location.latitude;
  $('longitude').value = settings.location.longitude;
  $('location-name').value = settings.location.name || '';
  $('timezone').value = settings.location.timezone || '';
  $('weather-enabled').checked = !!settings.weather.enabled;
  $('weather-unit').value = settings.weather.unit || 'celsius';
  $('weather-refresh').value = settings.weather.refreshMinutes || 30;
  $('links-per-page').value = String(settings.display.linksPerPage || 6);
  $('dynamic-accent').checked = !!settings.display.dynamicAccent;

  $('search-engine').innerHTML = Object.entries(searchEngines).map(([key, engine]) => (
    `<option value="${escapeHTML(key)}">${escapeHTML(engine.name)}</option>`
  )).join('');
  $('search-engine').value = settings.display.searchEngine || 'duckduckgo';
}

function collectSettings() {
  return {
    name: $('name').value,
    location: {
      latitude: parseFloat($('latitude').value),
      longitude: parseFloat($('longitude').value),
      name: $('location-name').value,
      timezone: $('timezone').value
    },
    weather: {
      enabled: $('weather-enabled').checked,
      unit: $('weather-unit').value,
      refreshMinutes: parseInt($('weather-refresh').value, 10) || 30
    },
    display: {
      linksPerPage: parseInt($('links-per-page').value, 10) || 6,
      dynamicAccent: $('dynamic-accent').checked,
      searchEngine: $('search-engine').value
    }
  };
}

async function saveSettings() {
  const button = $('save-settings-btn');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectSettings())
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
    settings = data.settings;
    window.Nestiku.showToast('Einstellungen gespeichert.', 'success');
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function doGeocode(query) {
  const box = $('geocode-results');
  try {
    const response = await fetch(`/api/admin/geocode?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Geocoding fehlgeschlagen');
    box.classList.add('show');
    if (!data.results.length) {
      box.innerHTML = '<div class="psu-tonal-card"><p class="psu-card-text">Keine Treffer</p></div>';
      return;
    }
    box.innerHTML = data.results.map((result) => `
      <button class="psu-list-row" type="button" data-lat="${result.latitude}" data-lon="${result.longitude}" data-timezone="${escapeHTML(result.timezone || '')}" data-label="${escapeHTML(result.label || result.name)}">
        <svg class="psu-list-row__icon" aria-hidden="true"><use href="#psu-icon-search"></use></svg>
        <span>
          <span class="psu-list-row__label">${escapeHTML(result.label || result.name)}</span>
          <span class="psu-list-row__support">${escapeHTML(result.timezone || '')}</span>
        </span>
      </button>
    `).join('');
    box.querySelectorAll('[data-lat]').forEach((button) => {
      button.addEventListener('click', () => {
        $('latitude').value = button.dataset.lat;
        $('longitude').value = button.dataset.lon;
        $('timezone').value = button.dataset.timezone;
        $('location-name').value = button.dataset.label;
        box.classList.remove('show');
        box.innerHTML = '';
      });
    });
  } catch (error) {
    box.classList.add('show');
    box.innerHTML = `<div class="psu-tonal-card"><p class="psu-card-text">${escapeHTML(error.message)}</p></div>`;
  }
}

function iconPreviewHTML(icon, title) {
  const value = icon || autoIcon(title);
  return isImageRef(value) ? `<img src="${escapeHTML(value)}" alt="">` : escapeHTML(value);
}

function linkSummary(link, index) {
  const color = Number.isInteger(link.color) ? Math.max(0, Math.min(9, link.color)) : 0;
  return `
    <article class="psu-card nestiku-link-row">
      <span class="nestiku-link-icon nestiku-color-${color}">${iconPreviewHTML(link.icon, link.title)}</span>
      <span>
        <span class="nestiku-link-title">${escapeHTML(link.title)}</span>
        <span class="nestiku-link-domain">${escapeHTML(link.url)}</span>
      </span>
      <span class="nestiku-link-actions">
        <button class="psu-icon-button" type="button" data-action="up" data-index="${index}" aria-label="Nach oben"><svg><use href="#psu-icon-download"></use></svg></button>
        <button class="psu-icon-button" type="button" data-action="edit" data-index="${index}" aria-label="Bearbeiten"><svg><use href="#psu-icon-settings"></use></svg></button>
        <button class="psu-icon-button" type="button" data-action="delete" data-index="${index}" aria-label="Loeschen"><svg><use href="#psu-icon-close"></use></svg></button>
      </span>
    </article>
  `;
}

function linkEditor(link, index) {
  const color = Number.isInteger(link.color) ? Math.max(0, Math.min(9, link.color)) : domainColorIndex(link.url);
  return `
    <article class="psu-card nestiku-link-row is-editing" data-editor="${index}">
      <div class="nestiku-form-grid">
        <label class="psu-field">
          <span class="psu-label">Titel</span>
          <input class="psu-input" data-field="title" value="${escapeHTML(link.title || '')}">
        </label>
        <label class="psu-field">
          <span class="psu-label">URL</span>
          <input class="psu-input" data-field="url" value="${escapeHTML(link.url || '')}">
        </label>
        <label class="psu-field">
          <span class="psu-label">Icon oder Bildpfad</span>
          <input class="psu-input" data-field="icon" value="${escapeHTML(link.icon || '')}">
        </label>
        <div class="nestiku-field-row">
          <div class="psu-field">
            <span class="psu-label">Vorschau</span>
            <span class="nestiku-link-icon nestiku-color-${color}" data-role="preview">${iconPreviewHTML(link.icon, link.title)}</span>
          </div>
          <div class="psu-field">
            <span class="psu-label">Akzent</span>
            <div class="nestiku-color-grid">
              ${Array.from({ length: 10 }, (_, slot) => `<button class="nestiku-color-button nestiku-color-${slot}${slot === color ? ' is-selected' : ''}" type="button" data-color="${slot}" aria-label="Akzent ${slot + 1}"></button>`).join('')}
            </div>
          </div>
        </div>
        <div class="psu-card-actions">
          <button class="psu-button psu-button--tonal" type="button" data-action="fetch-icon" data-index="${index}">Favicon laden</button>
          <button class="psu-button psu-button--filled" type="button" data-action="apply" data-index="${index}">Uebernehmen</button>
          <button class="psu-button psu-button--text" type="button" data-action="cancel">Abbrechen</button>
        </div>
      </div>
    </article>
  `;
}

function renderLinkList() {
  $('links-count').textContent = `${links.length} Links`;
  $('link-list').innerHTML = links.map((link, index) => (
    index === editingIndex ? linkEditor(link, index) : linkSummary(link, index)
  )).join('');
}

function readEditor(index) {
  const row = document.querySelector(`[data-editor="${index}"]`);
  const title = row.querySelector('[data-field="title"]').value.trim();
  const url = normalizeHttpUrl(row.querySelector('[data-field="url"]').value);
  const icon = row.querySelector('[data-field="icon"]').value.trim();
  const selected = row.querySelector('.nestiku-color-button.is-selected');
  if (!title) throw new Error('Titel fehlt');
  return {
    title,
    url,
    icon: icon || autoIcon(title),
    color: selected ? parseInt(selected.dataset.color, 10) : domainColorIndex(url)
  };
}

async function loadFavicon(index) {
  const row = document.querySelector(`[data-editor="${index}"]`);
  const url = row.querySelector('[data-field="url"]').value.trim();
  if (!url) throw new Error('URL fehlt');
  const response = await fetch(`/api/admin/favicon?url=${encodeURIComponent(url)}`, { cache: 'no-cache' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.color) throw new Error(data.error || 'Kein Icon gefunden');
  if (data.icon) row.querySelector('[data-field="icon"]').value = data.icon;
  const color = Number.isInteger(data.color) ? data.color : domainColorIndex(url);
  row.querySelectorAll('.nestiku-color-button').forEach((button) => {
    button.classList.toggle('is-selected', parseInt(button.dataset.color, 10) === color);
  });
  updateEditorPreview(row);
}

function updateEditorPreview(row) {
  const title = row.querySelector('[data-field="title"]').value.trim();
  const icon = row.querySelector('[data-field="icon"]').value.trim();
  const color = row.querySelector('.nestiku-color-button.is-selected')?.dataset.color || 0;
  const preview = row.querySelector('[data-role="preview"]');
  preview.className = `nestiku-link-icon nestiku-color-${color}`;
  preview.innerHTML = iconPreviewHTML(icon, title);
}

async function saveLinks() {
  const button = $('save-links-btn');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
    window.Nestiku.showToast('Links gespeichert.', 'success');
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadCredentials() {
  const response = await fetch('/api/admin/credentials');
  const data = await response.json();
  $('current-username').value = data.username || '';
  $('new-display-name').value = data.displayName || '';
  $('new-email').value = data.email || '';
}

async function saveCredentials() {
  const currentPassword = $('current-password').value;
  const newPassword = $('new-password').value;
  const confirm = $('new-password-confirm').value;
  if (!currentPassword) {
    window.Nestiku.showToast('Aktuelles Passwort erforderlich.', 'error');
    return;
  }
  if (newPassword !== confirm) {
    window.Nestiku.showToast('Neue Passwoerter stimmen nicht ueberein.', 'error');
    return;
  }
  const button = $('save-credentials-btn');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword,
        newUsername: $('new-username').value.trim(),
        newDisplayName: $('new-display-name').value.trim(),
        newEmail: $('new-email').value.trim(),
        newPassword
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
    window.Nestiku.showToast('Anmeldedaten gespeichert.', 'success');
    $('current-password').value = '';
    $('new-password').value = '';
    $('new-password-confirm').value = '';
    await loadCredentials();
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
      ['settings', 'links', 'credentials'].forEach((id) => {
        $(`tab-${id}`).hidden = id !== button.dataset.tab;
      });
    });
  });

  $('save-settings-btn').addEventListener('click', saveSettings);
  $('save-links-btn').addEventListener('click', saveLinks);
  $('save-credentials-btn').addEventListener('click', saveCredentials);
  $('add-link-btn').addEventListener('click', () => {
    links.push({ title: '', url: '', icon: '', color: 0 });
    editingIndex = links.length - 1;
    renderLinkList();
  });

  $('location-search').addEventListener('input', (event) => {
    clearTimeout(geocodeTimer);
    const query = event.target.value.trim();
    if (query.length < 2) {
      $('geocode-results').classList.remove('show');
      $('geocode-results').innerHTML = '';
      return;
    }
    geocodeTimer = setTimeout(() => doGeocode(query), 350);
  });

  $('link-list').addEventListener('input', (event) => {
    const row = event.target.closest('[data-editor]');
    if (row) updateEditorPreview(row);
  });

  $('link-list').addEventListener('click', async (event) => {
    const color = event.target.closest('[data-color]');
    if (color) {
      color.closest('.nestiku-color-grid').querySelectorAll('[data-color]').forEach((button) => button.classList.remove('is-selected'));
      color.classList.add('is-selected');
      updateEditorPreview(color.closest('[data-editor]'));
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const index = parseInt(actionButton.dataset.index, 10);
    const action = actionButton.dataset.action;
    try {
      if (action === 'edit') editingIndex = index;
      if (action === 'cancel') editingIndex = -1;
      if (action === 'delete') {
        links.splice(index, 1);
        editingIndex = -1;
      }
      if (action === 'up' && index > 0) {
        [links[index - 1], links[index]] = [links[index], links[index - 1]];
      }
      if (action === 'apply') {
        links[index] = readEditor(index);
        editingIndex = -1;
      }
      if (action === 'fetch-icon') {
        await loadFavicon(index);
      }
      renderLinkList();
    } catch (error) {
      window.Nestiku.showToast(error.message, 'error');
    }
  });
}

async function init() {
  try {
    const response = await fetch('/api/admin/data', { cache: 'no-cache' });
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (response.status === 428) {
      window.location.href = '/setup';
      return;
    }
    if (!response.ok) throw new Error('Admin-Daten konnten nicht geladen werden.');
    const data = await response.json();
    settings = data.settings;
    links = data.links || [];
    searchEngines = data.searchEngines || {};
    user = data.user || {};
    populateProfile();
    populateSettingsForm();
    renderLinkList();
    bindEvents();
    await loadCredentials();
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
  }
}
