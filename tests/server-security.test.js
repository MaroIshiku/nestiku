'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('authentication sessions, CSRF, revocation, and rate limiting', { timeout: 20_000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nestiku-security-'));
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      NESTIKU_DATA_DIR: dataDir,
      SESSION_SECRET: 'synthetic-session-secret-for-tests-only',
      ISHIKU_SETUP_SECRET: 'synthetic-setup-secret-for-tests-only'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  await waitUntilReady(origin, child);
  const setup = await request(origin, '/api/setup/register', {
    method: 'POST',
    body: {
      setupSecret: 'synthetic-setup-secret-for-tests-only',
      displayName: 'Synthetic Admin',
      username: 'synthetic-admin',
      email: '',
      password: 'synthetic-password-20260829',
      passwordConfirm: 'synthetic-password-20260829'
    }
  });
  assert.equal(setup.response.status, 200);
  assert.equal(typeof setup.data.csrfToken, 'string');
  const cookie = setup.response.headers.get('set-cookie').split(';', 1)[0];

  const authenticated = await request(origin, '/api/data', { cookie });
  assert.equal(authenticated.response.status, 200);

  const rejected = await request(origin, '/api/admin/settings', { method: 'PUT', body: {}, cookie });
  assert.equal(rejected.response.status, 403);

  const logout = await request(origin, '/api/logout', {
    method: 'POST',
    cookie,
    csrf: setup.data.csrfToken
  });
  assert.equal(logout.response.status, 200);
  const revoked = await request(origin, '/api/data', { cookie });
  assert.equal(revoked.response.status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await request(origin, '/api/login', {
      method: 'POST',
      body: { username: 'synthetic-admin', password: 'wrong-password' }
    });
    assert.equal(failed.response.status, 401);
  }
  const limited = await request(origin, '/api/login', {
    method: 'POST',
    body: { username: 'synthetic-admin', password: 'wrong-password' }
  });
  assert.equal(limited.response.status, 429);
});

async function request(origin, pathname, options = {}) {
  const headers = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  const response = await fetch(`${origin}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitUntilReady(origin, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Nestiku exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/readyz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Nestiku did not become ready.');
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
