const state = {
  app: null,
  setup: null,
  authenticated: false,
  user: null,
  settings: null,
  links: [],
  searchEngines: {},
  themes: ['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite'],
  modes: ['system', 'light', 'dark'],
  weather: null,
  editingLink: -1,
  linkPage: 0,
  activeAdminTab: 'settings',
  clockTimer: null,
  weatherTimer: null
};

const THEME_LABELS = { lavender: 'Lavender', mint: 'Mint', sky: 'Sky', amber: 'Amber', rose: 'Rose', graphite: 'Graphite' };
const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

boot();

async function boot() {
  initTheme();
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
  clearTimers();
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
            <p>${state.links.length ? `${state.links.length} Links` : 'Noch leer'}</p>
          </div>
          <button class="button text" type="button" data-action="admin">Verwalten</button>
        </div>
        ${renderLinks()}
      </section>
    </div>
  `, `
    <button class="icon-button" type="button" data-action="theme" aria-label="Darstellung">${icon('palette')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profil">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
  `);
  bindGlobalActions();
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
          <p class="card-text">Lege im Adminbereich deine ersten Schnellzugriffe an.</p>
        </div>
        <button class="button filled" type="button" data-action="admin">Links anlegen</button>
      </div>
    `;
  }
  const perPage = state.settings.display.linksPerPage || 6;
  const pages = [];
  for (let index = 0; index < state.links.length; index += perPage) pages.push(state.links.slice(index, index + perPage));
  if (state.linkPage >= pages.length) state.linkPage = Math.max(0, pages.length - 1);
  const page = pages[state.linkPage] || [];
  return `<div class="links-grid">${page.map((link) => `
    <a class="card link-card" href="${escapeAttr(link.url)}" rel="noopener noreferrer">
      <span class="link-icon c${safeColor(link.color)}">${iconOrText(link.icon, link.title)}</span>
      <span><span class="link-title">${escapeHTML(link.title)}</span><span class="link-domain">${escapeHTML(domain(link.url))}</span></span>
    </a>
  `).join('')}</div>${pages.length > 1 ? `<div class="pager">${pages.map((_, index) => `<button class="pager-dot" type="button" data-page="${index}" aria-current="${index === state.linkPage}">${index + 1}</button>`).join('')}</div>` : ''}`;
}

function renderAdmin() {
  clearTimers();
  state.activeAdminTab ||= 'settings';
  app().innerHTML = shell(`
    <section class="hero-card">
      <h2 class="card-title">Nestiku Admin</h2>
      <p class="card-text">Alles Wichtige an einem Ort: Links, Anzeige, Standort, Wetter und Anmeldung.</p>
      <div class="actions">
        <button class="button filled" type="button" data-action="start">Startseite</button>
        <button class="button tonal" type="button" data-action="theme">Darstellung</button>
      </div>
    </section>
    <nav class="tabs" aria-label="Adminbereiche">
      ${tabButton('settings', 'Einstellungen')}
      ${tabButton('links', 'Links')}
      ${tabButton('account', 'Anmeldung')}
    </nav>
    <section class="card">${adminPanel()}</section>
  `, `
    <button class="icon-button" type="button" data-action="info" aria-label="Info">${icon('info')}</button>
    <button class="avatar-button" type="button" data-action="profile" aria-label="Profil">${escapeHTML(initials(state.user?.displayName || state.user?.username))}</button>
  `);
  bindGlobalActions();
  bindAdmin();
}

function tabButton(id, label) {
  return `<button type="button" data-tab="${id}" aria-selected="${state.activeAdminTab === id}">${label}</button>`;
}

function adminPanel() {
  if (state.activeAdminTab === 'links') return linksPanel();
  if (state.activeAdminTab === 'account') return accountPanel();
  return settingsPanel();
}

