import { test, expect } from '@playwright/test';

const DATA = 'england-2026-09-26-v1';
const SAMPLE = 'sample-2026-09-26-v1';

async function lookup(page: import('@playwright/test').Page, postcode: string) {
  await page.getByLabel('Postcode', { exact: true }).fill(postcode);
  await page.getByRole('button', { name: 'Find postcode', exact: true }).click();
  await expect(page.getByTestId('postcode-status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find postcode', exact: true })).toBeEnabled();
}

test('England landing loads councils and global search without national neighbourhood data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/map/');
  await expect(page.getByTestId('primary-difference')).toContainText('£861');
  await expect(page.locator('.coverage-stamp')).toContainText('296');
  await expect(page.locator('.coverage-stamp')).toContainText('6,856');
  await expect(page.getByRole('button', { name: 'Show all England councils', exact: true })).toBeVisible();
  expect(requests).toContain(`/data/public-v1/${DATA}/councils.json`);
  expect(requests.some(path => path.endsWith('/areas.json') || path.endsWith('/msoa.geojson') || path.includes('/areas/msoa/') || path.includes('/postcodes/'))).toBe(false);
  expect(await page.locator('.area-map-label').count()).toBeLessThan(40);
});

test('Manchester council and neighbourhoods use separate inputs and lazy shards', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/map/');
  await page.getByLabel('Area name or code').fill('Manchester');
  await page.locator('button[data-area-code="E08000003"]').click();
  await expect(page.getByTestId('impact-panel').getByRole('heading', { name: 'Manchester', exact: true })).toBeVisible();
  await expect(page.getByTestId('primary-difference')).toBeVisible();
  await page.getByLabel('Area name or code').fill('');
  await page.getByLabel('Map geography').selectOption('MSOA');
  await expect.poll(() => requests.includes(`/data/public-v1/${DATA}/areas/msoa/E08000003.json`)).toBe(true);
  await expect.poll(() => requests.includes(`/data/public-v1/${DATA}/boundaries/msoa/E08000003.geojson`)).toBe(true);
  await expect(page.getByTestId('impact-panel').getByRole('heading', { name: 'Manchester', exact: true })).toBeVisible();
  await lookup(page, 'M1 1AD');
  await expect(page.getByTestId('impact-panel')).toContainText('E02006902');
  await expect(page.getByTestId('postcode-status')).not.toContainText('outside');
  expect(requests.filter(path => path === `/data/public-v1/${DATA}/areas/msoa/E08000003.json`)).toHaveLength(1);
});

for (const [postcode, code] of [['B1 1AY', 'E02006899'], ['BS1 1AD', 'E02006887'], ['NE1 1AD', 'E02007099'], ['OX1 1AA', 'E02005947'], ['YO1 0EB', 'E02002784']]) {
  test(`new England postcode ${postcode} selects its source neighbourhood`, async ({ page }) => {
    await page.goto('/map/');
    await lookup(page, postcode!);
    await expect(page.getByTestId('impact-panel')).toContainText(code!);
    await expect(page.getByTestId('postcode-status')).not.toContainText('outside');
    await expect(page.getByLabel('Map geography')).toHaveValue('MSOA');
  });
}

test('all-England neighbourhood name/code search loads an uncached council', async ({ page }) => {
  await page.goto('/map/');
  await page.getByLabel('Map geography').selectOption('MSOA');
  await page.getByLabel('Area name or code').fill('E02003728');
  const button = page.locator('button[data-area-code="E02003728"]');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId('impact-panel')).toContainText('E02003728');
  await page.getByRole('button', { name: 'Create share link', exact: true }).click();
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  expect(new URL(link).searchParams.get('data')).toBe(DATA);
  await page.goto(link);
  await expect(page.getByTestId('impact-panel')).toContainText('E02003728');
});

test('a documented invalid boundary remains searchable and visibly unavailable', async ({ page }) => {
  await page.goto(`/map/?data=${DATA}&area=E02001686&geography=MSOA`);
  const panel = page.getByTestId('impact-panel');
  await expect(panel).toContainText('E02001686');
  await expect(panel.getByRole('heading', { name: 'Area estimate unavailable' })).toBeVisible();
  await expect(panel).toContainText('boundary');
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
});

test('current-vintage Barnsley stock is unavailable rather than relabelled from the old council', async ({ page }) => {
  await page.goto(`/map/?data=${DATA}&area=E08000038&geography=LAD`);
  await expect(page.getByTestId('impact-panel')).toContainText('Barnsley');
  await expect(page.getByTestId('impact-panel').getByRole('heading', { name: 'Area estimate unavailable' })).toBeVisible();
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
});

test('old sample links stay pinned and can deliberately open the England release', async ({ page }) => {
  await page.goto(`/map/?data=${SAMPLE}&area=E09000032`);
  await expect(page.locator('.coverage-stamp')).toContainText('198');
  await expect(page.locator('.archive-notice')).toBeVisible();
  await page.getByRole('link', { name: 'Explore the new England-wide data →' }).click();
  await expect(page.locator('.coverage-stamp')).toContainText('6,856');
  await page.goBack();
  await expect(page.locator('.coverage-stamp')).toContainText('198');
  await expect(page.getByTestId('impact-panel')).toContainText('Wandsworth');
});

test('a failed neighbourhood-statistics shard can be retried without using another area', async ({ page }) => {
  await page.route(`**/data/public-v1/${DATA}/areas/msoa/E08000003.json`, route => route.abort());
  await page.goto('/map/');
  await lookup(page, 'M1 1AD');
  await expect(page.getByTestId('postcode-status')).toContainText('Could not load');
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await page.unroute(`**/data/public-v1/${DATA}/areas/msoa/E08000003.json`);
  await lookup(page, 'M1 1AD');
  await expect(page.getByTestId('impact-panel')).toContainText('E02006902');
});

test('a failed shared neighbourhood can recover through a new area selection', async ({ page }) => {
  await page.route(`**/data/public-v1/${DATA}/areas/msoa/E08000003.json`, route => route.abort());
  await page.goto(`/map/?data=${DATA}&area=E02006902&geography=LAD`);
  await expect(page.getByRole('heading', { name: 'Data could not be loaded' })).toBeVisible();
  await page.getByLabel('Area name or code').fill('Leicester');
  await page.locator('button[data-area-code="E06000016"]').click();
  await expect(page.getByTestId('primary-difference')).toContainText('£861');
  await expect(page.getByRole('heading', { name: 'Data could not be loaded' })).toHaveCount(0);
});
