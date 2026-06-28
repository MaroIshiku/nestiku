'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const scryptAsync = promisify(crypto.scrypt);

// ---------- Cookie-Session (HMAC-signiert) ----------

function getSecret() {
  return process.env.SESSION_SECRET || 'development-secret-please-override';
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${hmac}`;
}

function verify(cookie) {
  if (!cookie || typeof cookie !== 'string') return null;
  const idx = cookie.lastIndexOf('.');
  if (idx < 1) return null;
  const data = cookie.slice(0, idx);
  const sig  = cookie.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(payload = {}) {
  return sign({ ...payload, exp: Date.now() + SESSION_DURATION_MS });
}

// ---------- Passwort-Hashing (scrypt) ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1, keylen = 64;
  const hash = await scryptAsync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!N || !r || !p) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  try {
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- Next-URL absichern (gegen Open Redirects) ----------

function safeNextUrl(next) {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

// ---------- Middleware ----------

function requireAuth(req, res, next) {
  const cookie = req.cookies && req.cookies.session;
  if (verify(cookie)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }
  const target = encodeURIComponent(req.originalUrl || '/');
  return res.redirect('/login?next=' + target);
}

module.exports = {
  createSession,
  hashPassword,
  verifyPassword,
  safeNextUrl,
  requireAuth,
  SESSION_DURATION_MS
};
