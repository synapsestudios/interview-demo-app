import { test, expect, Page } from '@playwright/test';
import { fx } from './lib/fixtures';
import { resetDB } from './lib/reset';

test.beforeAll(() => resetDB());
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'admin'));
});

async function createFromList(page: Page) {
  await page.goto('/admin/templates');
  await page.getByRole('button', { name: /new instrument/i }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+\/edit/);
}

test.describe('template authoring — new instrument + metadata', () => {
  test('creating a new instrument lands on the editor with a default name', async ({ page }) => {
    await createFromList(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Untitled instrument' })).toBeVisible();
    await expect(page.getByRole('button', { name: /save & publish/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add section/i })).toBeVisible();
    // The Metadata paper has a name input pre-filled.
    await expect(page.locator('.editor-field-row').first().locator('input')).toHaveValue('Untitled instrument');
  });

  test('rename and describe, save, and the detail view reflects the changes', async ({ page }) => {
    await createFromList(page);
    const url = page.url();
    const id = url.match(/\/admin\/templates\/([^/]+)\/edit/)![1];

    const name = `Housing Intake ${Date.now()}`;
    await page.locator('.editor-field-row').first().locator('input').fill(name);
    await page.locator('.editor-field-row').nth(1).locator('textarea').fill('Authored in e2e.');

    await page.getByRole('button', { name: /^save draft$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });

    await page.goto(`/admin/templates/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('Authored in e2e.')).toBeVisible();
  });
});

test.describe('template authoring — sections + question types', () => {
  test('add a section, add all three question types, save', async ({ page }) => {
    await createFromList(page);

    // Add a section. Its title input carries the default "New section" value.
    await page.getByRole('button', { name: /add section/i }).click();
    const sectionTitle = page.locator('.section-head input[aria-label="Section title"]');
    await expect(sectionTitle).toHaveCount(1);
    await expect(sectionTitle.first()).toHaveValue('New section');

    // Add true/false question — default options are Yes and No.
    await page.getByRole('button', { name: /true \/ false/i }).click();
    await expect(page.locator('.question-edit')).toHaveCount(1);
    await expect(page.locator('.question-edit .option-row')).toHaveCount(2);
    await expect(page.locator('.question-edit .option-row input[type="text"], .question-edit .option-row input:not([type])').nth(0)).toHaveValue('Yes');
    await expect(page.locator('.question-edit .option-row input[type="text"], .question-edit .option-row input:not([type])').nth(1)).toHaveValue('No');

    // Add multiple choice — second question block.
    await page.getByRole('button', { name: /multiple choice/i }).click();
    await expect(page.locator('.question-edit')).toHaveCount(2);
    const mcQuestion = page.locator('.question-edit').nth(1);
    await expect(mcQuestion.locator('.option-row')).toHaveCount(2);

    // Add a third option.
    await mcQuestion.getByRole('button', { name: /\+ option/i }).click();
    await expect(mcQuestion.locator('.option-row')).toHaveCount(3);

    // Add likert — third question block. Should render 5 scored rows.
    await page.getByRole('button', { name: /likert/i }).click();
    await expect(page.locator('.question-edit')).toHaveCount(3);
    const likert = page.locator('.question-edit').nth(2);
    await expect(likert.locator('.option-row')).toHaveCount(5);

    // Save
    await page.getByRole('button', { name: /^save draft$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });
  });

  test('mark a question required and adjust weight', async ({ page }) => {
    await createFromList(page);
    await page.getByRole('button', { name: /add section/i }).click();
    await page.getByRole('button', { name: /true \/ false/i }).click();

    const q = page.locator('.question-edit').first();
    await q.locator('input[type="checkbox"]').check();
    const weightInput = q.locator('input[type="number"]').first();
    await weightInput.fill('2');

    await page.getByRole('button', { name: /^save draft$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });
    // After save, state should still show required checked and weight = 2.
    await expect(q.locator('input[type="checkbox"]')).toBeChecked();
    await expect(weightInput).toHaveValue('2');
  });

  test('reorder and delete sections', async ({ page }) => {
    await createFromList(page);
    await page.getByRole('button', { name: /add section/i }).click();
    await page.getByRole('button', { name: /add section/i }).click();

    const sections = page.locator('.section-head input[aria-label="Section title"]');
    await expect(sections).toHaveCount(2);
    await sections.nth(0).fill('Alpha');
    await sections.nth(1).fill('Beta');

    // Move first section down.
    const firstSectionHead = page.locator('.section-head').nth(0);
    await firstSectionHead.getByRole('button', { name: 'Move section down' }).click();

    await expect(page.locator('.section-head input[aria-label="Section title"]').nth(0)).toHaveValue('Beta');
    await expect(page.locator('.section-head input[aria-label="Section title"]').nth(1)).toHaveValue('Alpha');

    // Delete the first (Beta).
    await page
      .locator('.section-head')
      .nth(0)
      .getByRole('button', { name: 'Delete section' })
      .click();
    await expect(page.locator('.section-head input[aria-label="Section title"]')).toHaveCount(1);
    await expect(page.locator('.section-head input[aria-label="Section title"]').first()).toHaveValue('Alpha');
  });
});

test.describe('template authoring — scoring bands', () => {
  test('add, rename, and delete bands', async ({ page }) => {
    await createFromList(page);

    const bandsPaper = page.locator('.paper', { hasText: 'Scoring bands' });
    await bandsPaper.getByRole('button', { name: /\+ band/i }).click();
    await expect(bandsPaper.locator('.band-row')).toHaveCount(1);

    const row = bandsPaper.locator('.band-row').first();
    await row.locator('input[placeholder="Label"]').fill('High risk');
    await row.locator('input[aria-label="Min score"]').fill('0');
    await row.locator('input[aria-label="Max score"]').fill('40');

    await page.getByRole('button', { name: /^save draft$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });

    // Delete it.
    await bandsPaper.locator('.band-row .tool-btn').first().click();
    await expect(bandsPaper.locator('.band-row')).toHaveCount(0);
  });
});

test.describe('template authoring — conditionals', () => {
  test('add a conditional that gates a question on an earlier answer', async ({ page }) => {
    await createFromList(page);
    await page.getByRole('button', { name: /add section/i }).click();

    // Two t/f questions — the second will be conditional on the first.
    await page.getByRole('button', { name: /true \/ false/i }).click();
    await page.getByRole('button', { name: /true \/ false/i }).click();

    const questions = page.locator('.question-edit');
    await expect(questions).toHaveCount(2);

    // Edit prompts so the select is readable.
    await questions.nth(0).locator('textarea').first().fill('Do you have housing?');
    await questions.nth(1).locator('textarea').first().fill('Where are you staying?');

    // Add conditional on the second question.
    await questions
      .nth(1)
      .getByRole('button', { name: /show only when/i })
      .click();

    // Conditional row should reference Q1 by prompt.
    const cond = questions.nth(1).locator('.conditional-row');
    await expect(cond).toBeVisible();
    // Depends-on question select defaults to first other question.
    const depQ = cond.locator('select').first();
    await expect(depQ).toHaveValue(/.+/);
    const depQLabel = await depQ.locator('option:checked').textContent();
    expect(depQLabel).toMatch(/housing/i);

    // Save and reload — conditional should round-trip.
    await page.getByRole('button', { name: /^save draft$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });

    const url = page.url();
    const id = url.match(/\/admin\/templates\/([^/]+)\/edit/)![1];
    const t = await fx.getTemplate(id);
    const withCond = t.sections.flatMap((s) => s.questions).find((q) => q.conditionals.length > 0);
    expect(withCond).toBeTruthy();
    expect(withCond!.prompt).toMatch(/Where are you staying/);
  });
});

test.describe('template authoring — save & publish', () => {
  test('save & publish moves the template to published and returns to the list', async ({ page }) => {
    await createFromList(page);
    await page.locator('.editor-field-row').first().locator('input').fill(`Publish flow ${Date.now()}`);

    // Add a minimal structure so publish is meaningful (not required by the API).
    await page.getByRole('button', { name: /add section/i }).click();
    await page.getByRole('button', { name: /true \/ false/i }).click();

    await page.getByRole('button', { name: /save & publish/i }).click();

    await expect(page).toHaveURL(/\/admin\/templates$/);
    // The new template row should be published.
    const row = page.locator('tbody tr').filter({ hasText: /Publish flow/ }).first();
    await expect(row.locator('.badge.status-published')).toBeVisible();
  });
});
