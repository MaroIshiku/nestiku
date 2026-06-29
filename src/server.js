'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs').promises;
const net = require('net');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const JsonStore = require('./storage');
const {
  SESSION_MAX_AGE_MS,
  createSession,
  hashPassword,
  setSessionSecret,
  timingSafeEqualString,
  verifyPassword,
  verifySession
} = require('./auth');

const APP = {
  id: 'nestiku',
  name: 'Nestiku',
  subtitle: 'Personal Startpage',
  description: 'Private Startseite mit Suche, Wetter, Links und Adminbereich.'
};

const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/', param: 'q', label: 'DDG' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search', param: 'query', label: 'SP' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search', param: 'q', label: 'BRV' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search', param: 'q', label: 'KAGI' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search', param: 'q', label: 'ECO' },
  google: { name: 'Google', url: 'https://www.google.com/search', param: 'q', label: 'GGL' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search', param: 'q', label: 'BING' }
};

const DEFAULT_SETTINGS = {
  name: '',
  location: {
    latitude: 53.55073,
    longitude: 9.99302,
    name: 'Hamburg, Deutschland',
    timezone: 'Europe/Berlin'
  },
  weather: { enabled: true, unit: 'celsius', refreshMinutes: 30 },
  display: { linksPerPage: 6, searchEngine: 'duckduckgo', theme: 'lavender', mode: 'system' }
};

const DEFAULT_LINKS = { links: [] };
const DEFAULT_AUTH = { username: '', displayName: '', email: '', passwordHash: null, setupCompleted: false, createdAt: null };
const THEMES = ['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite'];
const MODES = ['system', 'light', 'dark'];
const PLACEHOLDER_PASSWORDS = new Set(['admin', 'password', 'passwort', 'changeme', 'change-me', '123456', '123456789', 'ishiku', 'nestiku']);

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.NESTIKU_DATA_DIR || process.env.ISHIKU_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const ICON_DIR = path.join(DATA_DIR, 'icons');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE_NAME = 'nestiku_session';
const IS_PROD = process.env.NODE_ENV === 'production';
const FETCH_TIMEOUT_MS = parseInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS || '5000', 10);
const ICON_MAX_BYTES = 1024 * 1024;

const authStore = new JsonStore(path.join(DATA_DIR, 'auth.json'), DEFAULT_AUTH);
const linksStore = new JsonStore(path.join(DATA_DIR, 'links.json'), DEFAULT_LINKS);
const settingsStore = new JsonStore(path.join(DATA_DIR, 'settings.json'), DEFAULT_SETTINGS);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(securityHeaders);

app.get('/healthz', (req, res) => res.json({ ok: true, app: APP.id }));
app.get('/readyz', async (req, res) => {
  try {
    await Promise.all([authStore.read(), linksStore.read(), settingsStore.read()]);
    res.json({ ok: true, app: APP.id, data: 'ready' });
  } catch {
    res.status(503).json({ ok: false, data: 'not-ready' });
  }
});

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: IS_PROD ? '1d' : 0 }));
app.use('/user-icons', requireAuth, express.static(ICON_DIR, { maxAge: '30d', etag: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: IS_PROD ? '1h' : 0 }));

app.get('/api/bootstrap', async (req, res) => {
  const [auth, settings] = await Promise.all([ensureAuthState(), settingsStore.read()]);
  const session = getSession(req);
  const authenticated = !!session && session.user === auth.username && hasAdmin(auth);
  const setup = await getSetupState(auth);
  res.json({
    app: APP,
    setup,
    authenticated,
    user: authenticated ? publicUser(auth, settings) : null,
    searchEngines: SEARCH_ENGINES,
    themes: THEMES,
    modes: MODES
  });
});

