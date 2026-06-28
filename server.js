'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const APP_MANIFEST = require('./app.manifest.json');
const Storage = require('./lib/storage');
const {
  createSession,
  hashPassword,
  verifyPassword,
  requireAuth,
  SESSION_DURATION_MS
} = require('./lib/auth');

// ---------- Konstanten ----------

const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/',                   param: 'q',     label: 'DDG'  },
  startpage:  { name: 'Startpage',  url: 'https://www.startpage.com/do/search',       param: 'query', label: 'SP'   },
  brave:      { name: 'Brave',      url: 'https://search.brave.com/search',           param: 'q',     label: 'BRV'  },
  kagi:       { name: 'Kagi',       url: 'https://kagi.com/search',                   param: 'q',     label: 'KAGI' },
  ecosia:     { name: 'Ecosia',     url: 'https://www.ecosia.org/search',             param: 'q',     label: 'ECO'  },
  google:     { name: 'Google',     url: 'https://www.google.com/search',             param: 'q',     label: 'GGL'  },
  bing:       { name: 'Bing',       url: 'https://www.bing.com/search',               param: 'q',     label: 'BING' }
};

const DEFAULT_SETTINGS = {
  name: '',
  location: {
    latitude: 53.05,
    longitude: 8.74,
    name: 'Stuhr, DE',
    timezone: 'Europe/Berlin'
  },
  weather: {
    enabled: true,
    unit: 'celsius',
    refreshMinutes: 30
  },
  display: {
    linksPerPage: 6,
    dynamicAccent: true,
    searchEngine: 'duckduckgo'
  }
};

const DEFAULT_LINKS = { links: [] };

const DEFAULT_AUTH = {
  username: '',
  displayName: '',
  email: '',
  passwordHash: null,
  setupCompleted: false,
  createdAt: null
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const FORCE_HTTPS = parseBool(process.env.FORCE_HTTPS, IS_PRODUCTION);
const REQUIRE_MOBILE = parseBool(process.env.REQUIRE_MOBILE, false);
const LOGIN_WINDOW_MS = parsePositiveInt(process.env.LOGIN_RATE_WINDOW_MS, 15 * 60 * 1000);
const LOGIN_MAX_ATTEMPTS = parsePositiveInt(process.env.LOGIN_RATE_MAX, 8);
const LOGIN_BLOCK_MS = parsePositiveInt(process.env.LOGIN_RATE_BLOCK_MS, 15 * 60 * 1000);
const LOGIN_RATE_SWEEP_MS = 10 * 60 * 1000;
const SETUP_RATE_WINDOW_MS = 15 * 60 * 1000;
const SETUP_RATE_MAX_ATTEMPTS = 8;
const SETUP_RATE_BLOCK_MS = 15 * 60 * 1000;
const EXTERNAL_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS, 5000);
const ICON_FETCH_MAX_BYTES = 1024 * 1024;
const ICON_CACHE_MAX_AGE = '30d';
const PALETTE_SIZE = 10;

const loginAttempts = new Map();
const setupAttempts = new Map();
const PLACEHOLDER_PASSWORDS = new Set(['admin', 'password', 'passwort', 'changeme', 'change-me', '123456', '123456789', 'ishiku']);

function parseBool(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function requestIsSecure(req) {
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return req.secure || forwardedProto === 'https';
}

function getClientIp(req) {
  const forwardedFor = (req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
}

function isHealthcheck(req) {
  return req.path === '/api/health';
}

function isMobileUserAgent(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent) return false;
  return /Android|webOS|iPhone|iPod|IEMobile|Opera Mini|Mobile|BlackBerry|Windows Phone/i.test(userAgent);
}

function httpsRedirectUrl(req) {
  const host = req.get('host');
  if (!host) return null;
  return `https://${host}${req.originalUrl || req.url || '/'}`;
}

function withNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res;
}

function sendHtml(res, fileName) {
  withNoStore(res).sendFile(path.join(__dirname, 'public', fileName));
}

function parseHttpUrl(raw, fieldName = 'URL') {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`${fieldName} fehlt`);
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /^[^\s.]+\.[^\s]+/.test(value)) {
    value = 'https://' + value;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldName} ungültig ("${raw}")`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${fieldName} muss mit http:// oder https:// beginnen`);
  }
  return url;
}

