import { test, expect } from '@playwright/test';
import { fx, createTestTemplate } from './lib/fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'agency'));
});

test.describe('conditional / skip logic', () => {
  test('dependent question is hidden until dependency is satisfied, appears when satisfied, disappears when dependency changes away', async ({
    page,
  }) => {
    const acme = await fx.getAgencyByName('Acme Health');
    const client = await fx.createClient(acme.id, `Cond Client ${Date.now()}`);
    const tpl = await createTestTemplate(`cond-${Date.now()}`);
    const screening = await fx.createScreening(acme.id, client.id, tpl.id);
    await page.goto(`/agency/screenings/${screening.id}`);

    const dependentPrompt = 'How long without stable housing?';

    // Initially: q_tf has no answer → dependent question must be hidden.
    await expect(page.getByText(dependentPrompt)).toHaveCount(0);

    // Answer q_tf "No" (the second option) — this satisfies the conditional → dependent appears.
    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').nth(1).click(); // "No"
    await expect(page.getByText(dependentPrompt)).toBeVisible();

    // Change q_tf to "Yes" — dependent should hide again.
    await tf.locator('.opt').first().click();
    await expect(page.getByText(dependentPrompt)).toHaveCount(0);
  });

  test('skipped (hidden) questions do not contribute to total visible count in score plate', async ({ page }) => {
    const acme = await fx.getAgencyByName('Acme Health');
    const client = await fx.createClient(acme.id, `Cond Count ${Date.now()}`);
    const tpl = await createTestTemplate(`cond-count-${Date.now()}`);
    const screening = await fx.createScreening(acme.id, client.id, tpl.id);
    await page.goto(`/agency/screenings/${screening.id}`);

    const counts = page.locator('.counts');

    // Initially, conditional hidden → 2 visible (q_tf + likert).
    await expect(counts).toContainText(/of 2/);

    // Answer "No" on tf → conditional appears → now 3 visible.
    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').nth(1).click();
    await page.waitForTimeout(1200);
    await expect(counts).toContainText(/of 3/);
  });
});
