import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke tests for the PRD §12 checklist flows, driven through the real UI.
 * Re-runnable: ingestion is idempotent, so a second upload of the sample reports rows as skipped.
 */

test.describe.configure({ mode: 'serial' });

test('dashboard shows live metrics, not placeholder zeros', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Material master analytics' })).toBeVisible();
  const records = page.locator('text=Records ingested').locator('..').locator('..');
  await expect(records).toContainText(/\d{3}/, { timeout: 15_000 });
  await expect(page.getByText('Harmonisation by category')).toBeVisible();
});

test('upload a CSV through the UI and run the full pipeline', async ({ page }) => {
  await page.goto('/ingest');
  await page.locator('#org').selectOption({ label: 'IOCL — Indian Oil Corporation Ltd' });
  await page.getByTestId('file-input').setInputFiles(path.join(__dirname, '..', 'public', 'samples', 'IOCL_material_extract.csv'));
  await expect(page.getByText('Map columns to the target schema')).toBeVisible();
  await page.getByRole('button', { name: /Check data quality/ }).click();
  await expect(page.getByText('Data-quality preview')).toBeVisible();
  await page.getByRole('button', { name: 'Run ingestion pipeline' }).click();
  await expect(page.getByRole('link', { name: /View batch records/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: /View batch records/ }).click();
  await expect(page.getByText('P0800', { exact: false }).first()).toBeVisible();
});

test('approve and reject recommendations; both reach the audit trail', async ({ page }) => {
  await page.goto('/review?tab=FULL_REVIEW');
  const nearDup = page.locator('aside li [role=button]', { hasText: 'Near-duplicate' }).first();
  await nearDup.click();
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByText(/Canonical material created|Legacy codes mapped/)).toBeVisible({ timeout: 15_000 });

  const functional = page.locator('aside li [role=button]', { hasText: 'Functional equiv.' }).first();
  await functional.click();
  await page.getByRole('button', { name: /^Reject/ }).click();
  await page.getByRole('dialog').locator('textarea').fill('E2E: attributes differ materially for this duty');
  await page.getByRole('button', { name: 'Reject & log reason' }).click();
  await expect(page.getByText('Recommendation rejected')).toBeVisible();

  await page.goto('/audit');
  await expect(page.getByText('RECOMMENDATION_REJECTED').first()).toBeVisible();
  await expect(page.getByText('RECOMMENDATION_APPROVED').first()).toBeVisible();
  await page.getByRole('button', { name: 'Verify hash chain' }).click();
  await expect(page.getByText(/Chain intact/)).toBeVisible();
});

test('vetoed pairs cannot be approved', async ({ page }) => {
  await page.goto('/review?tab=VETOED');
  await page.locator('aside li [role=button]').first().click();
  await expect(page.getByText('Hard exclusion rule — equivalence blocked')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
});

test('mock SAP export returns a well-formed MATMAS payload for an approved code', async ({ request }) => {
  const canon = await (await request.get('/api/canonical')).json();
  const cnmc = canon.canonical[0].cnmc as string;
  const res = await request.get(`/api/v1/materials/${encodeURIComponent(cnmc)}?format=idoc&org=CPCL`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.IDOC.EDI_DC40.IDOCTYP).toBe('MATMAS05');
  expect(body.IDOC.E1MARAM.ZZCNMC).toBe(cnmc);
  expect(body.IDOC.E1MARAM.MATNR.length).toBeLessThanOrEqual(18);
});