function domainColorIndex(hostname) {
  const clean = String(hostname || '').replace(/^www\./, '').toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE_SIZE;
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] || match[3] || match[4] || '';
  }
  return attrs;
}

function iconExtension(contentType, iconUrl) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return 'ico';
  const ext = path.extname(iconUrl.pathname || '').replace('.', '').toLowerCase();
  return ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
  });
}

async function readLimitedBuffer(response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > ICON_FETCH_MAX_BYTES) {
    throw new Error('Icon ist zu groß');
  }
  return buffer;
}

function faviconCandidatesFromHtml(html, baseUrl) {
  const candidates = [];
  const linkRe = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const rel = String(attrs.rel || '').toLowerCase();
    if (!attrs.href || !/\b(icon|apple-touch-icon|mask-icon)\b/.test(rel)) continue;
    try {
      candidates.push(new URL(attrs.href, baseUrl).toString());
    } catch {
      // ignore malformed icon hrefs
    }
  }
  return candidates;
}

async function discoverIconCandidates(pageUrl) {
  const candidates = [];
  try {
    const r = await fetchWithTimeout(pageUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'nestiku/1.0'
      }
    });
    const type = r.headers.get('content-type') || '';
    if (r.ok && type.includes('text/html')) {
      const html = await r.text();
      candidates.push(...faviconCandidatesFromHtml(html.slice(0, 300000), pageUrl));
    }
  } catch {
    // Fallbacks below cover sites that block HTML probing.
  }
  candidates.push(
    new URL('/apple-touch-icon.png', pageUrl).toString(),
    new URL('/favicon.ico', pageUrl).toString()
  );
  return [...new Set(candidates)].slice(0, 10);
}

async function cacheFavicon(rawUrl) {
  const pageUrl = parseHttpUrl(rawUrl);
  const host = pageUrl.hostname.replace(/^www\./, '').toLowerCase();
  const baseName = crypto.createHash('sha256').update(host).digest('hex').slice(0, 24);
  const candidates = await discoverIconCandidates(pageUrl);

  for (const candidate of candidates) {
    const iconUrl = parseHttpUrl(candidate, 'Icon-URL');
    try {
      const r = await fetchWithTimeout(iconUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.2',
          'User-Agent': 'nestiku/1.0'
        }
      });
      if (!r.ok) continue;
      const ext = iconExtension(r.headers.get('content-type'), iconUrl);
      if (!ext) continue;
      const buffer = await readLimitedBuffer(r);
      const fileName = `${baseName}.${ext}`;
      await fs.mkdir(ICON_DIR, { recursive: true });
      await fs.writeFile(path.join(ICON_DIR, fileName), buffer);
      return {
        icon: `/icons/${fileName}`,
        source: iconUrl.toString(),
        color: domainColorIndex(host),
        domain: host
      };
    } catch {
      // Try the next candidate.
    }
  }
  return {
    icon: '',
    source: '',
    color: domainColorIndex(host),
    domain: host
  };
}

function forceHttps(req, res, next) {
  if (!FORCE_HTTPS || isHealthcheck(req) || requestIsSecure(req)) return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    const target = httpsRedirectUrl(req);
    if (target) return res.redirect(308, target);
  }
  return res.status(426).json({ error: 'HTTPS erforderlich' });
}

function securityHeaders(req, res, next) {
  const connectSrc = ["'self'", 'https://api.open-meteo.com'];
  const formAction = [
    "'self'",
    'https://duckduckgo.com',
    'https://www.startpage.com',
    'https://search.brave.com',
    'https://kagi.com',
    'https://www.ecosia.org',
    'https://www.google.com',
    'https://www.bing.com'
  ];
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectSrc.join(' ')}`,
    `form-action ${formAction.join(' ')}`
  ];
  if (requestIsSecure(req)) csp.push('upgrade-insecure-requests');

  res.setHeader('Content-Security-Policy', csp.join('; '));
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (requestIsSecure(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function requireMobile(req, res, next) {
  if (!REQUIRE_MOBILE || isHealthcheck(req)) return next();
  if (isMobileUserAgent(req.get('user-agent'))) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Diese App ist nur fuer mobile Browser freigegeben' });
  }
  res.status(403).type('html').send(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nestiku</title>
<style>
body{margin:0;min-height:100svh;display:grid;place-items:center;background:#08050f;color:#fff;font:16px system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
main{max-width:360px;text-align:center}
h1{font-size:24px;margin:0 0 10px}
p{color:rgba(255,255,255,.68);line-height:1.5;margin:0}
</style>
</head>
<body><main><h1>Nur mobil verfuegbar</h1><p>Diese Startseite ist fuer Smartphone-Browser freigegeben. Oeffne sie bitte auf deinem Handy ueber die HTTPS-Adresse.</p></main></body>
</html>`);
}

