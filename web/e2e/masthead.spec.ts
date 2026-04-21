import { test, expect } from '@playwright/test';

test.describe('masthead & mode toggle', () => {
  test('renders wordmark, tagline, volume', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Arbiter', { exact: true })).toBeVisible();
    await expect(page.getByText('Screening & Assessment System')).toBeVisible();
    await expect(page.getByText(/Vol\. III · № 04/)).toBeVisible();
  });

  test('Editorial / Field toggle switches routes and nav links', async ({ page }) => {
    await page.goto('/');
    // Default lands in Field (agency mode).
    await page.getByRole('tab', { name: 'Editorial' }).click();
    await expect(page).toHaveURL(/\/admin\/templates/);
    await expect(page.getByRole('link', { name: 'Instruments' })).toBeVisible();

    await page.getByRole('tab', { name: 'Field' }).click();
    await expect(page).toHaveURL(/\/agency\/screenings/);
    await expect(page.getByRole('link', { name: 'Casefiles' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Compendium' })).toBeVisible();
  });

  test('mode persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Editorial' }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Editorial' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/admin\/templates/);
  });

  test('agency dropdown only visible in Field mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Editorial' }).click();
    await expect(page.getByLabel('Select agency')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Field' }).click();
    await expect(page.getByLabel('Select agency')).toBeVisible();
  });

  test('agency dropdown lists seeded agencies', async ({ page }) => {
    await page.goto('/agency/screenings');
    const options = page.getByLabel('Select agency').locator('option');
    await expect(options).toContainText(['Acme Health', 'Northwind Services', 'Summit Partners']);
  });
});
