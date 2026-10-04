import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('sample mobile payload and interaction budget', { tag: '@performance' }, async ({ page }) => {
  test.setTimeout(60_000);
  const budgets = { initialDecodedBytes: 4_500_000, postcodeDecodedBytes: 1_300_000, overviewMilliseconds: 20_000, postcodeMilliseconds: 8_000, scenarioMilliseconds: 3_000 };
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  const started = Date.now();
  await test.step('Load the sample overview within its performance budget', async () => {
    const overviewExpect = expect.configure({ timeout: budgets.overviewMilliseconds });
    await page.goto('/map/?data=sample-2026-09-26-v1');
    await overviewExpect(page.getByTestId('primary-difference')).toContainText('£741');
    await overviewExpect(page.locator('.area-map-label')).toHaveCount(5);
    await overviewExpect(page.getByRole('button', { name: 'Show all sample councils', exact: true })).toBeVisible();
  }, { timeout: budgets.overviewMilliseconds });
  const overviewMilliseconds = Date.now() - started;
  expect(requests.some(path => path.includes('/postcodes/'))).toBe(false);
  const initial = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.startsWith(location.origin))
    .map(entry => { const r = entry as PerformanceResourceTiming; return { path: new URL(r.name).pathname, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize }; }));
  await page.getByLabel('Postcode', { exact: true }).fill('LE4 0DD');
  const lookupStarted = Date.now();
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByTestId('postcode-status')).toContainText('Bradgate');
  const postcodeMilliseconds = Date.now() - lookupStarted;
  await page.locator('.scenario-settings > summary').click();
  const changeStarted = Date.now();
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
  const scenarioMilliseconds = Date.now() - changeStarted;
  const lookup = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/postcodes/'))
    .map(entry => { const r = entry as PerformanceResourceTiming; return { path: new URL(r.name).pathname, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize }; }));
  const sum = (rows: typeof initial, field: 'encodedBytes' | 'decodedBytes') => rows.reduce((total, row) => total + row[field], 0);
  const report = {
    measuredOn: new Date().toISOString(), environment: 'Local Vite production preview; Chromium, 390×844 viewport, 4× CPU slowdown, cache disabled, no network throttling. Timings include automation; not real-device or hosted latency.',
    initial: { encodedBytes: sum(initial, 'encodedBytes'), decodedBytes: sum(initial, 'decodedBytes'), resources: initial },
    postcode: { encodedBytes: sum(lookup, 'encodedBytes'), decodedBytes: sum(lookup, 'decodedBytes'), resources: lookup },
    timings: { overviewMilliseconds, postcodeMilliseconds, scenarioMilliseconds },
    budgets,
  };
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/phase3-performance.json', JSON.stringify(report, null, 2) + '\n');
  expect(report.initial.decodedBytes).toBeLessThan(report.budgets.initialDecodedBytes);
  expect(report.postcode.decodedBytes).toBeLessThan(report.budgets.postcodeDecodedBytes);
  expect(overviewMilliseconds).toBeLessThan(report.budgets.overviewMilliseconds);
  expect(postcodeMilliseconds).toBeLessThan(report.budgets.postcodeMilliseconds);
  expect(scenarioMilliseconds).toBeLessThan(report.budgets.scenarioMilliseconds);
  expect(lookup.map(row => row.path)).toEqual([
    '/data/public-v1/sample-2026-09-26-v1/postcodes/index.json', '/data/public-v1/sample-2026-09-26-v1/postcodes/LE4.json',
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
