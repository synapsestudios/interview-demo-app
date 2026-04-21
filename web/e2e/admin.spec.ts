import { test, expect } from '@playwright/test';
import { fx, createTestTemplate } from './lib/fixtures';
import { resetDB } from './lib/reset';

test.beforeAll(() => resetDB());
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mode', 'admin'));
});

test.describe('admin: templates list + status', () => {
  test('lists all seeded templates with correct status badges', async ({ page }) => {
    await page.goto('/admin/templates');
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.badge.status-published').first()).toBeVisible();
    await expect(page.locator('.badge.status-archived').first()).toBeVisible();
  });

  test('clicking a row navigates to its detail', async ({ page }) => {
    await page.goto('/admin/templates');
    const firstLink = page.locator('tbody tr a').first();
    const name = (await firstLink.textContent())?.trim() ?? '';
    await firstLink.click();
    await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+/);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  });
});

test.describe('admin: template detail rendering', () => {
  test('each seeded section renders', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto(`/admin/templates/${tpl.id}`);
    // Our seeded v1 has 4 sections; they should all be visible as headings.
    const sectionTitles = tpl.sections.map((s) => s.title);
    for (const title of sectionTitles) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
  });

  test('scoring bands are shown with swatches', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto(`/admin/templates/${tpl.id}`);
    await expect(page.getByText('Scoring bands')).toBeVisible();
    // Assert each seeded band label shows up in the template detail view.
    for (const b of tpl.bands) {
      await expect(page.getByText(b.label, { exact: false }).first()).toBeVisible();
    }
  });

  test('published template shows locked banner', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto(`/admin/templates/${tpl.id}`);
    await expect(page.getByText(/Template locked/i)).toBeVisible();
  });

  test('true_false, multiple_choice, and likert each render correctly', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto(`/admin/templates/${tpl.id}`);

    // Seeded v1 has at least one of each type. Verify by searching for the meta "type" text.
    await expect(page.locator('.question .meta', { hasText: 'true_false' }).first()).toBeVisible();
    await expect(page.locator('.question .meta', { hasText: 'multiple_choice' }).first()).toBeVisible();
    await expect(page.locator('.question .meta', { hasText: 'likert' }).first()).toBeVisible();
  });
});

test.describe('admin: publish / fork / archive', () => {
  test('publishing a draft moves it to published', async ({ page }) => {
    // Create a draft directly via API, then act on it in the UI.
    const draft = await fx.createTemplate({
      name: `Publish-test ${Date.now()}`,
      sections: [
        {
          title: 'S',
          order: 0,
          questions: [
            {
              prompt: 'Q?',
              type: 'true_false',
              required: true,
              order: 0,
              options: [
                { label: 'Yes', score: 10, order: 0 },
                { label: 'No', score: 0, order: 1 },
              ],
            },
          ],
        },
      ],
    });

    await page.goto('/admin/templates');
    const row = page.locator('tbody tr', { hasText: draft.name });
    await expect(row.locator('.badge.status-draft')).toBeVisible();
    await row.getByRole('button', { name: 'Publish' }).click();
    await expect(row.locator('.badge.status-published')).toBeVisible({ timeout: 5_000 });
  });

  test('forking a published template creates a draft at v+1 with parent lineage', async ({ page }) => {
    const src = await createTestTemplate(`fork-source-${Date.now()}`);

    await page.goto('/admin/templates');
    const sourceRow = page.locator('tbody tr', { hasText: src.name }).first();
    await sourceRow.getByRole('button', { name: 'Fork' }).click();

    // A new row with the same name should appear at v2 as draft.
    const rows = page.locator('tbody tr', { hasText: src.name });
    await expect(rows).toHaveCount(2, { timeout: 5_000 });

    const v2Row = rows.filter({ hasText: 'v2' });
    await expect(v2Row.locator('.badge.status-draft')).toBeVisible();

    // The Lineage cell of v2 should reference the parent id's first 8 chars.
    const lineageCell = v2Row.locator('td').nth(3);
    await expect(lineageCell).toContainText(src.id.slice(0, 8));
  });

  test('archiving a template moves it to archived', async ({ page }) => {
    const tpl = await createTestTemplate(`archive-${Date.now()}`);

    page.on('dialog', (d) => d.accept());

    await page.goto('/admin/templates');
    const row = page.locator('tbody tr', { hasText: tpl.name }).first();
    await row.getByRole('button', { name: 'Archive' }).click();

    await expect(row.locator('.badge.status-archived')).toBeVisible({ timeout: 5_000 });
  });

  test('published template shows no editable controls — only Fork and Archive', async ({ page }) => {
    const tpl = await fx.getFirstPublishedV1();
    await page.goto('/admin/templates');
    const row = page.locator('tbody tr', { hasText: tpl.name }).first();
    await expect(row.getByRole('button', { name: 'Fork' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Archive' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: /edit/i })).toHaveCount(0);
  });
});
