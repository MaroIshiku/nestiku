import { api } from './js/api.js';
import {
  $,
  $$,
  app,
  debounce,
  directUrl,
  domain,
  escapeAttr,
  escapeHTML,
  field,
  iconOrText,
  initials,
  safeColor,
  selectField,
  toast
} from './js/dom.js';
import { icon } from './js/icons.js';
import { closeSheet, openSheet, sheetHeader } from './js/sheets.js';
import { MODE_LABELS, state, THEME_LABELS, WEEKDAYS } from './js/state.js';
import { applyTheme, getStoredMode, getStoredTheme, initTheme } from './js/theme.js';

boot();

async function boot() {
  initTheme();
  window.addEventListener('hashchange', handleHashRoute);
  await loadBootstrap();
  if (state.setup?.required) return renderSetup();
  if (!state.authenticated) return renderLogin();
  await loadAppData();
  renderStart();
}

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  Object.assign(state, {
    app: data.app,
    setup: data.setup,
    authenticated: data.authenticated,
    user: data.user,
    searchEngines: data.searchEngines || {},
    themes: data.themes || state.themes,
    modes: data.modes || state.modes
  });
}

async function loadAppData() {
  const data = await api('/api/data');
  Object.assign(state, {
    app: data.app,
    user: data.user,
    settings: data.settings,
    links: data.links || [],
    searchEngines: data.searchEngines || {}
  });
  applyTheme(data.settings?.display?.theme || getStoredTheme(), data.settings?.display?.mode || getStoredMode(), false);
}

