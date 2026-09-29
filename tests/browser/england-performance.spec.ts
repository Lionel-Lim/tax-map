import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('England mobile overview and lazy detail stay within measured delivery budgets', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const resources = () => page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.startsWith(location.origin))
    .map(entry => { const r = entry as PerformanceResourceTiming; return { path: new URL(r.name).pathname, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize }; }));
  const started = Date.now();
  await page.goto('/map/');
  await expect(page.getByTestId('primary-difference')).toContainText('£861');
  await expect(page.getByRole('button', { name: 'Show all England councils', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.area-map-label').count()).toBeGreaterThan(0);
  const overviewMilliseconds = Date.now() - started;
  const initial = await resources();
  expect(initial.some(row => /\/postcodes\/|\/areas\/msoa\/|\/boundaries\/msoa\/|\/areas.json$|\/msoa.geojson$/.test(row.path))).toBe(false);
  await page.getByLabel('Postcode', { exact: true }).fill('M1 1AD');
  const lookupStarted = Date.now();
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByTestId('impact-panel')).toContainText('E02006902');
  await expect.poll(async () => (await resources()).some(row => row.path.endsWith('/boundaries/msoa/E08000003.geojson'))).toBe(true);
  const postcodeMilliseconds = Date.now() - lookupStarted;
  const afterLookup = await resources();
  const detail = afterLookup.filter(row => /\/postcodes\/|\/areas\/msoa\/|\/boundaries\/msoa\//.test(row.path));
  const changeStarted = Date.now();
  await page.getByLabel('Compare costs', { exact: true }).selectOption('ongoing-owner');
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('ongoing-owner');
  await expect(page.getByTestId('impact-panel')).toContainText('Ongoing-owner comparison');
  const scenarioMilliseconds = Date.now() - changeStarted;
  const sum = (rows: typeof initial, field: 'encodedBytes' | 'decodedBytes') => rows.reduce((total, row) => total + row[field], 0);
  const report = {
    measuredOn: new Date().toISOString(), dataVersion: 'england-2026-09-26-v1',
    environment: 'Local Vite production preview; Chromium, 390×844 viewport, 4× CPU slowdown, cache disabled, no network throttling. Timings include automation; not real-device or hosted latency.',
    initial: { encodedBytes: sum(initial, 'encodedBytes'), decodedBytes: sum(initial, 'decodedBytes'), resources: initial },
    detail: { encodedBytes: sum(detail, 'encodedBytes'), decodedBytes: sum(detail, 'decodedBytes'), resources: detail },
    timings: { overviewMilliseconds, postcodeMilliseconds, scenarioMilliseconds },
    budgets: { initialDecodedBytes: 6_000_000, detailDecodedBytes: 1_300_000, overviewMilliseconds: 20_000, postcodeMilliseconds: 8_000, scenarioMilliseconds: 3_000 },
  };
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/england-performance.json', JSON.stringify(report, null, 2) + '\n');
  expect(report.initial.decodedBytes).toBeLessThan(report.budgets.initialDecodedBytes);
  expect(report.detail.decodedBytes).toBeLessThan(report.budgets.detailDecodedBytes);
  expect(overviewMilliseconds).toBeLessThan(report.budgets.overviewMilliseconds);
  expect(postcodeMilliseconds).toBeLessThan(report.budgets.postcodeMilliseconds);
  expect(scenarioMilliseconds).toBeLessThan(report.budgets.scenarioMilliseconds);
  expect(detail.filter(row => row.path.includes('/areas/msoa/'))).toHaveLength(1);
  expect(detail.filter(row => row.path.includes('/boundaries/msoa/'))).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
