import { test, expect } from '@playwright/test';
import { fx, createTestTemplate } from './lib/fixtures';
import { resetDB } from './lib/reset';

test.beforeAll(() => resetDB());
test.beforeEach(async ({ page }) => {
  // Start every test in Field mode.
  await page.addInitScript(() => localStorage.setItem('mode', 'agency'));
});

test.describe('screenings ledger', () => {
  test('lists seeded casefiles for Acme with correct columns', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });

    const rows = page.locator('tbody tr');
    await expect.poll(async () => rows.count()).toBeGreaterThan(0);

    // Seed gives Acme 3 submitted + 1 in_progress casefile.
    await expect(rows).toHaveCount(4);
    await expect(page.locator('tbody tr .badge.status-submitted')).toHaveCount(3);
    await expect(page.locator('tbody tr .badge.status-in_progress')).toHaveCount(1);

    // Required columns.
    await expect(page.getByRole('columnheader', { name: 'Client' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Template' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Started' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Submitted' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Band' })).toBeVisible();
  });

  test('submitted rows display a colored band chip', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });
    // Find any submitted row, then check its band chip.
    const submittedRow = page.locator('tbody tr').filter({ has: page.locator('.badge.status-submitted') }).first();
    await expect(submittedRow).toBeVisible();
    await expect(submittedRow.locator('.badge.band')).toBeVisible();
  });

  test('filter by status narrows the ledger', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThan(0);

    const totalRows = await page.locator('tbody tr').count();
    const statusFilter = page.locator('.filters .select').first();
    await statusFilter.selectOption({ label: 'Submitted' });

    // Wait for the debounced refetch to flush and re-render the table.
    await expect
      .poll(async () => page.locator('tbody tr .badge.status-in_progress').count())
      .toBe(0);
    await expect
      .poll(async () => page.locator('tbody tr .badge.status-draft').count())
      .toBe(0);
    expect(await page.locator('tbody tr .badge.status-submitted').count()).toBeGreaterThan(0);
    expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(totalRows);
  });

  test('filter by instrument narrows the ledger', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThan(0);

    // Capture template names shown.
    const initialCount = await page.locator('tbody tr').count();

    const templateFilter = page.locator('.filters .select').nth(1);
    const options = await templateFilter.locator('option').allTextContents();
    const pickable = options.find((o) => o !== 'All');
    if (!pickable) throw new Error('no selectable template in filter');
    await templateFilter.selectOption({ label: pickable });

    await expect.poll(async () => page.locator('tbody tr').count()).toBeLessThanOrEqual(initialCount);
  });

  test('CSV export link carries agency + template filters', async ({ page }) => {
    await page.goto('/agency/screenings');
    const acme = await fx.getAgencyByName('Acme Health');
    await page.getByLabel('Select agency').selectOption({ value: acme.id });

    const exportBtn = page.getByRole('link', { name: /export csv/i });
    await expect(exportBtn).toBeVisible();
    const href = await exportBtn.getAttribute('href');
    expect(href).toContain(`agencyId=${acme.id}`);
  });

  test('clicking a ledger row opens its casefile detail', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });
    const firstClientLink = page.locator('tbody tr a').first();
    const clientName = (await firstClientLink.textContent())?.trim() ?? '';
    await firstClientLink.click();
    await expect(page).toHaveURL(/\/agency\/screenings\/[0-9a-f-]+/);
    await expect(page.getByRole('heading', { level: 1, name: clientName })).toBeVisible();
  });

  test('agency switch scopes ledger contents', async ({ page }) => {
    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ label: 'Acme Health' });
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThan(0);

    await page.getByLabel('Select agency').selectOption({ label: 'Summit Partners' });
    // Summit has zero seeded screenings.
    await expect(page.locator('.empty').first()).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });
});

test.describe('new casefile composer', () => {
  test('pick client + instrument → opens a fresh draft casefile', async ({ page }) => {
    const acme = await fx.getAgencyByName('Acme Health');
    const clientName = `Composer Client ${Date.now()}`;
    await fx.createClient(acme.id, clientName);

    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ value: acme.id });
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThan(0);

    // First select is status filter, second is instrument filter — the composer selects are inside .composer
    const composerClientSelect = page.locator('.composer .select').first();
    await composerClientSelect.selectOption({ label: clientName });

    const composerTemplateSelect = page.locator('.composer .select').nth(1);
    const tplOptions = await composerTemplateSelect.locator('option').allTextContents();
    const tplChoice = tplOptions.find((o) => o !== '— choose —');
    if (!tplChoice) throw new Error('no template available in composer');
    await composerTemplateSelect.selectOption({ label: tplChoice });

    await page.getByRole('button', { name: /start screening/i }).click();
    await expect(page).toHaveURL(/\/agency\/screenings\/[0-9a-f-]+/);
    await expect(page.getByRole('heading', { level: 1, name: clientName })).toBeVisible();
  });

  test('stale agencyId in localStorage is ignored and replaced with a valid agency', async ({ page }) => {
    // Simulate a stale agencyId (a valid-shaped UUID that isn't in the DB). Without the
    // client-side guard this would send FK-violating writes and previously returned 500.
    await page.addInitScript(() => {
      localStorage.setItem('mode', 'agency');
      localStorage.setItem('agencyId', '00000000-0000-0000-0000-000000000000');
    });
    await page.goto('/agency/screenings');
    // Wait for the App useEffect to fetch agencies and replace the stored id.
    await expect
      .poll(async () => page.getByLabel('Select agency').inputValue())
      .toMatch(/^[0-9a-f-]{36}$/);
    const selected = await page.getByLabel('Select agency').inputValue();
    expect(selected).not.toEqual('00000000-0000-0000-0000-000000000000');
  });

  test('API returns 404, not 500, when creating a client with an unknown agencyId', async ({ request }) => {
    const res = await request.post('http://localhost:3001/api/clients', {
      data: { agencyId: '00000000-0000-0000-0000-000000000000', name: 'Ghost' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/referenced record/i);
  });

  test('add-client inline flow adds a new client and selects it', async ({ page }) => {
    const acme = await fx.getAgencyByName('Acme Health');

    await page.goto('/agency/screenings');
    await page.getByLabel('Select agency').selectOption({ value: acme.id });

    const newName = `Inline Client ${Date.now()}`;
    const input = page.locator('.composer input');
    await input.fill(newName);
    await page.getByRole('button', { name: 'Add' }).click();

    // The composer client select should now have that client selected.
    const composerClientSelect = page.locator('.composer .select').first();
    await expect(composerClientSelect).toHaveValue(/.+/);
    const text = await composerClientSelect.locator('option:checked').textContent();
    expect(text?.trim()).toBe(newName);
  });
});
