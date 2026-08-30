'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const test = require('node:test');

const {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  needsPasswordRehash,
  setSessionSecret,
  verifyPassword
} = require('../src/auth');

test('Argon2id hashing meets the ishiku baseline', async () => {
  const password = 'synthetic-test-password-123';
  const hash = await hashPassword(password);
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(needsPasswordRehash(hash), false);
});

test('legacy scrypt hashes remain valid for upgrade-on-login', async () => {
  const password = 'synthetic-test-password-123';
  const salt = crypto.randomBytes(16);
  const derived = await promisify(crypto.scrypt)(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const legacy = `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(await verifyPassword('wrong-password', legacy), false);
  assert.equal(needsPasswordRehash(legacy), true);
});

test('session tokens are random and stored only as keyed hashes', () => {
  setSessionSecret('synthetic-session-secret-for-tests-only');
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
});

test('session token hashing fails closed before secret initialization', () => {
  setSessionSecret('');
  assert.throws(() => hashSessionToken('synthetic-token'), /not initialized/);
  setSessionSecret('synthetic-session-secret-for-tests-only');
});
