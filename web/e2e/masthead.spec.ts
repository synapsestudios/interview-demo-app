import { test, expect } from '@playwright/test';

test.describe('masthead & mode toggle', () => {
  test('renders wordmark and tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Arbiter', { exact: true })).toBeVisible();
    await expect(page.locator('.masthead .tagline')).toHaveText('Case management');
  });

  test('Admin / Clinical toggle switches routes and nav links', async ({ page }) => {
    await page.goto('/');
    // Default lands in Clinical (agency mode).
    await page.getByRole('tab', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin\/templates/);
    await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();

    await page.getByRole('tab', { name: 'Clinical' }).click();
    await expect(page).toHaveURL(/\/agency\/screenings/);
    await expect(page.getByRole('link', { name: 'Screenings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  });

  test('mode persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Admin' }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Admin' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/admin\/templates/);
  });

  test('agency dropdown only visible in Clinical mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Admin' }).click();
    await expect(page.getByLabel('Select agency')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Clinical' }).click();
    await expect(page.getByLabel('Select agency')).toBeVisible();
  });

  test('agency dropdown lists seeded agencies', async ({ page }) => {
    await page.goto('/agency/screenings');
    const options = page.getByLabel('Select agency').locator('option');
    await expect(options).toContainText(['Acme Security Partners', 'Northwind AppSec', 'Summit Audit Group']);
  });
});
