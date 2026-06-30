import { api } from './js/api.js?v=20260630f';
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
} from './js/dom.js?v=20260630f';
import { icon } from './js/icons.js?v=20260630f';
import { closeSheet, openSheet, sheetHeader } from './js/sheets.js?v=20260630f';
import { MODE_LABELS, state, THEME_LABELS, WEEKDAYS } from './js/state.js?v=20260630f';
import { applyTheme, getStoredMode, getStoredTheme, initTheme } from './js/theme.js?v=20260630f';

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
      <h2 class="card-title">Setup is not ready</h2>
      <p class="card-text">${escapeHTML(state.setup?.error || 'Setup secret is missing.')}</p>
    </div>
  `;
  app().innerHTML = `
    <main class="auth-screen">
      <section class="card auth-window" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div class="brand">
          <div class="logo-large" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
          <div>
            <h1 id="setup-title">Create admin account</h1>
            <p>Create the first administrator for Nestiku.</p>
          </div>
        </div>
        ${error}
        <form class="form" id="setup-form">
          ${field('Setup secret', 'setupSecret', 'password', 'one-time-code')}
          ${field('Display name', 'displayName', 'text', 'name')}
          ${field('Admin username', 'username', 'text', 'username')}
          ${field('Email optional', 'email', 'email', 'email', false)}
          ${field('Admin password', 'password', 'password', 'new-password')}
          ${field('Repeat password', 'passwordConfirm', 'password', 'new-password')}
          <div class="tonal-card card-text">Use at least 12 characters. Do not reuse the setup secret, username or app name.</div>
          <button class="button filled full" type="submit" ${state.setup?.configured ? '' : 'disabled'}>Create admin account</button>
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
  if (body.password !== body.passwordConfirm) return toast('Passwords do not match.', 'error');
  if ((body.password || '').length < 12) return toast('Password is too short.', 'error');
  await api('/api/setup/register', { method: 'POST', body });
  toast('Admin account created.');
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
          ${field('Username', 'username', 'text', 'username')}
          ${field('Password', 'password', 'password', 'current-password')}
          <button class="button filled full" type="submit">Sign in</button>
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
  const display = state.settings.display || {};
  app().innerHTML = shell(`
    <div class="dashboard">
      <section class="hero-card hero" aria-labelledby="greeting">
        <p class="date" id="date"></p>
        <p class="time" id="time">--:--</p>
        <h2 class="greeting" id="greeting">Hello</h2>
        <form id="search-form" class="search-row" role="search">
          <label class="visually-hidden" for="search-input">Search or enter a URL</label>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="m19.6 21-6.3-6.3q-.75.6-1.72.95-.98.35-2.08.35-2.73 0-4.61-1.89Q3 12.23 3 9.5t1.89-4.61Q6.77 3 9.5 3t4.61 1.89Q16 6.77 16 9.5q0 1.1-.35 2.08-.35.97-.95 1.72l6.3 6.3-1.4 1.4ZM9.5 14q1.88 0 3.19-1.31Q14 11.38 14 9.5t-1.31-3.19Q11.38 5 9.5 5T6.31 6.31Q5 7.62 5 9.5t1.31 3.19Q7.62 14 9.5 14Z"/></svg>
          <input class="input" id="search-input" type="search" placeholder="Search or enter a URL" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="search-badge">${escapeHTML(currentEngine().label)}</span>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Bookmarks</h2>
            <p>${state.editingLinks ? 'Editing enabled' : linkCountLabel()}</p>
          </div>
          <button class="button ${state.editingLinks ? 'tonal' : 'text'}" type="button" data-action="links-edit">${state.editingLinks ? 'Done' : 'Edit'}</button>
        </div>
        ${state.editingLinks ? renderEditToolbar(display) : ''}
        ${renderLinks()}
      </section>
    </div>
  `, `
    <button class="icon-button" type="button" data-action="links-edit" aria-label="Edit links">${icon('edit')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profile">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
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
  if (!state.links.length && !state.editingLinks) {
    return `
      <div class="empty tonal-card">
        <div class="logo-large" aria-hidden="true"><img src="/assets/nestiku.png" alt=""></div>
        <div>
          <h3 class="card-title">No links yet</h3>
          <p class="card-text">Add your first bookmarks directly from this page.</p>
        </div>
        <button class="button filled" type="button" data-action="links-edit">Add links</button>
      </div>
    `;
  }
  const perPage = state.settings.display.linksPerPage || 6;
  const linkView = state.settings.display.linkView === 'list' ? 'list' : 'grid';
  const totalItems = state.links.length + (state.editingLinks ? 1 : 0);
  const pages = [];
  for (let index = 0; index < totalItems; index += perPage) pages.push({ start: index, end: Math.min(index + perPage, totalItems) });
  if (state.linkPage >= pages.length) state.linkPage = Math.max(0, pages.length - 1);
  const page = pages[state.linkPage] || { start: 0, end: 0 };
  const items = [];
  for (let index = page.start; index < page.end; index += 1) {
    items.push(index < state.links.length
      ? linkTile(state.links[index], index)
      : `<button class="card link-card add-link-card" type="button" data-link-add>${icon('plus')}<span>Add link</span></button>`);
  }
  return `<div class="links-grid ${linkView === 'list' ? 'list-view' : ''}">${items.join('')}</div>${pages.length > 1 ? `<div class="pager">${pages.map((_, index) => `<button class="pager-dot" type="button" data-page="${index}" aria-current="${index === state.linkPage}">${index + 1}</button>`).join('')}</div>` : ''}`;
}

function linkCountLabel() {
  if (!state.links.length) return 'No links yet';
  return state.links.length === 1 ? '1 link' : `${state.links.length} links`;
}

function renderAdmin() {
  closeSheet();
  clearTimers();
  state.activeAdminTab ||= 'settings';
  app().innerHTML = shell(`
    <section class="settings-hero">
      <div>
        <h2>Settings</h2>
        <p>Profile, search, location, weather and account controls.</p>
      </div>
      <div class="actions">
        <button class="icon-button tonal-icon" type="button" data-action="start" aria-label="Close settings">${icon('close')}</button>
      </div>
    </section>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Settings sections">
        ${tabButton('settings', 'General', 'Profile, search, location')}
        ${tabButton('account', 'Account', 'Profile and password')}
      </nav>
      <section class="card settings-panel">${adminPanel()}</section>
    </div>
  `, `
    <button class="icon-button" type="button" data-action="info" aria-label="Info">${icon('info')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profile">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
  `);
  bindGlobalActions();
  bindAdmin();
}

function tabButton(id, label, support = '') {
  return `<button type="button" data-tab="${id}" aria-selected="${state.activeAdminTab === id}"><strong>${label}</strong>${support ? `<span>${support}</span>` : ''}</button>`;
}

function adminPanel() {
  if (state.activeAdminTab === 'account') return accountPanel();
  return settingsPanel();
}

function settingsPanel() {
  const s = state.settings;
  return `
    <div class="section-head"><div><h2>General</h2><p>Name, location, weather and default search</p></div></div>
    <form class="form" id="settings-form">
      <div class="settings-group">
        <h3>Profile</h3>
        ${field('Display name', 'name', 'text', 'name', true, s.name || '')}
      </div>
      <div class="settings-group">
        <h3>Location</h3>
        ${field('Search location', 'locationSearch', 'search', 'off', false, '', 'Hamburg, Berlin, Stuhr')}
        <div id="geocode-results" class="list"></div>
        <div class="form-row">
          ${field('Latitude', 'latitude', 'number', 'off', true, s.location.latitude)}
          ${field('Longitude', 'longitude', 'number', 'off', true, s.location.longitude)}
        </div>
        ${field('Location name', 'locationName', 'text', 'off', false, s.location.name || '')}
        ${field('Timezone', 'timezone', 'text', 'off', true, s.location.timezone || 'Europe/Berlin')}
      </div>
      <div class="settings-group">
        <h3>Weather and search</h3>
        <div class="form-row">
          ${selectField('Weather unit', 'weatherUnit', [['celsius', 'Celsius'], ['fahrenheit', 'Fahrenheit']], s.weather.unit)}
          ${field('Refresh minutes', 'weatherRefresh', 'number', 'off', true, s.weather.refreshMinutes)}
        </div>
        <label class="list-row toggle-row"><span></span><span><strong>Show weather</strong><span class="support">Open-Meteo without an API key</span></span><input type="checkbox" name="weatherEnabled" ${s.weather.enabled ? 'checked' : ''}></label>
        ${selectField('Search engine', 'searchEngine', Object.entries(state.searchEngines).map(([key, value]) => [key, value.name]), s.display.searchEngine)}
      </div>
      <div class="actions"><button class="button filled" type="submit">Save</button></div>
    </form>
  `;
}

function renderEditToolbar(display) {
  return `
    <div class="edit-toolbar">
      <div class="segmented compact-segmented" aria-label="Link view">
        <button type="button" data-link-view="grid" aria-selected="${(display.linkView || 'grid') !== 'list'}">Icons</button>
        <button type="button" data-link-view="list" aria-selected="${display.linkView === 'list'}">List</button>
      </div>
      ${selectField('Per page', 'linksPerPageToolbar', [['4','4'],['6','6'],['8','8'],['9','9'],['12','12']], String(display.linksPerPage || 6))}
      <button class="icon-button tonal-icon" type="button" data-link-save aria-label="Save links">${icon('save')}</button>
    </div>
  `;
}

function linkTile(link, index) {
  if (state.editingLink === index) {
    return `
      <article class="card link-card link-card-editor" data-editor="${index}">
        <div class="form">
          ${field('Title', 'title', 'text', 'off', true, link.title || '')}
          ${field('URL', 'url', 'url', 'off', true, link.url || '')}
          <div class="favicon-line">
            ${field('Icon or image path', 'icon', 'text', 'off', false, link.icon || '')}
            <button class="button tonal" type="button" data-fetch-icon="${index}">Auto</button>
          </div>
          <div class="color-grid">${Array.from({ length: 10 }, (_, color) => `<button class="color-dot c${color} ${safeColor(link.color) === color ? 'selected' : ''}" type="button" data-color="${color}" aria-label="Accent ${color + 1}"></button>`).join('')}</div>
          <div class="actions">
            <button class="button filled" type="button" data-link-apply="${index}">Apply</button>
            <button class="button text" type="button" data-link-cancel>Cancel</button>
          </div>
        </div>
      </article>
    `;
  }
  const content = `
    <span class="link-icon c${safeColor(link.color)}">${iconOrText(link.icon, link.title)}</span>
    <span><span class="link-title">${escapeHTML(link.title)}</span><span class="link-domain">${escapeHTML(domain(link.url))}</span></span>
  `;
  if (!state.editingLinks) {
    return `<a class="card link-card" href="${escapeAttr(link.url)}" rel="noopener noreferrer">${content}</a>`;
  }
  return `
    <article class="card link-card editable-link">
      ${content}
      <span class="tile-actions">
        <button class="icon-button tonal-icon" type="button" data-link-up="${index}" aria-label="Move up">${icon('up')}</button>
        <button class="icon-button tonal-icon" type="button" data-link-down="${index}" aria-label="Move down">${icon('down')}</button>
        <button class="icon-button tonal-icon" type="button" data-link-edit="${index}" aria-label="Edit link">${icon('edit')}</button>
        <button class="icon-button tonal-icon" type="button" data-link-delete="${index}" aria-label="Delete link">${icon('close')}</button>
      </span>
    </article>
  `;
}

function accountPanel() {
  return `
    <div class="section-head"><div><h2>Account</h2><p>Profile and password</p></div></div>
    <form class="form" id="account-form">
      ${field('Current password', 'currentPassword', 'password', 'current-password')}
      ${field('Display name', 'displayName', 'text', 'name', true, state.user.displayName || '')}
      ${field('Email optional', 'email', 'email', 'email', false, state.user.email || '')}
      ${field('Username', 'username', 'text', 'username', true, state.user.username || '')}
      <div class="form-row">
        ${field('New password', 'password', 'password', 'new-password', false)}
        ${field('Repeat password', 'passwordConfirm', 'password', 'new-password', false)}
      </div>
      <div class="tonal-card card-text">Leave the password fields empty if you only want to update profile details.</div>
      <div class="actions"><button class="button filled" type="submit">Save account</button></div>
    </form>
  `;
}

function bindAdmin() {
  $$('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeAdminTab = button.dataset.tab;
    renderAdmin();
  }));
  $('#settings-form')?.addEventListener('submit', saveSettings);
  $('#account-form')?.addEventListener('submit', saveAccount);
  $('[name="locationSearch"]')?.addEventListener('input', debounce(geocode, 350));
}

function bindLinkEditor() {
  $('[data-link-add]')?.addEventListener('click', () => {
    state.links.push({ title: '', url: '', icon: '', color: 0 });
    state.editingLink = state.links.length - 1;
    state.editingLinks = true;
    renderStart();
  });
  $('[data-link-save]')?.addEventListener('click', saveLinks);
  $('[name="linksPerPageToolbar"]')?.addEventListener('change', saveDisplayFromToolbar);
  $$('[data-link-view]').forEach((el) => el.addEventListener('click', saveDisplayFromToolbar));
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
      linkView: state.settings.display.linkView || 'grid',
      searchEngine: form.get('searchEngine'),
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Settings saved.');
}

async function saveDisplayFromToolbar(event) {
  if (event?.preventDefault) event.preventDefault();
  const selectedView = event?.currentTarget?.dataset?.linkView || state.settings.display.linkView || 'grid';
  const perPage = $('[name="linksPerPageToolbar"]')?.value || state.settings.display.linksPerPage || 6;
  const settings = {
    ...state.settings,
    display: {
      linksPerPage: perPage,
      linkView: selectedView,
      searchEngine: state.settings.display.searchEngine,
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Display saved.');
  renderStart();
}

async function saveLinks() {
  const result = await api('/api/admin/links', { method: 'PUT', body: { links: state.links } });
  state.links = result.links;
  state.editingLink = -1;
  toast('Links saved.');
  renderStart();
}

async function applyLinkEditor() {
  const editor = $('[data-editor]');
  const data = {
    title: $('[name="title"]', editor).value,
    url: $('[name="url"]', editor).value,
    icon: $('[name="icon"]', editor).value
  };
  if (!data.title?.trim()) return toast('Title is required.', 'error');
  if (!data.url?.trim()) return toast('URL is required.', 'error');
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
  if (!url.trim()) return toast('URL is required.', 'error');
  const result = await fetchFavicon(url);
  if (result.icon) $('[name="icon"]', editor).value = result.icon;
  $$('.color-dot', editor).forEach((dot) => dot.classList.toggle('selected', Number(dot.dataset.color) === result.color));
  toast(result.icon ? 'Favicon loaded.' : 'No favicon found.');
}

function fetchFavicon(url) {
  return api(`/api/admin/favicon?url=${encodeURIComponent(url)}`);
}

async function saveAccount(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!body.currentPassword) return toast('Current password is required.', 'error');
  if (body.password !== body.passwordConfirm) return toast('New passwords do not match.', 'error');
  await api('/api/admin/credentials', { method: 'PUT', body });
  toast('Account saved.');
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
    saveAppearanceSettings().then(rerender);
  }));
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    applyTheme(getStoredTheme(), button.dataset.mode);
    saveAppearanceSettings().then(rerender);
  }));
}

async function saveAppearanceSettings() {
  const settings = {
    ...state.settings,
    display: {
      linksPerPage: state.settings.display.linksPerPage,
      linkView: state.settings.display.linkView || 'grid',
      searchEngine: state.settings.display.searchEngine,
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Appearance saved.');
}

function openProfileSheet() {
  openSheet(`
    ${sheetHeader('Profile')}
    <div class="account-card"><div class="account-avatar">${escapeHTML(initials(state.user.displayName || state.user.username))}</div><div><h3 class="card-title">${escapeHTML(state.user.displayName || state.user.username)}</h3><p class="card-text">@${escapeHTML(state.user.username)}</p></div></div>
    <div class="list">
      <button class="list-row" data-sheet-admin>${icon('settings')}<span><strong>Settings</strong><span class="support">Manage profile, search and account</span></span><span></span></button>
      <button class="list-row" data-sheet-appearance>${icon('palette')}<span><strong>Appearance</strong><span class="support">Theme and color mode</span></span><span></span></button>
      <button class="list-row" data-sheet-about>${icon('info')}<span><strong>About</strong><span class="support">Version, paths and health endpoints</span></span><span></span></button>
      <button class="list-row" data-logout>${icon('logout')}<span><strong>Log out</strong><span class="support">End this session</span></span><span></span></button>
    </div>
  `);
  bindSheetChrome();
  $('[data-sheet-admin]').addEventListener('click', () => { closeSheet(); renderAdmin(); });
  $('[data-sheet-appearance]').addEventListener('click', openAppearanceSheet);
  $('[data-sheet-about]').addEventListener('click', openAboutSheet);
  $('[data-logout]').addEventListener('click', logout);
}

function openInfoSheet() {
  openAboutSheet();
}

function openAboutSheet() {
  openSheet(`
    ${sheetHeader('About Nestiku')}
    <div class="empty"><div class="logo-large"><img src="/assets/nestiku.png" alt=""></div><div><h3 class="card-title">Nestiku</h3><p class="card-text">Personal Startpage</p></div></div>
    <div class="technical-card">Internal port: 8080<br>Health: /healthz<br>Ready: /readyz<br>Data path: /data<br>Image: ghcr.io/maroishiku/nestiku</div>
  `);
  bindSheetChrome();
}

function openAppearanceSheet() {
  openSheet(`
    ${sheetHeader('Appearance')}
    <div class="settings-group">
      <h3>Theme</h3>
      <div class="theme-grid">
        ${state.themes.map((theme) => `<button class="theme-choice ${theme === getStoredTheme() ? 'selected' : ''}" type="button" data-theme="${theme}"><span class="theme-swatch theme-${theme}"></span><strong>${THEME_LABELS[theme] || theme}</strong></button>`).join('')}
      </div>
    </div>
    <div class="settings-group">
      <h3>Mode</h3>
      <div class="segmented">${state.modes.map((mode) => `<button type="button" data-mode="${mode}" aria-selected="${mode === getStoredMode()}">${MODE_LABELS[mode] || mode}</button>`).join('')}</div>
    </div>
  `);
  bindSheetChrome();
  bindAppearanceControls(openAppearanceSheet);
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
  let greeting = 'Hello';
  if (hour < 5) greeting = 'Good night';
  else if (hour < 11) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  else if (hour < 22) greeting = 'Good evening';
  else greeting = 'Good night';
  $('#greeting').textContent = state.settings?.name ? `${greeting}, ${state.settings.name}` : greeting;
  const unit = state.settings?.weather?.unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';
  const weather = state.weather === null ? '' : ` \u00b7 ${state.weather}${unit}`;
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