function shell(content, actions = '') {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="logo-box" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
        <div class="title-stack">
          <h1>Nestiku</h1>
          <p>Personal Startpage</p>
        </div>
        <div class="spacer"></div>
        ${actions}
      </div>
    </header>
    <main class="main">${content}</main>
  `;
}

function renderSetup() {
  const error = state.setup?.configured ? '' : `
    <div class="tonal-card">
      <h2 class="card-title">Setup noch nicht bereit</h2>
      <p class="card-text">${escapeHTML(state.setup?.error || 'Setup-Secret fehlt.')}</p>
    </div>
  `;
  app().innerHTML = `
    <main class="auth-screen">
      <section class="card auth-window" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div class="brand">
          <div class="logo-large" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
          <div>
            <h1 id="setup-title">Admin einrichten</h1>
            <p>Erstelle den ersten Adminaccount fuer Nestiku.</p>
          </div>
        </div>
        ${error}
        <form class="form" id="setup-form">
          ${field('Setup-Secret', 'setupSecret', 'password', 'one-time-code')}
          ${field('Anzeigename', 'displayName', 'text', 'name')}
          ${field('Admin-Benutzername', 'username', 'text', 'username')}
          ${field('E-Mail optional', 'email', 'email', 'email', false)}
          ${field('Admin-Passwort', 'password', 'password', 'new-password')}
          ${field('Passwort wiederholen', 'passwordConfirm', 'password', 'new-password')}
          <div class="tonal-card card-text">Mindestens 12 Zeichen, nicht identisch mit Setup-Secret, Benutzername oder App-Name.</div>
          <button class="button filled full" type="submit" ${state.setup?.configured ? '' : 'disabled'}>Adminaccount erstellen</button>
        </form>
      </section>
    </main>
  `;
  $('#setup-form')?.addEventListener('submit', submitSetup);
  $('[name="setupSecret"]')?.focus();
}

async function submitSetup(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (body.password !== body.passwordConfirm) return toast('Passwoerter stimmen nicht ueberein.', 'error');
  if ((body.password || '').length < 12) return toast('Passwort ist zu kurz.', 'error');
  await api('/api/setup/register', { method: 'POST', body });
  toast('Adminaccount erstellt.');
  await loadBootstrap();
  await loadAppData();
  renderStart();
}

function renderLogin() {
  app().innerHTML = `
    <main class="auth-screen">
      <section class="card auth-window" aria-labelledby="login-title">
        <div class="brand">
          <div class="logo-large" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
          <div>
            <h1 id="login-title">Nestiku</h1>
            <p>Personal Startpage</p>
          </div>
        </div>
        <form class="form" id="login-form">
          ${field('Benutzername', 'username', 'text', 'username')}
          ${field('Passwort', 'password', 'password', 'current-password')}
          <button class="button filled full" type="submit">Anmelden</button>
        </form>
      </section>
    </main>
  `;
  $('#login-form').addEventListener('submit', submitLogin);
  $('[name="username"]')?.focus();
}

async function submitLogin(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api('/api/login', { method: 'POST', body });
  await loadBootstrap();
  await loadAppData();
  renderStart();
}

function renderStart() {
  closeSheet();
  clearTimers();
  state.activeAdminTab ||= 'settings';
  app().innerHTML = shell(`
    <div class="dashboard">
      <section class="hero-card hero" aria-labelledby="greeting">
        <p class="date" id="date"></p>
        <p class="time" id="time">--:--</p>
        <h2 class="greeting" id="greeting">Hallo</h2>
        <form id="search-form" class="search-row" role="search">
          <label class="visually-hidden" for="search-input">Suchen oder URL eingeben</label>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="m19.6 21-6.3-6.3q-.75.6-1.72.95-.98.35-2.08.35-2.73 0-4.61-1.89Q3 12.23 3 9.5t1.89-4.61Q6.77 3 9.5 3t4.61 1.89Q16 6.77 16 9.5q0 1.1-.35 2.08-.35.97-.95 1.72l6.3 6.3-1.4 1.4ZM9.5 14q1.88 0 3.19-1.31Q14 11.38 14 9.5t-1.31-3.19Q11.38 5 9.5 5T6.31 6.31Q5 7.62 5 9.5t1.31 3.19Q7.62 14 9.5 14Z"/></svg>
          <input class="input" id="search-input" type="search" placeholder="Suchen oder URL eingeben" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="search-badge">${escapeHTML(currentEngine().label)}</span>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Schnellzugriff</h2>
            <p>${state.editingLinks ? 'Bearbeitung aktiv' : (state.links.length ? `${state.links.length} Links` : 'Noch leer')}</p>
          </div>
          <button class="button ${state.editingLinks ? 'tonal' : 'text'}" type="button" data-action="links-edit">${state.editingLinks ? 'Fertig' : 'Bearbeiten'}</button>
        </div>
        ${renderLinks()}
        ${state.editingLinks ? renderLinkTools() : ''}
      </section>
    </div>
  `, `
    <button class="icon-button" type="button" data-action="links-edit" aria-label="Links bearbeiten">${icon('edit')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profil">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
  `);
  bindGlobalActions();
  if (state.editingLinks) bindLinkEditor();
  $$('[data-page]').forEach((button) => button.addEventListener('click', () => {
    state.linkPage = Number(button.dataset.page);
    renderStart();
  }));
  $('#search-form').addEventListener('submit', submitSearch);
  updateClock();
  state.clockTimer = setInterval(updateClock, 1000);
  fetchWeather();
  state.weatherTimer = setInterval(fetchWeather, Math.max(5, state.settings.weather.refreshMinutes || 30) * 60 * 1000);
}

function renderLinks() {
  if (!state.links.length) {
    return `
      <div class="empty tonal-card">
        <div class="logo-large" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
        <div>
          <h3 class="card-title">Noch keine Links</h3>
          <p class="card-text">Lege deine ersten Schnellzugriffe direkt hier an.</p>
        </div>
        <button class="button filled" type="button" data-action="links-edit">Links anlegen</button>
      </div>
    `;
  }
  const perPage = state.settings.display.linksPerPage || 6;
  const pages = [];
  for (let index = 0; index < state.links.length; index += perPage) pages.push(state.links.slice(index, index + perPage));
  if (state.linkPage >= pages.length) state.linkPage = Math.max(0, pages.length - 1);
  const page = pages[state.linkPage] || [];
  return `<div class="links-grid">${page.map((link) => `
    ${state.editingLinks ? `<button class="card link-card editable-link" type="button" data-link-edit="${state.links.indexOf(link)}">` : `<a class="card link-card" href="${escapeAttr(link.url)}" rel="noopener noreferrer">`}
      <span class="link-icon c${safeColor(link.color)}">${iconOrText(link.icon, link.title)}</span>
      <span><span class="link-title">${escapeHTML(link.title)}</span><span class="link-domain">${escapeHTML(domain(link.url))}</span></span>
      ${state.editingLinks ? `<span class="edit-chip">${icon('edit')}Bearbeiten</span>` : ''}
    ${state.editingLinks ? '</button>' : '</a>'}
  `).join('')}</div>${pages.length > 1 ? `<div class="pager">${pages.map((_, index) => `<button class="pager-dot" type="button" data-page="${index}" aria-current="${index === state.linkPage}">${index + 1}</button>`).join('')}</div>` : ''}`;
}

function renderLinkTools() {
  return `
    <div class="link-manager">
      <div class="section-head compact">
        <div>
          <h2>Links bearbeiten</h2>
          <p>${state.links.length} Schnellzugriffe</p>
        </div>
        <div class="mini-actions">
          <button class="icon-button tonal-icon" type="button" data-link-add aria-label="Link hinzufuegen">${icon('plus')}</button>
          <button class="icon-button tonal-icon" type="button" data-link-save aria-label="Links speichern">${icon('save')}</button>
        </div>
      </div>
      <div class="link-editor-list" id="link-list">
        ${state.links.map((link, index) => linkRow(link, index)).join('')}
      </div>
      ${state.links.length ? '<p class="card-text save-hint">Aenderungen werden erst mit Speichern dauerhaft uebernommen.</p>' : ''}
    </div>
  `;
}

function renderAdmin() {
  closeSheet();
  clearTimers();
  state.activeAdminTab ||= 'settings';
  app().innerHTML = shell(`
    <section class="settings-hero">
      <div>
        <h2>Settings</h2>
        <p>Profil, Darstellung, Suche, Standort, Wetter und Anmeldung sauber getrennt.</p>
      </div>
      <div class="actions">
        <button class="button filled" type="button" data-action="start">Startseite</button>
      </div>
    </section>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Einstellungsbereiche">
        ${tabButton('settings', 'Allgemein', 'Profil, Suche, Standort')}
        ${tabButton('appearance', 'Darstellung', 'Theme, Modus, Raster')}
        ${tabButton('account', 'Anmeldung', 'Profil und Passwort')}
      </nav>
      <section class="card settings-panel">${adminPanel()}</section>
    </div>
  `, `
    <button class="icon-button" type="button" data-action="info" aria-label="Info">${icon('info')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profil">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
  `);
  bindGlobalActions();
  bindAdmin();
}

function tabButton(id, label, support = '') {
  return `<button type="button" data-tab="${id}" aria-selected="${state.activeAdminTab === id}"><strong>${label}</strong>${support ? `<span>${support}</span>` : ''}</button>`;
}

function adminPanel() {
  if (state.activeAdminTab === 'appearance') return appearancePanel();
  if (state.activeAdminTab === 'account') return accountPanel();
  return settingsPanel();
}

function settingsPanel() {
  const s = state.settings;
  return `
    <div class="section-head"><div><h2>Allgemein</h2><p>Name, Standort, Wetter und Standardsuche</p></div></div>
    <form class="form" id="settings-form">
      <div class="settings-group">
        <h3>Profil</h3>
        ${field('Anzeige-Name', 'name', 'text', 'name', true, s.name || '')}
      </div>
      <div class="settings-group">
        <h3>Standort</h3>
        ${field('Standort suchen', 'locationSearch', 'search', 'off', false, '', 'Hamburg, Berlin, Stuhr')}
        <div id="geocode-results" class="list"></div>
        <div class="form-row">
          ${field('Latitude', 'latitude', 'number', 'off', true, s.location.latitude)}
          ${field('Longitude', 'longitude', 'number', 'off', true, s.location.longitude)}
        </div>
        ${field('Standortname', 'locationName', 'text', 'off', false, s.location.name || '')}
        ${field('Zeitzone', 'timezone', 'text', 'off', true, s.location.timezone || 'Europe/Berlin')}
      </div>
      <div class="settings-group">
        <h3>Wetter und Suche</h3>
        <div class="form-row">
          ${selectField('Wetter-Einheit', 'weatherUnit', [['celsius', 'Celsius'], ['fahrenheit', 'Fahrenheit']], s.weather.unit)}
          ${field('Refresh-Minuten', 'weatherRefresh', 'number', 'off', true, s.weather.refreshMinutes)}
        </div>
        <label class="list-row toggle-row"><span></span><span><strong>Wetter anzeigen</strong><span class="support">Open-Meteo ohne API-Key</span></span><input type="checkbox" name="weatherEnabled" ${s.weather.enabled ? 'checked' : ''}></label>
        ${selectField('Suchmaschine', 'searchEngine', Object.entries(state.searchEngines).map(([key, value]) => [key, value.name]), s.display.searchEngine)}
      </div>
      <div class="actions"><button class="button filled" type="submit">Speichern</button></div>
    </form>
  `;
}

function appearancePanel() {
  const s = state.settings;
  return `
    <div class="section-head"><div><h2>Darstellung</h2><p>Optik und Schnellzugriff-Raster</p></div></div>
    <form class="form" id="appearance-form">
      <div class="settings-group">
        <h3>Theme</h3>
        <div class="theme-grid">
          ${state.themes.map((theme) => `<button class="theme-choice ${theme === getStoredTheme() ? 'selected' : ''}" type="button" data-theme="${theme}"><span class="theme-swatch theme-${theme}"></span><strong>${THEME_LABELS[theme] || theme}</strong></button>`).join('')}
        </div>
      </div>
      <div class="settings-group">
        <h3>Modus</h3>
        <div class="segmented">${state.modes.map((mode) => `<button type="button" data-mode="${mode}" aria-selected="${mode === getStoredMode()}">${MODE_LABELS[mode] || mode}</button>`).join('')}</div>
      </div>
      <div class="settings-group">
        <h3>Startseite</h3>
        ${selectField('Links pro Seite', 'linksPerPage', [['4','4'],['6','6'],['8','8'],['9','9'],['12','12']], String(s.display.linksPerPage || 6))}
      </div>
      <div class="actions"><button class="button filled" type="submit">Darstellung speichern</button></div>
    </form>
  `;
}

function linkRow(link, index) {
  if (state.editingLink === index) {
    return `
      <article class="link-editor-row editing" data-editor="${index}">
        <div class="form">
          ${field('Titel', 'title', 'text', 'off', true, link.title || '')}
          ${field('URL', 'url', 'url', 'off', true, link.url || '')}
          <div class="favicon-line">
            ${field('Icon oder Bildpfad', 'icon', 'text', 'off', false, link.icon || '')}
            <button class="button tonal" type="button" data-fetch-icon="${index}">Automatisch</button>
          </div>
          <div class="color-grid">${Array.from({ length: 10 }, (_, color) => `<button class="color-dot c${color} ${safeColor(link.color) === color ? 'selected' : ''}" type="button" data-color="${color}" aria-label="Akzent ${color + 1}"></button>`).join('')}</div>
          <div class="actions">
            <button class="button filled" type="button" data-link-apply="${index}">Uebernehmen</button>
            <button class="button text" type="button" data-link-cancel>Abbrechen</button>
          </div>
        </div>
      </article>
    `;
  }
  return `
    <article class="link-editor-row">
      <span class="link-icon c${safeColor(link.color)}">${iconOrText(link.icon, link.title)}</span>
      <span><span class="link-title">${escapeHTML(link.title)}</span><span class="link-domain">${escapeHTML(link.url)}</span></span>
      <span class="mini-actions">
        <button class="icon-button" type="button" data-link-up="${index}" aria-label="Nach oben">${icon('up')}</button>
        <button class="icon-button" type="button" data-link-down="${index}" aria-label="Nach unten">${icon('down')}</button>
        <button class="icon-button" type="button" data-link-edit="${index}" aria-label="Bearbeiten">${icon('edit')}</button>
        <button class="icon-button" type="button" data-link-delete="${index}" aria-label="Loeschen">${icon('close')}</button>
      </span>
    </article>
  `;
}

function accountPanel() {
  return `
    <div class="section-head"><div><h2>Anmeldung</h2><p>Profil und Passwort</p></div></div>
    <form class="form" id="account-form">
      ${field('Aktuelles Passwort', 'currentPassword', 'password', 'current-password')}
      ${field('Anzeigename', 'displayName', 'text', 'name', true, state.user.displayName || '')}
      ${field('E-Mail optional', 'email', 'email', 'email', false, state.user.email || '')}
      ${field('Benutzername', 'username', 'text', 'username', true, state.user.username || '')}
      <div class="form-row">
        ${field('Neues Passwort', 'password', 'password', 'new-password', false)}
        ${field('Passwort wiederholen', 'passwordConfirm', 'password', 'new-password', false)}
      </div>
      <div class="tonal-card card-text">Lass die Passwortfelder leer, wenn du nur Profil oder Benutzername aendern willst.</div>
      <div class="actions"><button class="button filled" type="submit">Anmeldedaten speichern</button></div>
    </form>
  `;
}

function bindAdmin() {
  $$('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeAdminTab = button.dataset.tab;
    renderAdmin();
  }));
  $('#settings-form')?.addEventListener('submit', saveSettings);
  $('#appearance-form')?.addEventListener('submit', saveAppearance);
  $('#account-form')?.addEventListener('submit', saveAccount);
  $('[name="locationSearch"]')?.addEventListener('input', debounce(geocode, 350));
  bindAppearanceControls(() => renderAdmin());
}

function bindLinkEditor() {
  $('[data-link-add]')?.addEventListener('click', () => {
    state.links.push({ title: '', url: '', icon: '', color: 0 });
    state.editingLink = state.links.length - 1;
    state.editingLinks = true;
    renderStart();
  });
  $('[data-link-save]')?.addEventListener('click', saveLinks);
  $$('[data-link-edit]').forEach((el) => el.addEventListener('click', () => { state.editingLink = Number(el.dataset.linkEdit); state.editingLinks = true; renderStart(); }));
  $$('[data-link-delete]').forEach((el) => el.addEventListener('click', () => { state.links.splice(Number(el.dataset.linkDelete), 1); state.editingLink = -1; renderStart(); }));
  $$('[data-link-up]').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.linkUp);
    if (i > 0) [state.links[i - 1], state.links[i]] = [state.links[i], state.links[i - 1]];
    renderStart();
  }));
  $$('[data-link-down]').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.linkDown);
    if (i < state.links.length - 1) [state.links[i + 1], state.links[i]] = [state.links[i], state.links[i + 1]];
    renderStart();
  }));
  $('[data-link-cancel]')?.addEventListener('click', () => { state.editingLink = -1; renderStart(); });
  $('[data-link-apply]')?.addEventListener('click', applyLinkEditor);
  $('[data-fetch-icon]')?.addEventListener('click', fetchIconForEditor);
  $$('[data-color]').forEach((el) => el.addEventListener('click', () => {
    $$('.color-dot').forEach((dot) => dot.classList.remove('selected'));
    el.classList.add('selected');
  }));
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const settings = {
    name: form.get('name'),
    location: {
      latitude: form.get('latitude'),
      longitude: form.get('longitude'),
      name: form.get('locationName'),
      timezone: form.get('timezone')
    },
    weather: {
      enabled: form.get('weatherEnabled') === 'on',
      unit: form.get('weatherUnit'),
      refreshMinutes: form.get('weatherRefresh')
    },
    display: {
      linksPerPage: state.settings.display.linksPerPage,
      searchEngine: form.get('searchEngine'),
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Einstellungen gespeichert.');
}

async function saveAppearance(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const settings = {
    ...state.settings,
    display: {
      linksPerPage: form.get('linksPerPage'),
      searchEngine: state.settings.display.searchEngine,
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Darstellung gespeichert.');
  renderAdmin();
}

async function saveLinks() {
  const result = await api('/api/admin/links', { method: 'PUT', body: { links: state.links } });
  state.links = result.links;
  state.editingLink = -1;
  toast('Links gespeichert.');
  renderStart();
}

async function applyLinkEditor() {
  const editor = $('[data-editor]');
  const data = {
    title: $('[name="title"]', editor).value,
    url: $('[name="url"]', editor).value,
    icon: $('[name="icon"]', editor).value
  };
  if (!data.title?.trim()) return toast('Titel fehlt.', 'error');
  if (!data.url?.trim()) return toast('URL fehlt.', 'error');
  const selected = $('.color-dot.selected', editor);
  let iconValue = data.icon.trim();
  let colorValue = selected ? Number(selected.dataset.color) : 0;
  if (!iconValue) {
    try {
      const result = await fetchFavicon(data.url);
      iconValue = result.icon || initials(data.title);
      colorValue = result.color;
    } catch {
      iconValue = initials(data.title);
    }
  }
  state.links[state.editingLink] = {
    title: data.title.trim(),
    url: data.url.trim(),
    icon: iconValue,
    color: colorValue
  };
  state.editingLink = -1;
  renderStart();
}

async function fetchIconForEditor() {
  const editor = $('[data-editor]');
  const url = $('[name="url"]', editor).value;
  if (!url.trim()) return toast('URL fehlt.', 'error');
  const result = await fetchFavicon(url);
  if (result.icon) $('[name="icon"]', editor).value = result.icon;
  $$('.color-dot', editor).forEach((dot) => dot.classList.toggle('selected', Number(dot.dataset.color) === result.color));
  toast(result.icon ? 'Favicon geladen.' : 'Kein Favicon gefunden.');
}

function fetchFavicon(url) {
  return api(`/api/admin/favicon?url=${encodeURIComponent(url)}`);
}

async function saveAccount(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!body.currentPassword) return toast('Aktuelles Passwort erforderlich.', 'error');
  if (body.password !== body.passwordConfirm) return toast('Neue Passwoerter stimmen nicht ueberein.', 'error');
  await api('/api/admin/credentials', { method: 'PUT', body });
  toast('Anmeldedaten gespeichert.');
  await loadAppData();
  renderAdmin();
}

async function geocode(event) {
  const q = event.target.value.trim();
  const host = $('#geocode-results');
  if (q.length < 2) return host.replaceChildren();
  try {
    const data = await api(`/api/admin/geocode?q=${encodeURIComponent(q)}`);
    host.innerHTML = data.results.map((item) => `
      <button class="list-row" type="button" data-place='${escapeAttr(JSON.stringify(item))}'>
        ${icon('search')}<span><strong>${escapeHTML(item.label)}</strong><span class="support">${escapeHTML(item.timezone || '')}</span></span><span></span>
      </button>
    `).join('');
    $$('[data-place]', host).forEach((button) => button.addEventListener('click', () => {
      const item = JSON.parse(button.dataset.place);
      $('[name="latitude"]').value = item.latitude;
      $('[name="longitude"]').value = item.longitude;
      $('[name="locationName"]').value = item.label;
      $('[name="timezone"]').value = item.timezone || 'Europe/Berlin';
      host.replaceChildren();
    }));
  } catch (error) {
    host.innerHTML = `<div class="tonal-card card-text">${escapeHTML(error.message)}</div>`;
  }
}

function bindGlobalActions() {
  $$('[data-action="admin"]').forEach((el) => el.addEventListener('click', renderAdmin));
  $$('[data-action="start"]').forEach((el) => el.addEventListener('click', () => {
    state.editingLinks = false;
    state.editingLink = -1;
    renderStart();
  }));
  $$('[data-action="links-edit"]').forEach((el) => el.addEventListener('click', () => {
    state.editingLinks = !state.editingLinks;
    state.editingLink = -1;
    renderStart();
  }));
  $$('[data-action="profile"]').forEach((el) => el.addEventListener('click', openProfileSheet));
  $$('[data-action="info"]').forEach((el) => el.addEventListener('click', openInfoSheet));
}

function bindAppearanceControls(rerender) {
  $$('[data-theme]').forEach((button) => button.addEventListener('click', () => {
    applyTheme(button.dataset.theme, getStoredMode());
    rerender();
  }));
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    applyTheme(getStoredTheme(), button.dataset.mode);
    rerender();
  }));
}

function openProfileSheet() {
  openSheet(`
    ${sheetHeader('Profil')}
    <div class="account-card"><div class="account-avatar">${escapeHTML(initials(state.user.displayName || state.user.username))}</div><div><h3 class="card-title">${escapeHTML(state.user.displayName || state.user.username)}</h3><p class="card-text">@${escapeHTML(state.user.username)}</p></div></div>
    <div class="list">
      <button class="list-row" data-sheet-admin>${icon('settings')}<span><strong>Einstellungen</strong><span class="support">Nestiku verwalten</span></span><span></span></button>
      <button class="list-row" data-sheet-links>${icon('edit')}<span><strong>Links bearbeiten</strong><span class="support">Direkt auf der Startseite</span></span><span></span></button>
      <button class="list-row" data-logout>${icon('logout')}<span><strong>Logout</strong><span class="support">Session beenden</span></span><span></span></button>
    </div>
  `);
  bindSheetChrome();
  $('[data-sheet-admin]').addEventListener('click', () => { closeSheet(); renderAdmin(); });
  $('[data-sheet-links]').addEventListener('click', () => { closeSheet(); state.editingLinks = true; renderStart(); });
  $('[data-logout]').addEventListener('click', logout);
}

function openInfoSheet() {
  openSheet(`
    ${sheetHeader('Info')}
    <div class="empty"><div class="logo-large"><img src="/assets/nestiku.png" alt=""></div><div><h3 class="card-title">Nestiku</h3><p class="card-text">Personal Startpage</p></div></div>
    <div class="technical-card">Port intern: 8080<br>Health: /healthz<br>Ready: /readyz<br>Data: /data</div>
  `);
  bindSheetChrome();
}

function bindSheetChrome({ onBack = null } = {}) {
  $$('[data-sheet-action="close"], [data-close]').forEach((button) => button.addEventListener('click', closeSheet));
  $$('[data-sheet-action="back"], [data-back]').forEach((button) => button.addEventListener('click', () => {
    closeSheet();
    if (onBack) onBack();
  }));
}

function handleHashRoute() {
  const route = location.hash.replace('#', '');
  if (route === 'admin') {
    history.replaceState(null, '', location.pathname);
    renderAdmin();
    return;
  }
  if (route === 'edit') {
    history.replaceState(null, '', location.pathname);
    state.editingLinks = true;
    renderStart();
    return;
  }
  if (route === 'profile') {
    history.replaceState(null, '', location.pathname);
    renderStart();
    openProfileSheet();
    return;
  }
  if (route === 'start') {
    history.replaceState(null, '', location.pathname);
    renderStart();
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.authenticated = false;
  closeSheet();
  renderLogin();
}

function submitSearch(event) {
  event.preventDefault();
  const query = $('#search-input').value.trim();
  if (!query) return;
  const direct = directUrl(query);
  if (direct) {
    location.href = direct;
    return;
  }
  const engine = currentEngine();
  const url = new URL(engine.url);
  url.searchParams.set(engine.param, query);
  location.href = url.toString();
}

async function fetchWeather() {
  if (!state.settings?.weather?.enabled) return;
  const loc = state.settings.location || {};
  const unit = state.settings.weather.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&current=temperature_2m&temperature_unit=${unit}&timezone=${encodeURIComponent(loc.timezone || 'auto')}`;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    const data = await response.json();
    if (typeof data.current?.temperature_2m === 'number') {
      state.weather = Math.round(data.current.temperature_2m);
      updateClock();
    }
  } catch {}
}

function updateClock() {
  const now = nowInTimezone(state.settings?.location?.timezone);
  $('#time').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const hour = now.getHours();
  let greeting = 'Hallo';
  if (hour < 5) greeting = 'Gute Nacht';
  else if (hour < 11) greeting = 'Guten Morgen';
  else if (hour < 18) greeting = 'Guten Tag';
  else if (hour < 22) greeting = 'Guten Abend';
  else greeting = 'Gute Nacht';
  $('#greeting').textContent = state.settings?.name ? `${greeting}, ${state.settings.name}` : greeting;
  const unit = state.settings?.weather?.unit === 'fahrenheit' ? '°F' : '°C';
  const weather = state.weather === null ? '' : ` · ${state.weather}${unit}`;
  $('#date').textContent = `${WEEKDAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}${weather}`;
}

function nowInTimezone(timezone) {
  if (!timezone) return new Date();
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour12: false, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  } catch {
    return new Date();
  }
}

function clearTimers() {
  clearInterval(state.clockTimer);
  clearInterval(state.weatherTimer);
}

function currentEngine() { return state.searchEngines[state.settings?.display?.searchEngine || 'duckduckgo'] || state.searchEngines.duckduckgo || { url: 'https://duckduckgo.com/', param: 'q', label: 'DDG' }; }
