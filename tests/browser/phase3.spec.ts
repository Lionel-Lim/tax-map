import { expect, test, type Page } from '@playwright/test';

const DATA = 'sample-2026-09-26-v1';
const POLICY = 'illustrative-ppt:1.0.0';
const RULE = 'sdlt-england-2025-04-01-v1';
const BRADGATE = 'E02002830';
const BEAUMONT = 'E02002827';

// Postcode fixtures were read from the pinned ONSPD shards, not inferred from syntax.
// Expected money is independently recorded in phase0-worked-examples.json; the
// purchase totals also include the reviewed £2,420 SDLT on Bradgate's £246,000 value.
function sharedPath(overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    data: DATA, policy: POLICY, rule: RULE, area: BRADGATE,
    mode: 'ongoing-owner', buyer: 'standard', years: '20',
    geography: 'MSOA', display: 'annual', ...overrides,
  });
  return `/map/?${params}`;
}

async function findPostcode(page: Page, postcode: string): Promise<void> {
  await page.getByLabel('Postcode', { exact: true }).fill(postcode);
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByTestId('postcode-status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find area', exact: true })).toBeEnabled();
}

function areaButton(page: Page, code: string) {
  return page.locator(`button[data-area-code="${code}"]`);
}

async function openPersonalInputs(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Use your own figures', exact: true }).click();
}

test('landing view excludes Stamp Duty and loads no postcode files', async ({ page }) => {
  const postcodeRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/postcodes/')) postcodeRequests.push(request.url());
  });
  await page.goto(`/map/?data=${DATA}`);
  const panel = page.getByTestId('impact-panel');
  await expect(panel.getByRole('heading', { name: 'Leicester', exact: true })).toBeVisible();
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('ongoing-owner');
  await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('0.48');
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Buyer type', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Map areas', { exact: true })).toHaveValue('LAD');
  await expect(panel).toContainText('Yearly costs without a purchase');
  await expect(panel.locator('.current-components')).not.toContainText('Stamp Duty');
  await expect(page.getByTestId('primary-difference')).toContainText('£741');
  await expect(panel).toContainText('owner-occupied main home only');
  expect(postcodeRequests).toEqual([]);
});

test('the real map renders council labels and selects an independent council estimate', async ({ page }) => {
  const mapErrors: string[] = [];
  page.on('pageerror', error => mapErrors.push(error.message));
  page.on('console', message => {
    if (message.text().includes('Map display error:')) mapErrors.push(message.text());
  });
  await page.goto(`/map/?data=${DATA}`);
  await expect(page.getByRole('button', { name: 'Show all sample councils' })).toBeVisible();
  await expect(page.locator('canvas[aria-label^="Interactive sample property tax map"]')).toBeVisible();
  await expect(page.locator('.area-map-label')).toHaveCount(5);
  await expect(page.getByText('Explore using search or the area list', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all sample councils' }).click();
  const wandsworth = page.getByRole('button', { name: /^Wandsworth: .* Select council area\.$/ });
  await expect(wandsworth).toBeInViewport();
  await wandsworth.click();
  const panel = page.getByTestId('impact-panel');
  await expect(panel.getByRole('heading', { name: 'Wandsworth', exact: true })).toBeVisible();
  await expect(panel).toContainText('E09000032');
  await expect(page.getByLabel('Map areas', { exact: true })).toHaveValue('LAD');
  expect(mapErrors).toEqual([]);
});

test('postcode to ongoing-owner estimate works from the keyboard and exposes source assumptions', async ({ page }) => {
  const shards: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/postcodes\/(?!index\.json)[^/]+\.json$/.test(path)) shards.push(path);
  });
  await page.goto(sharedPath({ area: 'E06000016', geography: 'LAD' }));
  const postcode = page.getByLabel('Postcode', { exact: true });
  await postcode.fill(' le4 0dd ');
  await postcode.press('Enter');
  const panel = page.getByTestId('impact-panel');
  await expect(panel.getByRole('heading', { name: 'Bradgate Heights & Beaumont Leys' })).toBeVisible();
  await expect(panel).toContainText(BRADGATE);
  await expect(page.getByLabel('Map areas', { exact: true })).toHaveValue('MSOA');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await expect(panel).toContainText('Estimated decrease');
  await expect(panel).toContainText('£246,000');
  await panel.getByRole('button', { name: 'How this is calculated', exact: true }).click();
  await expect(panel).toContainText('£1,180.80');
  await expect(panel).toContainText('-£813.98');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Data behind this estimate', exact: true }).click();
  await expect(panel).toContainText('Year ending September 2025');
  await expect(panel).toContainText('31 March 2025');
  await expect(panel).toContainText('2026–27');
  await expect(panel).toContainText('Council-average charges');
  expect(shards).toEqual([`/data/public-v1/${DATA}/postcodes/LE4.json`]);
});

