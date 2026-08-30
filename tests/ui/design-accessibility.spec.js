'use strict';

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const viewports = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

const themes = ['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite'];
const modes = ['light', 'dark'];

test('WCAG, responsive, theme, and modal keyboard contracts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up admin' })).toBeVisible();
  await assertAxe(page, 'first-run setup');

  const setup = await page.request.post('/api/setup/register', {
    data: {
      setupSecret: 'synthetic-playwright-setup-secret',
      displayName: 'Browser Admin',
      username: 'browser-admin',
      email: '',
      password: 'synthetic-browser-password-2026',
      passwordConfirm: 'synthetic-browser-password-2026'
    }
  });
  expect(setup.ok()).toBeTruthy();
  const { csrfToken } = await setup.json();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nestiku' })).toBeVisible();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await assertAxe(page, `${viewport.width}x${viewport.height}`);
  }

  const appData = await (await page.request.get('/api/data')).json();
  for (const theme of themes) {
    for (const mode of modes) {
      const response = await page.request.put('/api/admin/settings', {
        headers: { 'X-CSRF-Token': csrfToken },
        data: {
          ...appData.settings,
          display: { ...appData.settings.display, theme, mode }
        }
      });
      expect(response.ok()).toBeTruthy();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-resolved-mode', mode);
      await assertAxe(page, `${theme}/${mode}`);
    }
  }

  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByText('Sessions', { exact: true })).toBeVisible();
  await expect(page.getByText('Administration', { exact: true })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(close).toBeHidden();
});

async function assertAxe(page, context) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `axe violations in ${context}`).toEqual([]);
}
