'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_AGE_MS = 24 * 60 * 60 * 1000;
let sessionSecret = process.env.SESSION_SECRET || '';

function secret() {
  const value = sessionSecret || process.env.SESSION_SECRET || '';
  if (!value) throw new Error('Session secret is not initialized.');
  return value;
}

function setSessionSecret(value) {
  sessionSecret = String(value || '');
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1
  });
}

async function verifyLegacyScrypt(password, stored) {
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

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (stored.startsWith('$argon2id$')) {
    try {
      return await argon2.verify(stored, password);
    } catch {
      return false;
    }
  }
  return verifyLegacyScrypt(password, stored);
}

function needsPasswordRehash(stored) {
  return typeof stored === 'string' && !stored.startsWith('$argon2id$');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSessionToken(token) {
  return crypto.createHmac('sha256', secret()).update(String(token || '')).digest('base64url');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  SESSION_MAX_AGE_MS,
  SESSION_IDLE_AGE_MS,
  createSessionToken,
  hashSessionToken,
  hashPassword,
  needsPasswordRehash,
  setSessionSecret,
  timingSafeEqualString,
  verifyPassword
};
