'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const keylen = 64;
  const hash = await scrypt(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, , rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = parseInt(parts[1], 10);
  const r = parseInt(rRaw, 10);
  const p = parseInt(pRaw, 10);
  if (!N || !r || !p) return false;
  try {
    const salt = Buffer.from(saltRaw, 'base64');
    const expected = Buffer.from(hashRaw, 'base64');
    const actual = await scrypt(password, salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createSession(payload) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + SESSION_MAX_AGE_MS
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(cookie) {
  if (!cookie || typeof cookie !== 'string') return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 1) return null;
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  SESSION_MAX_AGE_MS,
  createSession,
  hashPassword,
  timingSafeEqualString,
  verifyPassword,
  verifySession
};