function settingsPanel() {
  const s = state.settings;
  return `
    <div class="section-head"><div><h2>Einstellungen</h2><p>Profil, Standort, Wetter und Darstellung</p></div></div>
    <form class="form" id="settings-form">
      ${field('Anzeige-Name', 'name', 'text', 'name', true, s.name || '')}
      ${field('Standort suchen', 'locationSearch', 'search', 'off', false, '', 'Hamburg, Berlin, Stuhr')}
      <div id="geocode-results" class="list"></div>
      <div class="form-row">
        ${field('Latitude', 'latitude', 'number', 'off', true, s.location.latitude)}
        ${field('Longitude', 'longitude', 'number', 'off', true, s.location.longitude)}
      </div>
      ${field('Standortname', 'locationName', 'text', 'off', false, s.location.name || '')}
      ${field('Zeitzone', 'timezone', 'text', 'off', true, s.location.timezone || 'Europe/Berlin')}
      <div class="form-row">
        ${selectField('Wetter-Einheit', 'weatherUnit', [['celsius', 'Celsius'], ['fahrenheit', 'Fahrenheit']], s.weather.unit)}
        ${field('Refresh-Minuten', 'weatherRefresh', 'number', 'off', true, s.weather.refreshMinutes)}
      </div>
      <label class="list-row"><span></span><span><strong>Wetter anzeigen</strong><span class="support">Open-Meteo ohne API-Key</span></span><input type="checkbox" name="weatherEnabled" ${s.weather.enabled ? 'checked' : ''}></label>
      <div class="form-row">
        ${selectField('Links pro Seite', 'linksPerPage', [['4','4'],['6','6'],['8','8'],['9','9'],['12','12']], String(s.display.linksPerPage || 6))}
        ${selectField('Suchmaschine', 'searchEngine', Object.entries(state.searchEngines).map(([key, value]) => [key, value.name]), s.display.searchEngine)}
      </div>
      <div class="actions"><button class="button filled" type="submit">Speichern</button></div>
    </form>
  `;
}

function linksPanel() {
  return `
    <div class="section-head"><div><h2>Links</h2><p>${state.links.length} Schnellzugriffe</p></div></div>
    <div class="grid" id="link-list">
      ${state.links.map((link, index) => linkRow(link, index)).join('')}
    </div>
    <div class="actions">
      <button class="button tonal" type="button" data-link-add>Link hinzufuegen</button>
      <button class="button filled" type="button" data-link-save>Links speichern</button>
    </div>
  `;
}

