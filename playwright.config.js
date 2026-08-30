'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestiku-playwright-'));

module.exports = defineConfig({
  testDir: './tests/ui',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:41731',
    browserName: 'chromium',
    colorScheme: 'light',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:41731/readyz',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: '41731',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      NESTIKU_DATA_DIR: dataDir,
      SESSION_SECRET: 'synthetic-playwright-session-secret',
      ISHIKU_SETUP_SECRET: 'synthetic-playwright-setup-secret'
    }
  }
});
