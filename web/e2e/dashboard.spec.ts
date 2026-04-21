import { test, expect } from '@playwright/test';
import { fx } from './lib/fixtures';
import { resetDB } from './lib/reset';

test.beforeAll(() => resetDB());
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'agency'));
});

test.describe('dashboard', () => {
  test('renders histogram and stacked-bar charts for Acme + v1', async ({ page }) => {
    await page.goto('/agency/dashboard');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Security Partners' });

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Score distribution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /band counts/i })).toBeVisible();

    // Both chart cards have an svg rendered by recharts.
    const cards = page.locator('.chart-card');
    await expect(cards).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(cards.nth(i).locator('svg').first()).toBeVisible();
    }
  });

  test('band chips above charts reflect the template scoring bands', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto('/agency/dashboard');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Security Partners' });

    // Pick the seeded v1 explicitly.
    await page.locator('.filters .select').first().selectOption({ value: tpl.id });

    for (const b of tpl.bands) {
      await expect(page.locator('.filters .badge.band', { hasText: b.label })).toBeVisible();
    }
  });

  test('instrument picker lists only published templates', async ({ page }) => {
    await page.goto('/agency/dashboard');
    const picker = page.locator('.filters .select').first();
    const options = await picker.locator('option').allTextContents();

    // No archived templates appear — seeded archived one is "Legacy perimeter checklist (deprecated)".
    for (const o of options) {
      expect(o.toLowerCase()).not.toContain('legacy perimeter');
    }
    // At least the two published templates appear.
    expect(options.length).toBeGreaterThanOrEqual(2);
  });

  test('empty state when agency has no submitted screenings', async ({ page }) => {
    await page.goto('/agency/dashboard');
    await page.getByLabel('Select agency').selectOption({ label: 'Summit Audit Group' });

    // For Summit the band-counts card should render the empty state.
    // (Distribution histogram still renders with all-zero buckets.)
    await expect(page.locator('.chart-card', { hasText: /band counts/i }).locator('.empty')).toBeVisible();
  });
});