function loginRateKey(req, username) {
  const user = typeof username === 'string' ? username.trim().toLowerCase().slice(0, 64) : '';
  return `${getClientIp(req)}:${user}`;
}

function getLoginRateState(req, username) {
  const now = Date.now();
  const key = loginRateKey(req, username);
  let state = loginAttempts.get(key);
  if (!state || now - state.firstSeen > LOGIN_WINDOW_MS + LOGIN_BLOCK_MS) {
    state = { count: 0, firstSeen: now, blockedUntil: 0 };
    loginAttempts.set(key, state);
  }
  return state;
}

function noteLoginFailure(req, username) {
  const state = getLoginRateState(req, username);
  const now = Date.now();
  if (now - state.firstSeen > LOGIN_WINDOW_MS) {
    state.count = 0;
    state.firstSeen = now;
    state.blockedUntil = 0;
  }
  state.count += 1;
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    state.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

function clearLoginFailures(req, username) {
  loginAttempts.delete(loginRateKey(req, username));
}

function loginRateLimited(req, username) {
  const state = getLoginRateState(req, username);
  return state.blockedUntil > Date.now();
}

function setupRateKey(req) {
  return getClientIp(req);
}

function getSetupRateState(req) {
  const now = Date.now();
  const key = setupRateKey(req);
  let state = setupAttempts.get(key);
  if (!state || now - state.firstSeen > SETUP_RATE_WINDOW_MS + SETUP_RATE_BLOCK_MS) {
    state = { count: 0, firstSeen: now, blockedUntil: 0 };
    setupAttempts.set(key, state);
  }
  return state;
}

function noteSetupFailure(req) {
  const state = getSetupRateState(req);
  const now = Date.now();
  if (now - state.firstSeen > SETUP_RATE_WINDOW_MS) {
    state.count = 0;
    state.firstSeen = now;
    state.blockedUntil = 0;
  }
  state.count += 1;
  if (state.count >= SETUP_RATE_MAX_ATTEMPTS) {
    state.blockedUntil = now + SETUP_RATE_BLOCK_MS;
  }
}

function setupRateLimited(req) {
  return getSetupRateState(req).blockedUntil > Date.now();
}

function clearSetupFailures(req) {
  setupAttempts.delete(setupRateKey(req));
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function readSetupSecretState() {
  const explicitPath = typeof process.env.ISHIKU_SETUP_SECRET_FILE === 'string' && process.env.ISHIKU_SETUP_SECRET_FILE.trim();
  const filePath = explicitPath || '/run/secrets/ishiku_setup_secret';

  try {
    const value = (await fs.readFile(filePath, 'utf8')).trim();
    if (!value) {
      return { configured: false, error: 'ISHIKU_SETUP_SECRET_FILE ist leer' };
    }
    return { configured: true, value, source: 'file' };
  } catch (err) {
    if (explicitPath) {
      return { configured: false, error: 'ISHIKU_SETUP_SECRET_FILE ist nicht lesbar' };
    }
    if (err.code !== 'ENOENT') {
      return { configured: false, error: 'ISHIKU_SETUP_SECRET_FILE ist nicht lesbar' };
    }
  }

  if (typeof process.env.ISHIKU_SETUP_SECRET === 'string' && process.env.ISHIKU_SETUP_SECRET.trim()) {
    return { configured: true, value: process.env.ISHIKU_SETUP_SECRET.trim(), source: 'env' };
  }

  return { configured: false, error: 'ISHIKU_SETUP_SECRET_FILE oder ISHIKU_SETUP_SECRET fehlt' };
}

function validateSetupPassword({ password, passwordConfirm, setupSecret, username }) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Admin-Passwort muss mindestens 12 Zeichen lang sein');
  }
  if (password !== passwordConfirm) {
    throw new Error('Passwort und Wiederholung stimmen nicht ueberein');
  }
  const normalized = password.trim().toLowerCase();
  if (password === setupSecret) {
    throw new Error('Admin-Passwort darf nicht mit dem Setup-Secret uebereinstimmen');
  }
  if (PLACEHOLDER_PASSWORDS.has(normalized)) {
    throw new Error('Bitte kein Platzhalter-Passwort verwenden');
  }
  if ([username, APP_MANIFEST.app_id, APP_MANIFEST.app_name].some((value) => normalized === String(value || '').trim().toLowerCase())) {
    throw new Error('Admin-Passwort darf nicht Benutzername, App-ID oder App-Name sein');
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, state] of loginAttempts) {
    if (now - state.firstSeen > LOGIN_WINDOW_MS + LOGIN_BLOCK_MS) {
      loginAttempts.delete(key);
    }
  }
  for (const [key, state] of setupAttempts) {
    if (now - state.firstSeen > SETUP_RATE_WINDOW_MS + SETUP_RATE_BLOCK_MS) {
      setupAttempts.delete(key);
    }
  }
}, LOGIN_RATE_SWEEP_MS).unref();