function linkRow(link, index) {
  if (state.editingLink === index) {
    return `
      <article class="card link-editor-row editing" data-editor="${index}">
        <div class="form">
          ${field('Titel', 'title', 'text', 'off', true, link.title || '')}
          ${field('URL', 'url', 'url', 'off', true, link.url || '')}
          ${field('Icon oder Bildpfad', 'icon', 'text', 'off', false, link.icon || '')}
          <div class="color-grid">${Array.from({ length: 10 }, (_, color) => `<button class="color-dot c${color} ${safeColor(link.color) === color ? 'selected' : ''}" type="button" data-color="${color}" aria-label="Akzent ${color + 1}"></button>`).join('')}</div>
          <div class="actions">
            <button class="button tonal" type="button" data-fetch-icon="${index}">Favicon</button>
            <button class="button filled" type="button" data-link-apply="${index}">Uebernehmen</button>
            <button class="button text" type="button" data-link-cancel>Abbrechen</button>
          </div>
        </div>
      </article>
    `;
  }
  return `
    <article class="card link-editor-row">
      <span class="link-icon c${safeColor(link.color)}">${iconOrText(link.icon, link.title)}</span>
      <span><span class="link-title">${escapeHTML(link.title)}</span><span class="link-domain">${escapeHTML(link.url)}</span></span>
      <span class="mini-actions">
        <button class="icon-button" type="button" data-link-up="${index}" aria-label="Nach oben">${icon('up')}</button>
        <button class="icon-button" type="button" data-link-edit="${index}" aria-label="Bearbeiten">${icon('settings')}</button>
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
  $('#account-form')?.addEventListener('submit', saveAccount);
  $('[name="locationSearch"]')?.addEventListener('input', debounce(geocode, 350));
  $('[data-link-add]')?.addEventListener('click', () => {
    state.links.push({ title: '', url: '', icon: '', color: 0 });
    state.editingLink = state.links.length - 1;
    renderAdmin();
  });
  $('[data-link-save]')?.addEventListener('click', saveLinks);
  $$('[data-link-edit]').forEach((el) => el.addEventListener('click', () => { state.editingLink = Number(el.dataset.linkEdit); renderAdmin(); }));
  $$('[data-link-delete]').forEach((el) => el.addEventListener('click', () => { state.links.splice(Number(el.dataset.linkDelete), 1); renderAdmin(); }));
  $$('[data-link-up]').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.linkUp);
    if (i > 0) [state.links[i - 1], state.links[i]] = [state.links[i], state.links[i - 1]];
    renderAdmin();
  }));
  $('[data-link-cancel]')?.addEventListener('click', () => { state.editingLink = -1; renderAdmin(); });
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
      linksPerPage: form.get('linksPerPage'),
      searchEngine: form.get('searchEngine'),
      theme: getStoredTheme(),
      mode: getStoredMode()
    }
  };
  const result = await api('/api/admin/settings', { method: 'PUT', body: settings });
  state.settings = result.settings;
  toast('Einstellungen gespeichert.');
}

async function saveLinks() {
  const result = await api('/api/admin/links', { method: 'PUT', body: { links: state.links } });
  state.links = result.links;
  state.editingLink = -1;
  toast('Links gespeichert.');
  renderAdmin();
}

function applyLinkEditor() {
  const editor = $('[data-editor]');
  const data = {
    title: $('[name="title"]', editor).value,
    url: $('[name="url"]', editor).value,
    icon: $('[name="icon"]', editor).value
  };
  if (!data.title?.trim()) return toast('Titel fehlt.', 'error');
  if (!data.url?.trim()) return toast('URL fehlt.', 'error');
  const selected = $('.color-dot.selected', editor);
  state.links[state.editingLink] = {
    title: data.title.trim(),
    url: data.url.trim(),
    icon: data.icon.trim() || initials(data.title),
    color: selected ? Number(selected.dataset.color) : 0
  };
  state.editingLink = -1;
  renderAdmin();
}

async function fetchIconForEditor() {
  const editor = $('[data-editor]');
  const url = $('[name="url"]', editor).value;
  if (!url.trim()) return toast('URL fehlt.', 'error');
  const result = await api(`/api/admin/favicon?url=${encodeURIComponent(url)}`);
  if (result.icon) $('[name="icon"]', editor).value = result.icon;
  $$('.color-dot', editor).forEach((dot) => dot.classList.toggle('selected', Number(dot.dataset.color) === result.color));
  toast(result.icon ? 'Favicon geladen.' : 'Kein Favicon gefunden.');
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
  $$('[data-action="start"]').forEach((el) => el.addEventListener('click', renderStart));
  $$('[data-action="theme"]').forEach((el) => el.addEventListener('click', openThemeSheet));
  $$('[data-action="profile"]').forEach((el) => el.addEventListener('click', openProfileSheet));
  $$('[data-action="info"]').forEach((el) => el.addEventListener('click', openInfoSheet));
}

function openProfileSheet() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Profil</h2><button class="icon-button" data-close aria-label="Schliessen">${icon('close')}</button></div>
    <div class="account-card"><div class="account-avatar">${escapeHTML(initials(state.user.displayName || state.user.username))}</div><div><h3 class="card-title">${escapeHTML(state.user.displayName || state.user.username)}</h3><p class="card-text">@${escapeHTML(state.user.username)}</p></div></div>
    <div class="list">
      <button class="list-row" data-sheet-admin>${icon('settings')}<span><strong>Adminbereich</strong><span class="support">Nestiku verwalten</span></span><span></span></button>
      <button class="list-row" data-sheet-theme>${icon('palette')}<span><strong>Darstellung</strong><span class="support">Theme und Modus</span></span><span></span></button>
      <button class="list-row" data-logout>${icon('logout')}<span><strong>Logout</strong><span class="support">Session beenden</span></span><span></span></button>
    </div>
  `);
  $('[data-sheet-admin]').addEventListener('click', () => { closeSheet(); renderAdmin(); });
  $('[data-sheet-theme]').addEventListener('click', () => { closeSheet(); openThemeSheet(); });
  $('[data-logout]').addEventListener('click', logout);
}