app.post('/api/setup/register', async (req, res) => {
  try {
    const auth = await ensureAuthState();
    if (!isSetupRequired(auth)) return res.status(409).json({ error: 'Setup ist bereits abgeschlossen.' });

    const setupSecret = await readSetupSecret();
    if (!setupSecret.configured) return res.status(503).json({ error: setupSecret.error });

    const body = req.body || {};
    if (!timingSafeEqualString(body.setupSecret, setupSecret.value)) {
      await delay(350);
      return res.status(401).json({ error: 'Setup-Secret ist falsch.' });
    }

    const username = clean(body.username, 64);
    const displayName = clean(body.displayName, 80);
    const email = clean(body.email, 160);
    const password = String(body.password || '');
    const passwordConfirm = String(body.passwordConfirm || '');

    if (!username) throw new Error('Admin-Benutzername fehlt.');
    if (!displayName) throw new Error('Anzeigename fehlt.');
    validatePassword({ password, passwordConfirm, username, setupSecret: setupSecret.value });

    const nextAuth = {
      username,
      displayName,
      email,
      passwordHash: await hashPassword(password),
      setupCompleted: true,
      createdAt: new Date().toISOString()
    };
    await authStore.write(nextAuth);
    const settings = await settingsStore.read();
    settings.name = displayName;
    await settingsStore.write(validateSettings(settings));
    setSessionCookie(req, res, username);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const auth = await ensureAuthState();
  if (isSetupRequired(auth)) return res.status(428).json({ error: 'Setup erforderlich.' });
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    await delay(350);
    return res.status(401).json({ error: 'Falsche Anmeldedaten.' });
  }
  const ok = username === auth.username && await verifyPassword(password, auth.passwordHash);
  if (!ok) {
    await delay(350);
    return res.status(401).json({ error: 'Falsche Anmeldedaten.' });
  }
  setSessionCookie(req, res, auth.username);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
  res.json({ ok: true });
});