// ---------- Storage ----------

const DATA_DIR = process.env.ISHIKU_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, 'data');
const ICON_DIR = path.join(DATA_DIR, 'icons');
const linksStore    = new Storage(path.join(DATA_DIR, 'links.json'),    DEFAULT_LINKS);
const settingsStore = new Storage(path.join(DATA_DIR, 'settings.json'), DEFAULT_SETTINGS);
const authStore     = new Storage(path.join(DATA_DIR, 'auth.json'),     DEFAULT_AUTH);

/**
 * Beim Start sicherstellen, dass auth.json einen gültigen Hash hat.
 * Migriert vorhandene Auth-Daten, ohne neue Default-Credentials anzulegen.
 */
async function ensureAuth() {
  if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET muss in Produktion gesetzt sein');
  }

  const auth = await authStore.read();
  if (auth.passwordHash && auth.username && auth.setupCompleted !== true) {
    auth.displayName = auth.displayName || auth.username;
    auth.email = auth.email || '';
    auth.setupCompleted = true;
    auth.createdAt = auth.createdAt || new Date().toISOString();
    await authStore.write(auth);
  }
  return auth;
}

function hasAdmin(auth) {
  return !!(auth && auth.passwordHash && auth.username);
}

async function setupRequired() {
  const auth = await authStore.read();
  return !hasAdmin(auth) || auth.setupCompleted !== true;
}

async function requireSetupComplete(req, res, next) {
  try {
    if (await setupRequired()) {
      if (req.path.startsWith('/api/')) {
        return res.status(428).json({ error: 'Ersteinrichtung erforderlich', setupRequired: true });
      }
      return res.redirect('/setup');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

// ---------- Validation ----------

function validateLinks(input) {
  if (!Array.isArray(input)) throw new Error('Feld "links" muss ein Array sein');
  if (input.length > 200)    throw new Error('Maximal 200 Links erlaubt');
  return input.map((l, i) => {
    if (!l || typeof l !== 'object') throw new Error(`Link ${i + 1}: ungültiges Objekt`);
    const title = typeof l.title === 'string' ? l.title.trim() : '';
    const url   = typeof l.url   === 'string' ? l.url.trim()   : '';
    if (!title) throw new Error(`Link ${i + 1}: title fehlt`);
    if (!url)   throw new Error(`Link ${i + 1}: url fehlt`);
    const parsedUrl = parseHttpUrl(url, `Link ${i + 1}: url`);
    const out = { title: title.slice(0, 100), url: parsedUrl.toString().slice(0, 2000) };
    if (typeof l.icon === 'string' && l.icon.trim()) out.icon = l.icon.trim().slice(0, 240);
    if (Number.isInteger(l.color) && l.color >= 0 && l.color < PALETTE_SIZE) {
      out.color = l.color;
    } else {
      out.color = domainColorIndex(parsedUrl.hostname);
    }
    return out;
  });
}

function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('Settings ungültig');
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  if (typeof input.name === 'string') out.name = input.name.trim().slice(0, 50);

  if (input.location && typeof input.location === 'object') {
    const lat = Number(input.location.latitude);
    const lon = Number(input.location.longitude);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90)   out.location.latitude  = lat;
    if (Number.isFinite(lon) && lon >= -180 && lon <= 180) out.location.longitude = lon;
    if (typeof input.location.name === 'string')     out.location.name     = input.location.name.trim().slice(0, 100);
    if (typeof input.location.timezone === 'string') out.location.timezone = input.location.timezone.trim().slice(0, 64);
  }

  if (input.weather && typeof input.weather === 'object') {
    out.weather.enabled = !!input.weather.enabled;
    if (input.weather.unit === 'celsius' || input.weather.unit === 'fahrenheit') {
      out.weather.unit = input.weather.unit;
    }
    const refresh = parseInt(input.weather.refreshMinutes, 10);
    if (Number.isInteger(refresh) && refresh >= 5 && refresh <= 720) {
      out.weather.refreshMinutes = refresh;
    }
  }

  if (input.display && typeof input.display === 'object') {
    const lpp = parseInt(input.display.linksPerPage, 10);
    if ([4, 6, 8, 9, 12].includes(lpp)) out.display.linksPerPage = lpp;
    out.display.dynamicAccent = !!input.display.dynamicAccent;
    if (typeof input.display.searchEngine === 'string' && SEARCH_ENGINES[input.display.searchEngine]) {
      out.display.searchEngine = input.display.searchEngine;
    }
  }

  return out;
}

// ---------- App ----------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // damit Secure-Cookie hinter Reverse Proxy funktioniert
app.use(securityHeaders);
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/healthz', (req, res) => res.json({ ok: true, app: APP_MANIFEST.app_id }));
app.get('/readyz', async (req, res) => {
  try {
    await Promise.all([linksStore.read(), settingsStore.read(), authStore.read()]);
    res.json({ ok: true, app: APP_MANIFEST.app_id, data: 'ready' });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'not ready' });
  }
});

