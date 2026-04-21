import { test, expect } from '@playwright/test';
import { fx, createTestTemplate } from './lib/fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'agency'));
});

async function newCasefile(suffix = `${Date.now()}`) {
  const acme = await fx.getAgencyByName('Acme Security Partners');
  const client = await fx.createClient(acme.id, `Submit Client ${suffix}`);
  const tpl = await createTestTemplate(`submit-${suffix}`);
  const screening = await fx.createScreening(acme.id, client.id, tpl.id);
  return { acme, client, tpl, screening };
}

test.describe('can-submit gating', () => {
  test('submit button is disabled and blocker banner lists required unanswered questions', async ({
    page,
  }) => {
    const { screening } = await newCasefile('gating');
    await page.goto(`/agency/screenings/${screening.id}`);

    const submit = page.getByRole('button', { name: /submit screening/i });
    await expect(submit).toBeDisabled();

    // Banner should show required questions (2 required in the test template).
    const banner = page.locator('.banner', { hasText: /required question/i });
    await expect(banner).toBeVisible();
    await expect(banner.locator('li')).toHaveCount(2);
  });

  test('submit button becomes enabled after all required visible questions are answered', async ({
    page,
  }) => {
    const { screening } = await newCasefile('enable');
    await page.goto(`/agency/screenings/${screening.id}`);

    // Answer the true_false question (required).
    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();

    // Answer the likert question (required).
    const likert = page.locator('.likert').first();
    await likert.locator('.likert-opt').nth(3).click();

    await page.waitForTimeout(1200);
    await expect(page.getByRole('button', { name: /submit screening/i })).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByText(/ready to submit/i)).toBeVisible();
  });

  test('answering a conditional does not change required-count when only non-required questions are under the conditional', async ({
    page,
  }) => {
    // In our test template, the conditional follow-up is NOT required. Answering its parent
    // "No" still leaves the main required questions (tf + likert) to answer.
    const { screening } = await newCasefile('cond-req');
    await page.goto(`/agency/screenings/${screening.id}`);

    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').nth(1).click(); // No → reveals conditional
    await page.waitForTimeout(1200);

    // TF is now answered → only the likert required remains.
    const banner = page.locator('.banner', { hasText: /required question/i });
    await expect(banner.locator('li')).toHaveCount(1);
  });
});

test.describe('submit lifecycle', () => {
  test('submit locks the screening and persists final score + band', async ({ page }) => {
    const { screening } = await newCasefile('lock');
    await page.goto(`/agency/screenings/${screening.id}`);

    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();
    await page.locator('.likert-opt').nth(3).click();
    await page.waitForTimeout(1200);

    // Capture the live score before submit.
    const liveNumeral = (await page.locator('.score-numeral').textContent())?.trim() ?? '';
    const liveBand = (await page.locator('.score-band-chip').textContent())?.trim() ?? '';

    await page.getByRole('button', { name: /submit screening/i }).click();

    // Lock assertions.
    await expect(page.getByText(/submitted · locked/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.badge.status-submitted')).toBeVisible();
    await expect(page.locator('.score-plate .rule-label')).toHaveText(/final · persisted/i);

    // Persisted score + band equal live values at submit time.
    await expect(page.locator('.score-numeral')).toContainText(liveNumeral.split(' ')[0]);
    await expect(page.locator('.score-band-chip')).toContainText(liveBand);

    // Button relabels to "Submitted" and is disabled.
    const locked = page.getByRole('button', { name: /^submitted$/i });
    await expect(locked).toBeVisible();
    await expect(locked).toBeDisabled();
  });

  test('after submit, question inputs are not interactive (locked)', async ({ page }) => {
    const { screening } = await newCasefile('post-lock');
    await page.goto(`/agency/screenings/${screening.id}`);

    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();
    await page.locator('.likert-opt').nth(3).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /submit screening/i }).click();
    await expect(page.getByText(/submitted · locked/i)).toBeVisible();

    // Radio inputs should all be disabled post-submit.
    const radios = tf.locator('input[type="radio"]');
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      await expect(radios.nth(i)).toBeDisabled();
    }

    // Likert radios also disabled.
    const likertRadios = page.locator('.likert input[type="radio"]');
    const lcount = await likertRadios.count();
    for (let i = 0; i < lcount; i++) {
      await expect(likertRadios.nth(i)).toBeDisabled();
    }

    // Note textarea is disabled too.
    const tfNote = tf.locator('.note-field');
    await tfNote.locator('summary').click();
    await expect(tfNote.locator('textarea')).toBeDisabled();

    // And a click on an unselected option does NOT flip selection (force past the disabled check).
    await tf.locator('.opt').nth(1).click({ force: true });
    await expect(tf.locator('.opt').first()).toHaveClass(/selected/);
    await expect(tf.locator('.opt').nth(1)).not.toHaveClass(/selected/);
  });

  test('submitted screening reappears in the ledger with submitted badge and score', async ({ page }) => {
    const { screening, client } = await newCasefile('ledger-roundtrip');
    await page.goto(`/agency/screenings/${screening.id}`);

    const tf = page.locator('.question').filter({
      has: page.locator('.meta', { hasText: 'true_false' }),
    }).first();
    await tf.locator('.opt').first().click();
    await page.locator('.likert-opt').nth(4).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /submit screening/i }).click();
    await expect(page.getByText(/submitted · locked/i)).toBeVisible();

    // Jump back to the ledger.
    await page.getByRole('link', { name: 'Back to screenings' }).click();
    await expect(page).toHaveURL(/\/agency\/screenings$/);

    const row = page.locator('tbody tr', { hasText: client.name }).first();
    await expect(row.locator('.badge.status-submitted')).toBeVisible();
    await expect(row.locator('.big-num')).toBeVisible();
  });
});
