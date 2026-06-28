import { initNestikuShell } from './nestiku-shell.js';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

let settings = null;
let searchEngines = {};
let currentWeather = null;
let weatherTimer = null;
let pageObserver = null;

await initNestikuShell();
init();

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isImageRef(value) {
  return /^(https?:|\/|\.{0,2}\/)/.test(value || '') || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(value || '');
}

function autoIcon(title) {
  return window.Nestiku?.initials(title) || 'N';
}

function directUrlFromQuery(value) {
  const query = value.trim();
  if (!query || /\s/.test(query)) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(query) ? query : `https://${query}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')) return url.toString();
  } catch {}
  return '';
}

function nowInTimezone(timezone) {
  if (!timezone) return new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  } catch {
    return new Date();
  }
}

function updateClock() {
  const now = nowInTimezone(settings?.location?.timezone);
  document.getElementById('time').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const hour = now.getHours();
  let greeting = 'Hallo';
  if (hour < 5) greeting = 'Gute Nacht';
  else if (hour < 11) greeting = 'Guten Morgen';
  else if (hour < 18) greeting = 'Guten Tag';
  else if (hour < 22) greeting = 'Guten Abend';
  else greeting = 'Gute Nacht';

  const name = settings?.name?.trim();
  document.getElementById('greeting').textContent = name ? `${greeting}, ${name}` : greeting;

  let dateText = `${WEEKDAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  if (currentWeather) {
    const unit = settings?.weather?.unit === 'fahrenheit' ? '°F' : '°C';
    dateText += ` · ${currentWeather.temp}${unit}`;
  }
  document.getElementById('date').textContent = dateText;
}

async function fetchWeather() {
  if (!settings?.weather?.enabled) return;
  const { latitude, longitude, timezone } = settings.location || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const unit = settings.weather.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m&temperature_unit=${unit}&timezone=${encodeURIComponent(timezone || 'auto')}`;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Wetter konnte nicht geladen werden.');
    const data = await response.json();
    if (data.current && typeof data.current.temperature_2m === 'number') {
      currentWeather = { temp: Math.round(data.current.temperature_2m) };
      updateClock();
    }
  } catch {}
}

function scheduleWeather() {
  clearInterval(weatherTimer);
  if (!settings?.weather?.enabled) return;
  fetchWeather();
  const minutes = Math.max(5, settings.weather.refreshMinutes || 30);
  weatherTimer = setInterval(fetchWeather, minutes * 60 * 1000);
}

function applySearchEngine() {
  const engineKey = settings?.display?.searchEngine || 'duckduckgo';
  const engine = searchEngines[engineKey] || searchEngines.duckduckgo;
  const form = document.getElementById('search-form');
  form.action = engine.url;
  form.querySelector('[name="q"]').name = engine.param;
  document.getElementById('search-badge').textContent = engine.label || engine.name;
}

function chunk(items, size) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

function buildCard(link) {
  const icon = link.icon || autoIcon(link.title);
  const iconHTML = isImageRef(icon)
    ? `<img src="${escapeHTML(icon)}" alt="" loading="lazy">`
    : escapeHTML(icon);
  const color = Number.isInteger(link.color) ? Math.max(0, Math.min(9, link.color)) : 0;
  return `
    <a class="psu-card nestiku-link-card" href="${escapeHTML(link.url)}" rel="noopener noreferrer">
      <span class="nestiku-link-icon nestiku-color-${color}">${iconHTML}</span>
      <span>
        <span class="nestiku-link-title">${escapeHTML(link.title)}</span>
        <span class="nestiku-link-domain">${escapeHTML(getDomain(link.url))}</span>
      </span>
    </a>
  `;
}

function renderLinks(links) {
  const pager = document.getElementById('pager');
  const dots = document.getElementById('page-dots');
  const indicator = document.getElementById('page-indicator');
  pager.innerHTML = '';
  dots.innerHTML = '';

  if (!links.length) {
    indicator.textContent = '';
    pager.innerHTML = `
      <div class="nestiku-page">
        <div class="psu-tonal-card nestiku-empty">
          <div class="psu-logo-frame" aria-hidden="true"><img src="/assets/logos/nestiku.png" alt=""></div>
          <div>
            <h3 class="psu-card-title">Noch keine Links</h3>
            <p class="psu-card-text">Fuege im Adminbereich deine ersten Schnellzugriffe hinzu.</p>
          </div>
          <a class="psu-button psu-button--filled" href="/admin">Links anlegen</a>
        </div>
      </div>
    `;
    return;
  }

  const perPage = settings?.display?.linksPerPage || 6;
  const pages = chunk(links, perPage);
  pages.forEach((page, index) => {
    const pageElement = document.createElement('div');
    pageElement.className = 'nestiku-page';
    pageElement.dataset.page = String(index + 1);
    pageElement.innerHTML = `<div class="nestiku-links-grid">${page.map(buildCard).join('')}</div>`;
    pager.appendChild(pageElement);

    if (pages.length > 1) {
      const dot = document.createElement('button');
      dot.className = 'nestiku-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Seite ${index + 1}`);
      dot.addEventListener('click', () => pageElement.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }));
      dots.appendChild(dot);
    }
  });

  if (pageObserver) pageObserver.disconnect();
  pageObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const page = Number(visible.target.dataset.page || 1);
    indicator.textContent = pages.length > 1 ? `${page} / ${pages.length}` : `${links.length} Links`;
    dots.querySelectorAll('.nestiku-dot').forEach((dot, index) => dot.setAttribute('aria-current', String(index + 1 === page)));
  }, { root: pager, threshold: 0.6 });
  pager.querySelectorAll('.nestiku-page').forEach((page) => pageObserver.observe(page));
}

function populateProfile(user) {
  const label = user?.displayName || user?.username || 'Nestiku';
  document.getElementById('avatar-button').textContent = window.Nestiku.initials(label);
  document.getElementById('profile-avatar').textContent = window.Nestiku.initials(label);
  document.getElementById('profile-name').textContent = label;
  document.getElementById('profile-id').textContent = user?.username ? `@${user.username}` : 'Personal Startpage';
}

async function init() {
  try {
    const response = await fetch('/api/data', { cache: 'no-cache' });
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (response.status === 428) {
      window.location.href = '/setup';
      return;
    }
    if (!response.ok) throw new Error('Daten konnten nicht geladen werden.');
    const data = await response.json();
    settings = data.settings;
    searchEngines = data.searchEngines || {};
    populateProfile(data.user);
    applySearchEngine();
    renderLinks(data.links || []);
    updateClock();
    setInterval(updateClock, 1000);
    scheduleWeather();
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
  }
}

document.getElementById('search-form').addEventListener('submit', (event) => {
  const input = event.currentTarget.querySelector('input[type="search"]');
  const directUrl = directUrlFromQuery(input.value);
  if (directUrl) {
    event.preventDefault();
    window.location.href = directUrl;
  }
});