app.use(forceHttps);
app.use(requireMobile);

// ---------- Statische Assets (öffentlich): nur CSS und JS ----------
// HTML-Dateien werden NICHT über express.static ausgeliefert,
// damit /admin.html, /index.html etc. nicht direkt aufrufbar sind.
const staticOptions = {
  etag: true,
  maxAge: IS_PRODUCTION ? '1h' : 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', IS_PRODUCTION ? 'public, max-age=3600, must-revalidate' : 'no-store');
  }
};
app.use('/css', express.static(path.join(__dirname, 'public/css'), staticOptions));
app.use('/js',  express.static(path.join(__dirname, 'public/js'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), staticOptions));
app.get('/icons/psu-icons.svg', (req, res) => {
  res.setHeader('Cache-Control', IS_PRODUCTION ? 'public, max-age=3600, must-revalidate' : 'no-store');
  res.sendFile(path.join(__dirname, 'public/icons/psu-icons.svg'));
});
app.get('/app.manifest.json', (req, res) => {
  withNoStore(res).sendFile(path.join(__dirname, 'app.manifest.json'));
});

// ---------- Öffentliche Routen ----------

app.get('/setup', async (req, res, next) => {
  try {
    if (!(await setupRequired())) return res.redirect('/login');
    return sendHtml(res, 'setup.html');
  } catch (err) {
    return next(err);
  }
});

