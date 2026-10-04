import { expect, test, type Page } from '@playwright/test';

async function enterPersonalFigures(page: Page) {
  await page.getByRole('button', { name: 'Use your own figures', exact: true }).click();
  await page.getByLabel('Property value (£)', { exact: true }).fill('£300,000');
  await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1,800');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toContainText('£360');
}

for (const width of [320, 390]) {
  test(`mobile prioritises postcode search then the map at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByLabel('Postcode', { exact: true })).toBeInViewport();
    await expect(page.getByTestId('tax-map')).toBeInViewport();
    await expect(page.locator('.scenario-settings')).not.toHaveAttribute('open');
    await expect(page.locator('.example-notice')).toContainText('Example: Leicester');
    const layout = await page.evaluate(() => ({
      search: document.querySelector('.postcode-search')!.getBoundingClientRect().toJSON(),
      map: document.querySelector('.map-column')!.getBoundingClientRect().toJSON(),
      secondary: ['.scenario-settings', '.result-column', '.name-search', '.scope-strip'].map(selector =>
        document.querySelector(selector)!.getBoundingClientRect().top),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(layout.map.top).toBeGreaterThanOrEqual(layout.search.bottom);
    expect(layout.map.top - layout.search.bottom).toBeLessThanOrEqual(24);
    for (const top of layout.secondary) expect(top).toBeGreaterThan(layout.map.bottom);
    expect(layout.overflow).toBe(false);
    await page.getByLabel('Postcode', { exact: true }).fill('LE4 0SZ');
    await page.getByRole('button', { name: 'Find area', exact: true }).click();
    await expect(page.locator('#explore-map')).toBeFocused();
    await expect(page.getByTestId('tax-map')).toBeInViewport();
    await expect(page.getByTestId('map-selection-summary')).toContainText('Beaumont Park');
    await page.getByRole('link', { name: 'View selected result ↓', exact: true }).click();
    await expect(page.locator('#impact-heading')).toBeInViewport();
    await page.getByLabel('Area name or code').fill('Manchester');
    await page.locator('button[data-area-code="E08000003"]').click();
    await expect(page.getByRole('heading', { name: 'Manchester', exact: true })).toBeVisible();
    await expect(page.locator('.example-notice')).toHaveCount(0);
    await expect(page.locator('#explore-map')).toBeFocused();
    await expect(page.getByTestId('tax-map')).toBeInViewport();
    await page.locator('.scenario-settings > summary').click();
    await expect(page.getByLabel('Compare costs', { exact: true })).toBeVisible();
  });
}

for (const returnVia of ['navigation', 'back']) {
  test(`reading supporting pages preserves personal figures via ${returnVia}`, async ({ page }) => {
    await page.goto('/map/?area=E08000003');
    await enterPersonalFigures(page);
    await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
    await page.getByLabel('Years of ownership', { exact: true }).fill('10');
    await page.getByLabel('Annual property tax (%)', { exact: true }).fill('0.6');
    await page.getByLabel('Annual property tax (%)', { exact: true }).press('Tab');
    await expect(page.getByTestId('primary-difference')).toContainText('£500');
    await page.getByRole('link', { name: 'How it works', exact: true }).click();
    await expect(page.getByRole('link', { name: '← Return to your comparison', exact: true })).toBeVisible();
    if (returnVia === 'back') await page.goBack();
    else {
      await page.getByRole('link', { name: 'Data & coverage', exact: true }).click();
      await page.getByRole('link', { name: '← Return to your comparison', exact: true }).click();
    }
    await expect(page.getByTestId('impact-panel')).toContainText('Manchester');
    await expect(page.getByTestId('impact-panel')).toContainText('Personal comparison · your figures');
    await expect(page.getByTestId('primary-difference')).toContainText('£500');
    await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('0.6');
    await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveValue('10');
    await page.getByRole('button', { name: 'Edit your figures', exact: true }).click();
    await expect(page.getByLabel('Property value (£)', { exact: true })).toHaveValue('300,000');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Create link', exact: true }).click();
    const shared = await page.getByLabel('Share link', { exact: true }).inputValue();
    expect(shared).not.toMatch(/300000|1800|postcode=/);
    await page.goto(shared);
    await expect(page.getByTestId('impact-panel')).toContainText('Council estimate · area figures');
    await expect(page.getByRole('button', { name: 'Edit your figures', exact: true })).toHaveCount(0);
  });
}

test('unavailable neighbourhood offers a separate council estimate and actionable personal inputs', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Postcode', { exact: true }).fill('LE4 0SZ');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  const panel = page.getByTestId('impact-panel');
  await expect(panel).toContainText('your annual Council Tax bill');
  await expect(panel).not.toContainText('unverified meaning');
  await panel.getByRole('button', { name: 'View Leicester council estimate', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Leicester', exact: true })).toBeVisible();
  await expect(panel).toContainText('Council estimate · area figures');
  await expect(page.getByTestId('primary-difference')).toContainText('£741');
});

test('invalid boundaries do not offer personal figures as a repair', async ({ page }) => {
  await page.goto('/map/?area=E02001686&geography=MSOA');
  await expect(page.getByTestId('impact-panel')).toContainText('Personal figures cannot resolve');
  await expect(page.getByRole('button', { name: 'Use your own figures', exact: true })).toHaveCount(0);
});

test('map share metadata is present in the static response with a usable image', async ({ request }) => {
  const html = await (await request.get('/map/')).text();
  expect(html).toContain('name="description"');
  expect(html).toContain('property="og:image" content="https://taxmap.limsight.com/social-preview.png"');
  const image = await request.get('/social-preview.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
});