function openThemeSheet() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Darstellung</h2><button class="icon-button" data-close aria-label="Schliessen">${icon('close')}</button></div>
    <h3 class="card-title">Theme</h3>
    <div class="theme-grid">
      ${state.themes.map((theme) => `<button class="button ${theme === getStoredTheme() ? 'filled' : 'outlined'}" data-theme="${theme}">${THEME_LABELS[theme] || theme}</button>`).join('')}
    </div>
    <h3 class="card-title">Modus</h3>
    <div class="segmented">${state.modes.map((mode) => `<button data-mode="${mode}" aria-selected="${mode === getStoredMode()}">${MODE_LABELS[mode] || mode}</button>`).join('')}</div>
  `);
  $$('[data-theme]').forEach((button) => button.addEventListener('click', () => { applyTheme(button.dataset.theme, getStoredMode()); openThemeSheet(); }));
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => { applyTheme(getStoredTheme(), button.dataset.mode); openThemeSheet(); }));
}

function openInfoSheet() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Info</h2><button class="icon-button" data-close aria-label="Schliessen">${icon('close')}</button></div>
    <div class="empty"><div class="logo-large"><img src="/assets/nestiku.png" alt=""></div><div><h3 class="card-title">Nestiku</h3><p class="card-text">Personal Startpage</p></div></div>
    <div class="technical-card">Port intern: 8080<br>Health: /healthz<br>Ready: /readyz<br>Data: /app/data</div>
  `);
}