app.get('/api/setup/status', async (req, res) => {
  try {
    const required = await setupRequired();
    if (!required) return res.json({ setupRequired: false, secretConfigured: false });
    const secret = await readSetupSecretState();
    res.json({
      setupRequired: true,
      secretConfigured: secret.configured,
      error: secret.configured ? '' : secret.error
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/setup/register', async (req, res) => {
  try {
    if (!(await setupRequired())) {
      return res.status(409).json({ error: 'Setup ist bereits abgeschlossen' });
    }
    if (setupRateLimited(req)) {
      return setTimeout(() => res.status(429).json({ error: 'Zu viele Setup-Versuche. Bitte spaeter erneut versuchen.' }), 400);
    }

    const secret = await readSetupSecretState();
    if (!secret.configured) {
      noteSetupFailure(req);
      return res.status(503).json({ error: secret.error || 'Setup-Secret nicht konfiguriert' });
    }

    const { setupSecret, displayName, username, email, password, passwordConfirm } = req.body || {};
    if (!timingSafeStringEqual(setupSecret, secret.value)) {
      noteSetupFailure(req);
      return setTimeout(() => res.status(401).json({ error: 'Setup-Secret ist falsch' }), 400);
    }

    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanUsername || cleanUsername.length > 64) {
      throw new Error('Admin-Benutzername muss zwischen 1 und 64 Zeichen lang sein');
    }
    if (!cleanDisplayName || cleanDisplayName.length > 80) {
      throw new Error('Anzeigename muss zwischen 1 und 80 Zeichen lang sein');
    }
    if (cleanEmail && cleanEmail.length > 160) {
      throw new Error('E-Mail ist zu lang');
    }

    validateSetupPassword({ password, passwordConfirm, setupSecret: secret.value, username: cleanUsername });

    const auth = await authStore.read();
    if (hasAdmin(auth) && auth.setupCompleted === true) {
      return res.status(409).json({ error: 'Setup ist bereits abgeschlossen' });
    }

    auth.username = cleanUsername;
    auth.displayName = cleanDisplayName;
    auth.email = cleanEmail;
    auth.passwordHash = await hashPassword(password);
    auth.setupCompleted = true;
    auth.createdAt = new Date().toISOString();
    await authStore.write(auth);

    const settings = await settingsStore.read();
    settings.name = cleanDisplayName;
    await settingsStore.write(validateSettings(settings));

    clearSetupFailures(req);
    const cookie = createSession({ user: auth.username });
    res.cookie('session', cookie, {
      httpOnly: true,
      sameSite: 'strict',
      secure: requestIsSecure(req),
      maxAge: SESSION_DURATION_MS,
      path: '/'
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/login', async (req, res, next) => {
  try {
    if (await setupRequired()) return res.redirect('/setup');
    return sendHtml(res, 'login.html');
  } catch (err) {
    return next(err);
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (await setupRequired()) {
    return res.status(428).json({ error: 'Ersteinrichtung erforderlich', setupRequired: true });
  }
  if (loginRateLimited(req, username)) {
    return setTimeout(() => res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte spaeter erneut versuchen.' }), 400);
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    noteLoginFailure(req, username);
    return setTimeout(() => res.status(401).json({ error: 'Falsche Anmeldedaten' }), 400);
  }
  try {
    const auth = await authStore.read();
    const userOk = !!auth.username && username === auth.username;
    const passOk = userOk && await verifyPassword(password, auth.passwordHash);
    if (!passOk) {
      noteLoginFailure(req, username);
      return setTimeout(() => res.status(401).json({ error: 'Falsche Anmeldedaten' }), 400);
    }
    clearLoginFailures(req, username);
    const cookie = createSession({ user: auth.username });
    res.cookie('session', cookie, {
      httpOnly: true,
      sameSite: 'strict',
      secure: requestIsSecure(req),
      maxAge: SESSION_DURATION_MS,
      path: '/'
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session', {
    path: '/',
    sameSite: 'strict',
    secure: requestIsSecure(req)
  });
  res.json({ ok: true });
});

// ---------- Ab hier: Auth erforderlich ----------

app.use(requireSetupComplete);
app.use(requireAuth);

app.use('/icons', express.static(ICON_DIR, {
  etag: true,
  maxAge: ICON_CACHE_MAX_AGE,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Startseite (auth)
app.get('/', (req, res) => {
  sendHtml(res, 'index.html');
});

app.get('/api/data', async (req, res) => {
  try {
    const [linksDoc, settings, auth] = await Promise.all([linksStore.read(), settingsStore.read(), authStore.read()]);
    res.json({
      links: linksDoc.links || [],
      settings,
      searchEngines: SEARCH_ENGINES,
      app: APP_MANIFEST,
      user: {
        username: auth.username,
        displayName: auth.displayName || settings.name || auth.username,
        email: auth.email || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-UI
app.get('/admin', (req, res) => {
  sendHtml(res, 'admin.html');
});

app.get('/api/admin/data', async (req, res) => {
  try {
    const [linksDoc, settings, auth] = await Promise.all([linksStore.read(), settingsStore.read(), authStore.read()]);
    res.json({
      links: linksDoc.links || [],
      settings,
      searchEngines: SEARCH_ENGINES,
      app: APP_MANIFEST,
      user: {
        username: auth.username,
        displayName: auth.displayName || settings.name || auth.username,
        email: auth.email || '',
        setupCompleted: auth.setupCompleted === true,
        dataDir: DATA_DIR,
        logLevel: process.env.ISHIKU_LOG_LEVEL || 'info'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/links', async (req, res) => {
  try {
    const links = validateLinks(req.body && req.body.links);
    await linksStore.write({ links });
    res.json({ ok: true, count: links.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/settings', async (req, res) => {
  try {
    const settings = validateSettings(req.body);
    await settingsStore.write(settings);
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Geocoding-Proxy
app.get('/api/admin/geocode', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Parameter "q" erforderlich' });
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=de&format=json`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'nestiku/1.0' },
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
    });
    if (!r.ok) throw new Error('Geocoding-Fehler: HTTP ' + r.status);
    const data = await r.json();
    const results = (data.results || []).map(x => ({
      name: x.name,
      country: x.country,
      admin1: x.admin1,
      latitude: x.latitude,
      longitude: x.longitude,
      timezone: x.timezone,
      label: [x.name, x.admin1, x.country].filter(Boolean).join(', ')
    }));
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Credentials lesen (nur Username — Hash kommt nie raus)
app.get('/api/admin/favicon', async (req, res) => {
  const url = (req.query.url || '').toString().trim();
  if (!url) return res.status(400).json({ error: 'Parameter "url" erforderlich' });
  try {
    const result = await cacheFavicon(url);
    if (!result.icon) {
      return res.status(404).json({
        error: 'Kein Icon gefunden',
        color: result.color,
        domain: result.domain
      });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/credentials', async (req, res) => {
  try {
    const auth = await authStore.read();
    res.json({ username: auth.username, displayName: auth.displayName || '', email: auth.email || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Credentials ändern
app.put('/api/admin/credentials', async (req, res) => {
  try {
    const { currentPassword, newUsername, newDisplayName, newEmail, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ error: 'Aktuelles Passwort erforderlich' });
    }
    const auth = await authStore.read();
    const ok = await verifyPassword(currentPassword, auth.passwordHash);
    if (!ok) {
      return setTimeout(() => res.status(401).json({ error: 'Aktuelles Passwort ist falsch' }), 400);
    }
    let usernameChanged = false;
    let profileChanged = false;
    let passwordChanged = false;
    if (typeof newUsername === 'string' && newUsername.trim() && newUsername.trim() !== auth.username) {
      const u = newUsername.trim();
      if (u.length < 1 || u.length > 64) {
        return res.status(400).json({ error: 'Benutzername zwischen 1 und 64 Zeichen' });
      }
      auth.username = u;
      usernameChanged = true;
    }
    if (typeof newDisplayName === 'string' && newDisplayName.trim() && newDisplayName.trim() !== (auth.displayName || '')) {
      const displayName = newDisplayName.trim();
      if (displayName.length > 80) {
        return res.status(400).json({ error: 'Anzeigename ist zu lang' });
      }
      auth.displayName = displayName;
      profileChanged = true;
      const settings = await settingsStore.read();
      settings.name = displayName;
      await settingsStore.write(validateSettings(settings));
    }
    if (typeof newEmail === 'string' && newEmail.trim() !== (auth.email || '')) {
      const email = newEmail.trim();
      if (email.length > 160) {
        return res.status(400).json({ error: 'E-Mail ist zu lang' });
      }
      auth.email = email;
      profileChanged = true;
    }
    if (typeof newPassword === 'string' && newPassword.length > 0) {
      if (newPassword.length < 12) {
        return res.status(400).json({ error: 'Neues Passwort muss mindestens 12 Zeichen haben' });
      }
      if (newPassword.length > 200) {
        return res.status(400).json({ error: 'Neues Passwort ist zu lang' });
      }
      auth.passwordHash = await hashPassword(newPassword);
      passwordChanged = true;
    }
    if (!usernameChanged && !profileChanged && !passwordChanged) {
      return res.status(400).json({ error: 'Keine Änderungen — gib neuen Benutzernamen oder Passwort an' });
    }
    await authStore.write(auth);
    res.json({ ok: true, username: auth.username, usernameChanged, profileChanged, passwordChanged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Fehlerhandler ----------

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint nicht gefunden' });
  }
  next();
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Nicht gefunden');
});

app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

// ---------- Start ----------

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

ensureAuth()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Nestiku laeuft auf http://${HOST}:${PORT}`);
      if (!process.env.SESSION_SECRET) {
        console.warn('  ⚠  SESSION_SECRET nicht gesetzt — bitte für Produktion setzen!');
      }
    });
  })
  .catch(err => {
    console.error('Start fehlgeschlagen:', err);
    process.exit(1);
  });