for (const entry of [
  { postcode: 'not a postcode', message: /Enter a full postcode/ },
  { postcode: 'SW1A 9ZZ', message: /not in the May 2025 directory/ },
  { postcode: 'LE4 0AP', message: /terminated in 1995-01/ },
  { postcode: 'CF10 1AA', message: /Wales.*England only/ },
  { postcode: 'SW1A 0AA', message: /known English postcode outside the five-authority sample/ },
]) {
  test(`postcode lookup explains ${entry.postcode}`, async ({ page }) => {
    await page.goto(`/map/?data=${DATA}`);
    await expect(page.getByTestId('impact-panel')).toBeVisible();
    await findPostcode(page, entry.postcode);
    await expect(page.getByText(entry.message)).toBeVisible();
  });
}

test('unavailable postcode keeps its area unavailable through partial overrides and reset', async ({ page }) => {
  await page.goto(sharedPath());
  await findPostcode(page, 'LE4 0SZ');
  const panel = page.getByTestId('impact-panel');
  await expect(panel.getByRole('heading', { name: 'Beaumont Park', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Area estimate unavailable' })).toBeVisible();
  await page.getByLabel('Area name or code').fill(BEAUMONT);
  await expect(areaButton(page, BEAUMONT)).toHaveAttribute('data-kind', 'unavailable');
  await openPersonalInputs(page);
  await page.getByLabel('Property value (£)', { exact: true }).fill('300000');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await openPersonalInputs(page);
  await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1800');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(panel).toContainText('Using your entered values');
  await expect(page.getByTestId('primary-difference')).toContainText('£360');
  await expect(panel).toContainText('area estimate is still unavailable');
  await expect(areaButton(page, BEAUMONT)).toHaveAttribute('data-kind', 'unavailable');
  await openPersonalInputs(page);
  await page.getByRole('button', { name: 'Use area figures', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Area estimate unavailable' })).toBeVisible();
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await expect(areaButton(page, BEAUMONT)).toHaveAttribute('data-kind', 'unavailable');
});

test('personal inputs can reverse the selected-home outcome without recolouring the area', async ({ page }) => {
  await page.goto(sharedPath());
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByLabel('Area name or code').fill(BRADGATE);
  await expect(areaButton(page, BRADGATE)).toHaveAttribute('data-kind', 'lower');
  await openPersonalInputs(page);
  await page.getByLabel('Property value (£)', { exact: true }).fill('1000000');
  await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1800');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toContainText('£3,000');
  await expect(page.getByTestId('impact-panel')).toContainText('Estimated increase');
  await expect(areaButton(page, BRADGATE)).toHaveAttribute('data-kind', 'lower');
  await openPersonalInputs(page);
  await page.getByRole('button', { name: 'Use area figures', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
});

test('purchase and buyer controls use the shared engine and purchase year has no monthly option', async ({ page }) => {
  await page.goto(sharedPath({ mode: 'annualised-ownership' }));
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
  await page.getByLabel('Buyer type', { exact: true }).selectOption('first-time-buyer');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByLabel('Buyer type', { exact: true }).selectOption('standard');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('purchase-year');
  await expect(page.getByTestId('primary-difference')).toContainText('£3,234');
  await expect(page.getByTestId('primary-difference')).toContainText('in the purchase year');
  await expect(page.getByTestId('impact-panel')).not.toContainText('/ month equivalent');
  await expect(page.getByLabel('Show change as', { exact: true }).locator('option[value="monthly"]')).toHaveCount(0);
});

test('custom property tax rates update area colours, personal results and calculation details', async ({ page }) => {
  await page.goto(sharedPath());
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByLabel('Area name or code').fill(BRADGATE);
  const rate = page.getByLabel('Annual property tax (%)', { exact: true });
  await rate.fill('1');
  await rate.press('Tab');
  await expect(areaButton(page, BRADGATE)).toHaveAttribute('data-kind', 'higher');
  await expect(page.getByTestId('primary-difference')).toContainText('£465');
  await expect(page.getByTestId('impact-panel')).toContainText('Illustrative 1% tax');
  await openPersonalInputs(page);
  await page.getByLabel('Property value (£)', { exact: true }).fill('300000');
  await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1800');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toContainText('£1,200');
  await page.getByRole('button', { name: 'How this is calculated', exact: true }).click();
  const calculation = page.getByRole('dialog', { name: 'How this is calculated', exact: true });
  await expect(calculation).toContainText('£300,000.00 × 1% = £3,000.00');
  await expect(calculation).not.toContainText('0.48%');
});

test('optional Stamp Duty uses custom years and shared links restore the selected rate and period', async ({ page }) => {
  await page.goto(sharedPath());
  await page.getByLabel('Annual property tax (%)', { exact: true }).fill('0.6');
  await page.getByLabel('Annual property tax (%)', { exact: true }).press('Tab');
  await expect(page.getByTestId('primary-difference')).toContainText('£519');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveValue('20');
  await page.getByLabel('Years of ownership', { exact: true }).fill('10');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await expect(page.getByTestId('primary-difference')).toContainText('£761');
  await expect(page.getByTestId('impact-panel').locator('.current-components')).toContainText('Stamp Duty ÷ 10 years');
  await expect(page.getByTestId('impact-panel').locator('.current-components')).toContainText('£242');
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const shared = new URL(await page.getByLabel('Share link', { exact: true }).inputValue());
  expect(shared.searchParams.get('rate')).toBe('0.6');
  expect(shared.searchParams.get('years')).toBe('10');
  await page.goto(shared.toString());
  await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('0.6');
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveValue('10');
  await expect(page.getByTestId('primary-difference')).toContainText('£761');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('ongoing-owner');
  await expect(page.getByTestId('primary-difference')).toContainText('£519');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveValue('10');
});

test('cleared and invalid rates withhold results and cannot be shared; zero remains valid', async ({ page }) => {
  await page.goto(sharedPath());
  const rate = page.getByLabel('Annual property tax (%)', { exact: true });
  for (const value of ['', '-1', '101', '0.12345']) {
    await rate.fill(value);
    await rate.press('Tab');
    await expect(rate).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toContainText('Property tax rate must be between 0% and 100%');
    await expect(page.getByTestId('primary-difference')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create link', exact: true }).click();
    await expect(page.getByLabel('Share link', { exact: true })).not.toBeVisible();
    await expect(page.getByLabel('Share link', { exact: true })).toHaveValue('');
  }
  await rate.fill('0');
  await rate.press('Tab');
  await expect(page.getByTestId('impact-panel')).toContainText('Illustrative 0% tax');
  await expect(page.getByTestId('primary-difference')).toContainText('£1,995');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('browser history restores custom rates and years', async ({ page }) => {
  await page.goto(sharedPath({ mode: 'annualised-ownership', rate: '0.6', years: '10' }));
  await expect(page.getByTestId('primary-difference')).toContainText('£761');
  await page.getByLabel('Annual property tax (%)', { exact: true }).fill('1');
  await page.getByLabel('Annual property tax (%)', { exact: true }).press('Tab');
  await page.getByLabel('Years of ownership', { exact: true }).fill('5');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await page.goBack();
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('1');
  await page.goBack();
  await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('0.6');
  await expect(page.getByTestId('primary-difference')).toContainText('£761');
  await page.goForward();
  await expect(page.getByLabel('Annual property tax (%)', { exact: true })).toHaveValue('1');
});

test('disabling Stamp Duty ignores a now-hidden first-time-buyer eligibility limit', async ({ page }) => {
  await page.goto(sharedPath({ area: 'E02000923', mode: 'annualised-ownership', buyer: 'first-time-buyer' }));
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await page.getByLabel('Compare costs', { exact: true }).selectOption('ongoing-owner');
  await expect(page.getByTestId('primary-difference')).toBeVisible();
  await expect(page.getByLabel('Buyer type', { exact: true })).toHaveCount(0);
});

test('invalid ownership periods withhold the result and recover after correction', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(sharedPath({ mode: 'annualised-ownership' }));
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
  for (const value of ['', '0', '1.5']) {
    await page.getByLabel('Years of ownership', { exact: true }).fill(value);
    await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
    await expect(page.getByTestId('primary-difference')).toHaveCount(0);
    await expect(page.getByTestId('impact-panel').getByRole('heading', { name: 'Check your inputs' })).toBeVisible();
  }
  await page.getByLabel('Years of ownership', { exact: true }).fill('20');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
  expect(errors).toEqual([]);
});

test('switching to ongoing owner clears an invalid ownership period instead of hiding an input trap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(sharedPath({ mode: 'annualised-ownership' }));
  await page.getByLabel('Years of ownership', { exact: true }).fill('0');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await expect(page.getByRole('alert')).toContainText('Ownership years must be a positive whole number');
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await page.getByLabel('Compare costs', { exact: true }).selectOption('ongoing-owner');
  await expect(page.getByLabel('Years of ownership', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.getByLabel('Share link', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser back restores valid settings and removes a stale ownership validation alert', async ({ page }) => {
  await page.goto(sharedPath());
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await page.getByLabel('Years of ownership', { exact: true }).fill('0');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await expect(page.getByRole('alert')).toContainText('Ownership years must be a positive whole number');
  await page.goBack();
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('ongoing-owner');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('ineligible first-time-buyer prices show official guidance rather than standard-rate results', async ({ page }) => {
  await page.goto(sharedPath({ area: 'E02000923', mode: 'annualised-ownership', buyer: 'first-time-buyer' }));
  const panel = page.getByTestId('impact-panel');
  await expect(panel.getByRole('heading', { name: 'Battersea Park', exact: true })).toBeVisible();
  await expect(panel).toContainText('First-time-buyer relief is unavailable above £500,000');
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Read official SDLT guidance' }).first()).toHaveAttribute('href', /^https:\/\/www\.gov\.uk\//);
  await expect(page.getByLabel('Buyer type', { exact: true })).toHaveValue('first-time-buyer');
  await page.getByLabel('Buyer type', { exact: true }).selectOption('standard');
  await expect(page.getByTestId('primary-difference')).toBeVisible();
});

test('explicit share links preserve area settings and exclude personal amounts and postcode by default', async ({ page }) => {
  await page.goto(sharedPath({ display: 'monthly' }));
  await findPostcode(page, 'LE4 0DD');
  await expect(page.getByTestId('primary-difference')).toContainText('£68');
  await openPersonalInputs(page);
  await page.getByLabel('Property value (£)', { exact: true }).fill('300000');
  await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1800');
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
  await expect(page.getByTestId('primary-difference')).toContainText('£30');
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const shared = new URL(await page.getByLabel('Share link', { exact: true }).inputValue());
  expect(shared.searchParams.get('data')).toBe(DATA);
  expect(shared.searchParams.get('policy')).toBe(POLICY);
  expect(shared.searchParams.get('rule')).toBe(RULE);
  expect(shared.searchParams.get('area')).toBe(BRADGATE);
  expect(shared.searchParams.get('display')).toBe('monthly');
  expect(shared.searchParams.has('postcode')).toBe(false);
  expect([...shared.searchParams.keys()].sort()).toEqual(
    ['data', 'policy', 'rule', 'area', 'mode', 'buyer', 'years', 'rate', 'geography', 'display', 'type'].sort(),
  );
  expect(shared.toString()).not.toMatch(/300000|1800/);
  await page.goto(shared.toString());
  await expect(page.getByTestId('primary-difference')).toContainText('£68');
  await expect(page.getByTestId('impact-panel')).not.toContainText('Using your entered values');
  await page.reload();
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('ongoing-owner');
  await expect(page.getByLabel('Show change as', { exact: true })).toHaveValue('monthly');
  await expect(page.getByTestId('primary-difference')).toContainText('£68');
});

test('sharing the full postcode requires explicit opt-in', async ({ page }) => {
  await page.goto(sharedPath());
  await findPostcode(page, 'LE4 0DD');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await expect(page.getByLabel('Include full postcode in link')).not.toBeChecked();
  await page.getByLabel('Include full postcode in link').check();
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const shared = new URL(await page.getByLabel('Share link', { exact: true }).inputValue());
  expect(shared.searchParams.get('postcode')).toBe('LE4 0DD');
  await page.goto(shared.toString());
  await expect(page.getByTestId('impact-panel')).toContainText(BRADGATE);
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
});

test('a new unknown postcode lookup removes the previous share link and selected result', async ({ page }) => {
  await page.goto(sharedPath());
  await findPostcode(page, 'LE4 0DD');
  await page.getByLabel('Include full postcode in link').check();
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.getByLabel('Share link', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Share this comparison', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await findPostcode(page, 'SW1A 9ZZ');
  await expect(page.getByTestId('postcode-status')).toContainText('not in the May 2025 directory');
  await expect(page.getByLabel('Share link', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Include full postcode in link')).toHaveCount(0);
  await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Select an area', exact: true })).toBeVisible();
});

test('browser back and forward restore comparison settings', async ({ page }) => {
  await page.goto(sharedPath());
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
  await page.goBack();
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('ongoing-owner');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.goForward();
  await expect(page.getByLabel('Compare costs', { exact: true })).toHaveValue('annualised-ownership');
  await expect(page.getByTestId('primary-difference')).toContainText('£935');
});

test('search and results remain usable when WebGL cannot initialise', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.includes('webgl')) return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto(sharedPath({ area: 'E06000016', geography: 'LAD' }));
  await expect(page.getByText('Explore using search or the area list', { exact: true })).toBeVisible();
  await findPostcode(page, 'LE4 0DD');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await expect(page.getByTestId('impact-panel')).toContainText(BRADGATE);
});

test('narrow screens support area selection and comparison without a polygon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sharedPath({ area: 'E06000016', geography: 'LAD' }));
  await page.getByLabel('Map areas', { exact: true }).selectOption('MSOA');
  await page.getByLabel('Area name or code').fill(BRADGATE);
  await areaButton(page, BRADGATE).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
  await page.getByTestId('impact-panel').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('impact-panel')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const key of ['data', 'policy', 'rule']) {
  test(`an unsupported shared ${key} version is explained without calculating with newer data`, async ({ page }) => {
    await page.goto(sharedPath({ [key]: 'unsupported-old-version' }));
    await expect(page.getByText(/unavailable or unsupported/)).toBeVisible();
    await expect(page.getByTestId('primary-difference')).toHaveCount(0);
  });
}

test('a failed postcode shard is a recoverable network error, not an unknown postcode', async ({ page }) => {
  const shard = `**/data/public-v1/${DATA}/postcodes/LE4.json`;
  await page.route(shard, route => route.abort('failed'));
  await page.goto(sharedPath({ area: 'E06000016', geography: 'LAD' }));
  await findPostcode(page, 'LE4 0DD');
  await expect(page.getByText(/Could not load the pinned data/)).toBeVisible();
  await expect(page.getByText(/not in the May 2025 directory/)).toHaveCount(0);
  await page.unroute(shard);
  await findPostcode(page, 'LE4 0DD');
  await expect(page.getByTestId('primary-difference')).toContainText('£814');
});

test('methodology and data credits remain readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/methodology/');
    await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible();
    await expect(page.locator('article')).toContainText('−£100 through +£100 per year, inclusive');
    await page.getByRole('link', { name: 'data sources and coverage' }).click();
    await expect(page.getByRole('heading', { name: 'Data & coverage' })).toBeVisible();
    await expect(page.getByRole('table')).toContainText('3,895');
    await expect(page.locator('article')).toContainText('107 unavailable');
    await expect(page.locator('article')).toContainText('2,651,940');
    await expect(page.locator('article')).toContainText('Northern Ireland postcode data has separate LPS terms and is excluded');
    await expect(page.getByRole('link', { name: 'Open Government Licence v.3.0' })).toBeVisible();
  } finally {
    await context.close();
  }
});