function openSheet(html) {
  closeSheet();
  const node = document.createElement('div');
  node.className = 'sheet-backdrop';
  node.innerHTML = `<section class="sheet" role="dialog" aria-modal="true">${html}</section>`;
  document.body.append(node);
  node.addEventListener('click', (event) => { if (event.target === node || event.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', escapeToClose);
}

function closeSheet() {
  $('.sheet-backdrop')?.remove();
  document.removeEventListener('keydown', escapeToClose);
}

function escapeToClose(event) {
  if (event.key === 'Escape') closeSheet();
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

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function initTheme() {
  const theme = getStoredTheme();
  const mode = getStoredMode();
  applyTheme(theme, mode, false);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getStoredTheme(), getStoredMode(), false));
}

function applyTheme(theme, mode, persist = true) {
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

function getStoredTheme() { return localStorage.getItem('nestiku-theme') || 'lavender'; }
function getStoredMode() { return localStorage.getItem('nestiku-mode') || 'system'; }
function currentEngine() { return state.searchEngines[state.settings?.display?.searchEngine || 'duckduckgo'] || state.searchEngines.duckduckgo || { url: 'https://duckduckgo.com/', param: 'q', label: 'DDG' }; }
function field(label, name, type = 'text', autocomplete = 'off', required = true, value = '', placeholder = '') { return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" type="${type}" autocomplete="${autocomplete}" ${required ? 'required' : ''} value="${escapeAttr(value ?? '')}" placeholder="${escapeAttr(placeholder)}"></label>`; }
function selectField(label, name, options, selected) { return `<label class="field"><span class="label">${label}</span><select class="select" name="${name}">${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select></label>`; }
function app() { return $('#app'); }
function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function escapeAttr(value) { return escapeHTML(value).replace(/`/g, '&#96;'); }
function initials(value) { const parts = String(value || 'N').trim().split(/\s+/); return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)).toUpperCase(); }
function isImage(value) { return /^(https?:|\/|\.{0,2}\/)/.test(value || '') || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(value || ''); }
function iconOrText(iconValue, title) { return isImage(iconValue) ? `<img src="${escapeAttr(iconValue)}" alt="">` : escapeHTML(iconValue || initials(title)); }
function safeColor(value) { return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0; }
function domain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function directUrl(query) { if (/\s/.test(query)) return ''; const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(query) ? query : `https://${query}`; try { const url = new URL(value); return url.hostname.includes('.') && ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function debounce(fn, ms) { let timer; return (event) => { clearTimeout(timer); timer = setTimeout(() => fn(event), ms); }; }
function toast(message, type = '') { const node = $('#toast'); node.textContent = message; node.className = `toast show ${type}`; clearTimeout(node.timer); node.timer = setTimeout(() => { node.className = 'toast'; }, 3200); }
function icon(name) {
  const paths = {
    search: 'm19.6 21-6.3-6.3q-.75.6-1.72.95-.98.35-2.08.35-2.73 0-4.61-1.89Q3 12.23 3 9.5t1.89-4.61Q6.77 3 9.5 3t4.61 1.89Q16 6.77 16 9.5q0 1.1-.35 2.08-.35.97-.95 1.72l6.3 6.3-1.4 1.4Z',
    palette: 'M12 22q-2.08 0-3.9-.79-1.83-.78-3.18-2.13-1.35-1.35-2.13-3.18Q2 14.08 2 12t.8-3.9q.8-1.82 2.17-3.17Q6.35 3.58 8.2 2.79 10.05 2 12.18 2q1.95 0 3.67.63 1.73.62 3 1.74 1.28 1.11 2.02 2.62.73 1.51.73 3.26 0 2.88-1.75 4.31Q18.1 16 15.7 16h-1.8q-.45 0-.72.31-.28.31-.28.69 0 .5.37.85.38.35.38.85 0 .68-.45 1.14-.45.46-1.2.16Z',
    settings: 'M10.9 22q-.45 0-.78-.3-.34-.3-.4-.75l-.25-1.85q-.5-.2-.98-.47-.47-.28-.9-.6l-1.72.73q-.42.18-.84.02-.42-.15-.65-.55l-1.1-1.9q-.22-.4-.14-.85.08-.44.45-.72l1.48-1.12Q5 13.38 5 13v-2q0-.38.07-.75L3.6 9.13q-.37-.28-.45-.72-.08-.45.14-.85l1.1-1.9q.23-.4.65-.55.42-.16.84.02l1.72.73q.43-.32.9-.6.48-.27.98-.47l.25-1.85q.06-.45.4-.75.33-.3.78-.3h2.2q.45 0 .78.3.34.3.4.75l.25 1.85q.5.2.98.47.47.28.9.6l1.72-.73q.42-.18.84-.02.42.15.65.55l1.1 1.9q.22.4.14.85-.08.44-.45.72l-1.48 1.12q.07.37.07.75v2q0 .38-.07.75l1.48 1.12q.37.28.45.72.08.45-.14.85l-1.1 1.9q-.23.4-.65.55-.42.16-.84-.02l-1.72-.73q-.43.32-.9.6-.48.27-.98.47l-.25 1.85q-.06.45-.4.75-.33.3-.78.3h-2.2Z',
    close: 'M12 13.4 7.1 18.3q-.28.28-.7.28-.43 0-.7-.28-.28-.27-.28-.7 0-.42.28-.7l4.9-4.9-4.9-4.9q-.28-.28-.28-.7 0-.43.28-.7.27-.28.7-.28.42 0 .7.28l4.9 4.9 4.9-4.9q.28-.28.7-.28.43 0 .7.28.28.27.28.7 0 .42-.28.7L13.4 12l4.9 4.9q.28.28.28.7 0 .43-.28.7-.27.28-.7.28-.42 0-.7-.28L12 13.4Z',
    logout: 'M5 21q-.82 0-1.41-.59Q3 19.83 3 19V5q0-.82.59-1.41Q4.18 3 5 3h7v2H5v14h7v2H5Zm11-4-1.38-1.45L17.17 13H9v-2h8.17l-2.55-2.55L16 7l5 5-5 5Z',
    info: 'M11 17h2v-6h-2v6Zm1-8q.43 0 .71-.29Q13 8.43 13 8t-.29-.71Q12.43 7 12 7t-.71.29Q11 7.57 11 8t.29.71q.28.29.71.29Zm0 13q-2.08 0-3.9-.79-1.83-.78-3.18-2.13-1.35-1.35-2.13-3.18Q2 14.08 2 12t.79-3.9q.78-1.83 2.13-3.18 1.35-1.35 3.18-2.13Q9.92 2 12 2t3.9.79q1.83.78 3.18 2.13 1.35 1.35 2.13 3.18.79 1.82.79 3.9t-.79 3.9q-.78 1.83-2.13 3.18-1.35 1.35-3.18 2.13-1.82.79-3.9.79Z',
    up: 'M12 8 6 14l1.4 1.4L12 10.8l4.6 4.6L18 14Z'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="${paths[name] || paths.info}"/></svg>`;
}