app.get('/api/data', requireAuth, async (req, res) => {
  const [auth, settings, linksDoc] = await Promise.all([authStore.read(), settingsStore.read(), linksStore.read()]);
  res.json({
    app: APP,
    user: publicUser(auth, settings),
    settings,
    links: linksDoc.links || [],
    searchEngines: SEARCH_ENGINES,
    themes: THEMES,
    modes: MODES
  });
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const settings = validateSettings(req.body || {});
    await settingsStore.write(settings);
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/links', requireAuth, async (req, res) => {
  try {
    const links = validateLinks(req.body && req.body.links);
    await linksStore.write({ links });
    res.json({ ok: true, count: links.length, links });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/credentials', requireAuth, async (req, res) => {
  const auth = await authStore.read();
  res.json({ username: auth.username, displayName: auth.displayName || '', email: auth.email || '' });
});

app.put('/api/admin/credentials', requireAuth, async (req, res) => {
  try {
    const auth = await authStore.read();
    const body = req.body || {};
    if (!await verifyPassword(String(body.currentPassword || ''), auth.passwordHash)) {
      await delay(350);
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch.' });
    }
    let changed = false;
    const username = clean(body.username, 64);
    const displayName = clean(body.displayName, 80);
    const email = clean(body.email, 160);
    const password = String(body.password || '');
    const passwordConfirm = String(body.passwordConfirm || '');

    if (username && username !== auth.username) {
      auth.username = username;
      changed = true;
    }
    if (displayName && displayName !== auth.displayName) {
      auth.displayName = displayName;
      const settings = await settingsStore.read();
      settings.name = displayName;
      await settingsStore.write(validateSettings(settings));
      changed = true;
    }
    if (typeof body.email === 'string' && email !== (auth.email || '')) {
      auth.email = email;
      changed = true;
    }
    if (password) {
      validatePassword({ password, passwordConfirm, username: auth.username, setupSecret: '' });
      auth.passwordHash = await hashPassword(password);
      changed = true;
    }
    if (!changed) return res.status(400).json({ error: 'Keine Aenderung erkannt.' });
    await authStore.write(auth);
    setSessionCookie(req, res, auth.username);
    res.json({ ok: true, username: auth.username });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/geocode', requireAuth, async (req, res) => {
  const q = clean(req.query.q, 80);
  if (!q) return res.status(400).json({ error: 'Suchbegriff fehlt.' });
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`;
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'nestiku/2.0' } });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const data = await response.json();
    res.json({
      results: (data.results || []).map((item) => ({
        name: item.name,
        country: item.country,
        admin1: item.admin1,
        latitude: item.latitude,
        longitude: item.longitude,
        timezone: item.timezone,
        label: [item.name, item.admin1, item.country].filter(Boolean).join(', ')
      }))
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/admin/favicon', requireAuth, async (req, res) => {
  try {
    const result = await cacheFavicon(clean(req.query.url, 2048));
    if (!result.icon) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint nicht gefunden.' });
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

ensureSessionSecret()
  .then(() => ensureAuthState())
  .then(() => app.listen(PORT, HOST, () => console.log(`Nestiku listening on http://${HOST}:${PORT}`)))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function ensureSessionSecret() {
  const envSecret = clean(process.env.SESSION_SECRET, 500);
  if (envSecret) {
    setSessionSecret(envSecret);
    return;
  }

  const filePath = path.join(DATA_DIR, 'session_secret');
  try {
    const value = (await fs.readFile(filePath, 'utf8')).trim();
    if (value.length >= 32) {
      setSessionSecret(value);
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const value = crypto.randomBytes(48).toString('base64url');
  try {
    await fs.writeFile(filePath, `${value}\n`, { mode: 0o600, flag: 'wx' });
    setSessionSecret(value);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = (await fs.readFile(filePath, 'utf8')).trim();
    if (existing.length < 32) throw new Error('Persistentes Session-Secret ist ungueltig.');
    setSessionSecret(existing);
  }
  if (IS_PROD) console.warn('SESSION_SECRET fehlt; Nestiku nutzt ein automatisch erzeugtes persistentes Secret aus /data/session_secret.');
}

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.open-meteo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

async function ensureAuthState() {
  const auth = await authStore.read();
  if (hasAdmin(auth) && auth.setupCompleted !== true) {
    auth.setupCompleted = true;
    auth.displayName = auth.displayName || auth.username;
    auth.email = auth.email || '';
    auth.createdAt = auth.createdAt || new Date().toISOString();
    await authStore.write(auth);
  }
  return auth;
}

function hasAdmin(auth) {
  return !!(auth && auth.username && auth.passwordHash);
}

function isSetupRequired(auth) {
  return !hasAdmin(auth) || auth.setupCompleted !== true;
}

async function getSetupState(auth) {
  if (!isSetupRequired(auth)) return { required: false, configured: false, error: '' };
  const setupSecret = await readSetupSecret();
  return { required: true, configured: setupSecret.configured, error: setupSecret.configured ? '' : setupSecret.error };
}

async function readSetupSecret() {
  const explicitFile = clean(process.env.ISHIKU_SETUP_SECRET_FILE, 260);
  const defaultFile = '/run/secrets/ishiku_setup_secret';
  const filePath = explicitFile || defaultFile;
  try {
    const value = (await fs.readFile(filePath, 'utf8')).trim();
    if (value) return { configured: true, value };
    return { configured: false, error: 'Setup-Secret-Datei ist leer.' };
  } catch (error) {
    if (explicitFile) return { configured: false, error: 'Setup-Secret-Datei ist nicht lesbar.' };
    if (error.code !== 'ENOENT') return { configured: false, error: 'Setup-Secret-Datei ist nicht lesbar.' };
  }
  const envSecret = clean(process.env.ISHIKU_SETUP_SECRET, 500);
  if (envSecret) return { configured: true, value: envSecret };
  return { configured: false, error: 'ISHIKU_SETUP_SECRET_FILE oder ISHIKU_SETUP_SECRET fehlt.' };
}

function getSession(req) {
  return verifySession(req.cookies && req.cookies[COOKIE_NAME]);
}

async function requireAuth(req, res, next) {
  try {
    const auth = await ensureAuthState();
    if (isSetupRequired(auth)) return res.status(428).json({ error: 'Setup erforderlich.' });
    const session = getSession(req);
    if (session && session.user === auth.username) return next();
    return res.status(401).json({ error: 'Authentifizierung erforderlich.' });
  } catch (error) {
    return next(error);
  }
}

function setSessionCookie(req, res, username) {
  res.cookie(COOKIE_NAME, createSession({ user: username }), {
    ...cookieOptions(req),
    maxAge: SESSION_MAX_AGE_MS
  });
}

function cookieOptions(req) {
  const secure = req.secure || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
  return { httpOnly: true, sameSite: 'strict', secure, path: '/' };
}

function publicUser(auth, settings) {
  return {
    username: auth.username,
    displayName: auth.displayName || settings.name || auth.username,
    email: auth.email || ''
  };
}

function validatePassword({ password, passwordConfirm, username, setupSecret }) {
  if (password.length < 12) throw new Error('Passwort muss mindestens 12 Zeichen lang sein.');
  if (password.length > 200) throw new Error('Passwort ist zu lang.');
  if (password !== passwordConfirm) throw new Error('Passwort und Wiederholung stimmen nicht ueberein.');
  const normalized = password.trim().toLowerCase();
  if (setupSecret && password === setupSecret) throw new Error('Passwort darf nicht mit dem Setup-Secret uebereinstimmen.');
  if (PLACEHOLDER_PASSWORDS.has(normalized)) throw new Error('Bitte kein Platzhalter-Passwort verwenden.');
  if ([username, APP.id, APP.name].some((value) => normalized === String(value || '').toLowerCase())) {
    throw new Error('Passwort darf nicht Benutzername, App-ID oder App-Name sein.');
  }
}

function validateSettings(input) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (typeof input.name === 'string') out.name = input.name.trim().slice(0, 80);
  if (input.location && typeof input.location === 'object') {
    const lat = Number(input.location.latitude);
    const lon = Number(input.location.longitude);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90) out.location.latitude = lat;
    if (Number.isFinite(lon) && lon >= -180 && lon <= 180) out.location.longitude = lon;
    if (typeof input.location.name === 'string') out.location.name = input.location.name.trim().slice(0, 120);
    if (typeof input.location.timezone === 'string') out.location.timezone = input.location.timezone.trim().slice(0, 80);
  }
  if (input.weather && typeof input.weather === 'object') {
    out.weather.enabled = !!input.weather.enabled;
    if (['celsius', 'fahrenheit'].includes(input.weather.unit)) out.weather.unit = input.weather.unit;
    const refresh = parseInt(input.weather.refreshMinutes, 10);
    if (Number.isInteger(refresh) && refresh >= 5 && refresh <= 720) out.weather.refreshMinutes = refresh;
  }
  if (input.display && typeof input.display === 'object') {
    const perPage = parseInt(input.display.linksPerPage, 10);
    if ([4, 6, 8, 9, 12].includes(perPage)) out.display.linksPerPage = perPage;
    if (SEARCH_ENGINES[input.display.searchEngine]) out.display.searchEngine = input.display.searchEngine;
    if (THEMES.includes(input.display.theme)) out.display.theme = input.display.theme;
    if (MODES.includes(input.display.mode)) out.display.mode = input.display.mode;
  }
  return out;
}

function validateLinks(input) {
  if (!Array.isArray(input)) throw new Error('Links muss ein Array sein.');
  if (input.length > 200) throw new Error('Maximal 200 Links erlaubt.');
  return input.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Link ${index + 1}: ungueltig.`);
    const title = clean(item.title, 100);
    const url = parseHttpUrl(item.url, `Link ${index + 1}: URL`).toString();
    if (!title) throw new Error(`Link ${index + 1}: Titel fehlt.`);
    const color = Number.isInteger(item.color) && item.color >= 0 && item.color <= 9 ? item.color : domainColorIndex(url);
    const icon = clean(item.icon, 260) || initials(title);
    return { title, url, icon, color };
  });
}

function clean(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseHttpUrl(raw, label = 'URL') {
  let value = clean(raw, 2048);
  if (!value) throw new Error(`${label} fehlt.`);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /^[^\s.]+\.[^\s]+/.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} ist ungueltig.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} muss http oder https sein.`);
  return url;
}

function domainColorIndex(value) {
  const host = parseHttpUrl(value).hostname.replace(/^www\./, '').toLowerCase();
  let hash = 0;
  for (let i = 0; i < host.length; i += 1) hash = ((hash << 5) - hash + host.charCodeAt(i)) | 0;
  return Math.abs(hash) % 10;
}

function initials(value) {
  const parts = clean(value, 80).split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || 'N').slice(0, 2).toUpperCase();
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function fetchPublicWithTimeout(rawUrl, options = {}, redirects = 3) {
  const url = rawUrl instanceof URL ? rawUrl : parseHttpUrl(rawUrl);
  await assertPublicHostname(url.hostname);
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && redirects > 0) {
    const location = response.headers.get('location');
    if (!location) return response;
    return fetchPublicWithTimeout(new URL(location, url).toString(), options, redirects - 1);
  }
  return response;
}

async function cacheFavicon(rawUrl) {
  const pageUrl = parseHttpUrl(rawUrl);
  await assertPublicHostname(pageUrl.hostname);
  const host = pageUrl.hostname.replace(/^www\./, '').toLowerCase();
  const base = crypto.createHash('sha256').update(host).digest('hex').slice(0, 24);
  const candidates = await faviconCandidates(pageUrl);
  for (const candidate of candidates) {
    try {
      const response = await fetchPublicWithTimeout(candidate, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/jpeg,image/x-icon,*/*;q=0.5',
          'User-Agent': 'nestiku/2.0'
        }
      });
      if (!response.ok) continue;
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = iconExt(type, candidate);
      if (!ext) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > ICON_MAX_BYTES) continue;
      await fs.mkdir(ICON_DIR, { recursive: true });
      const file = `${base}.${ext}`;
      await fs.writeFile(path.join(ICON_DIR, file), buffer);
      return { icon: `/user-icons/${file}`, color: domainColorIndex(pageUrl.toString()), domain: host };
    } catch {}
  }
  return { icon: '', color: domainColorIndex(pageUrl.toString()), domain: host };
}

async function faviconCandidates(pageUrl) {
  const seen = new Set();
  const candidates = [];
  const add = (value) => {
    try {
      const url = new URL(value, pageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const key = url.toString();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(url);
      }
    } catch {}
  };

  try {
    const response = await fetchPublicWithTimeout(pageUrl, {
      headers: { Accept: 'text/html,*/*;q=0.2', 'User-Agent': 'nestiku/2.0' }
    });
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (response.ok && type.includes('text/html')) {
      const html = Buffer.from(await response.arrayBuffer()).slice(0, 256 * 1024).toString('utf8');
      for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
        const tag = match[0];
        const rel = attrValue(tag, 'rel').toLowerCase();
        const href = attrValue(tag, 'href');
        if (href && /\b(apple-touch-icon|icon|shortcut icon|mask-icon)\b/.test(rel)) add(href);
      }
    }
  } catch {}

  add('/apple-touch-icon.png');
  add('/apple-touch-icon-precomposed.png');
  add('/favicon.svg');
  add('/favicon.png');
  add('/favicon.ico');
  return candidates.slice(0, 12);
}

function attrValue(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return match ? (match[1] || match[2] || match[3] || '') : '';
}

async function assertPublicHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) throw new Error('Lokale Adressen sind fuer Favicons nicht erlaubt.');
  const addresses = net.isIP(normalized) ? [{ address: normalized }] : await dns.lookup(normalized, { all: true, verbatim: false });
  if (!addresses.length) throw new Error('Host konnte nicht aufgeloest werden.');
  if (addresses.some((item) => isPrivateAddress(item.address))) throw new Error('Private oder lokale Adressen sind fuer Favicons nicht erlaubt.');
}

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
    if (value.startsWith('::ffff:')) return isPrivateAddress(value.replace('::ffff:', ''));
  }
  return false;
}

function iconExt(type, url) {
  if (type === 'image/png') return 'png';
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return 'ico';
  const ext = path.extname(url.pathname).replace('.', '').toLowerCase();
  return ['png', 'svg', 'jpg', 'jpeg', 'webp', 'ico'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
