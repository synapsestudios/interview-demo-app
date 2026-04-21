import { test, expect } from '@playwright/test';
import { fx, createTestTemplate } from './lib/fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'agency'));
});

async function buildCasefile(clientNameSuffix = `${Date.now()}`) {
  const acme = await fx.getAgencyByName('Acme Health');
  const client = await fx.createClient(acme.id, `Detail Client ${clientNameSuffix}`);
  const tpl = await createTestTemplate(`detail-${clientNameSuffix}`);
  const screening = await fx.createScreening(acme.id, client.id, tpl.id);
  return { acme, client, tpl, screening };
}

test.describe('screening detail rendering', () => {
  test('renders section numerals, question types, and score plate', async ({ page }) => {
    const { screening, client } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);

    await expect(page.getByRole('heading', { level: 1, name: client.name })).toBeVisible();
    await expect(page.locator('.score-plate')).toBeVisible();
    await expect(page.locator('.section-head .numeral', { hasText: /§\s*I\b/ })).toBeVisible();
    await expect(page.locator('.section-head .numeral', { hasText: /§\s*II\b/ })).toBeVisible();

    // All three input shapes are rendered somewhere in the form.
    await expect(page.locator('.question .meta', { hasText: 'true_false' }).first()).toBeVisible();
    // Our test template has MC via the conditional follow-up — hidden initially, so skip.
    await expect(page.locator('.question .meta', { hasText: 'likert' }).first()).toBeVisible();
  });

  test('selecting a true/false option toggles the radio visual', async ({ page }) => {
    const { screening } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);

    const tfQuestion = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    const firstOpt = tfQuestion.locator('.opt').first();
    await firstOpt.click();
    await expect(firstOpt).toHaveClass(/selected/);
  });

  test('likert selection marks the clicked chip and clears others', async ({ page }) => {
    const { screening } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);

    const likert = page.locator('.likert').first();
    await likert.locator('.likert-opt').nth(2).click(); // "3 — Neutral"
    await expect(likert.locator('.likert-opt.selected')).toHaveCount(1);
    await likert.locator('.likert-opt').nth(4).click(); // "5 — Strongly Agree"
    await expect(likert.locator('.likert-opt').nth(4)).toHaveClass(/selected/);
    await expect(likert.locator('.likert-opt').nth(2)).not.toHaveClass(/selected/);
  });

  test('live score updates as answers are submitted', async ({ page }) => {
    const { screening } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);

    // Initial live score is 0 or — since no answers yet.
    const numeral = page.locator('.score-numeral');
    const initialText = (await numeral.textContent())?.trim() ?? '';

    // Answer "Yes" on the true/false question (score 10) — should push score above 0.
    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();

    // Wait for autosave debounce (600ms) and re-render.
    await page.waitForTimeout(1200);

    const afterText = (await numeral.textContent())?.trim() ?? '';
    expect(afterText).not.toEqual(initialText);
  });

  test('section breakdown bars render one row per section', async ({ page }) => {
    const { screening, tpl } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);
    const bars = page.locator('.breakdown .breakdown-row');
    await expect(bars).toHaveCount(tpl.sections.length);
  });

  test('per-answer note is persisted', async ({ page }) => {
    const { screening } = await buildCasefile();
    await page.goto(`/agency/screenings/${screening.id}`);

    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();
    await page.waitForTimeout(1200);

    const details = tf.locator('.note-field');
    await details.locator('summary').click();
    const note = `note@${Date.now()}`;
    await details.locator('textarea').fill(note);
    // Wait for autosave.
    await page.waitForTimeout(1200);

    await page.reload();
    const reloadedDetails = page
      .locator('.question')
      .filter({ has: page.locator('.meta', { hasText: 'true_false' }) })
      .first()
      .locator('.note-field');
    await reloadedDetails.locator('summary').click();
    await expect(reloadedDetails.locator('textarea')).toHaveValue(note);
  });
});
