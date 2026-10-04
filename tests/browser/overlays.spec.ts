import { expect, test, type Page } from '@playwright/test';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
    };
    return { map: rect('.map-column'), result: rect('.result-column'), controls: rect('.scenario-controls'), pageWidth: document.documentElement.scrollWidth };
  });
}

for (const width of [390, 1440]) {
  test(`help overlays at ${width}px preserve layout, switch cleanly and return keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('primary-difference')).toContainText('£741');
    if (width === 390) await page.locator('.scenario-settings > summary').click();
    const before = await geometry(page);
    const trigger = page.getByRole('button', { name: 'About the property tax scenario', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const help = page.getByRole('dialog', { name: 'About this scenario', exact: true });
    await expect(help).toBeVisible();
    await expect(help.getByRole('heading')).toBeFocused();
    expect(await geometry(page)).toEqual(before);
    const box = await help.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    await expect(help).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.press('Space');
    await expect(help).toBeVisible();
    const second = page.getByRole('button', { name: 'Result units', exact: true });
    await second.focus();
    await second.press('Enter');
    await expect(help).not.toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(second).toBeFocused();
    expect(await geometry(page)).toEqual(before);
  });
}

test('help dismisses outside, stays within the resized viewport and uses live ownership years', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('primary-difference')).toBeVisible();
  await page.getByLabel('Compare costs', { exact: true }).selectOption('annualised-ownership');
  await page.getByLabel('Years of ownership', { exact: true }).fill('30');
  await page.getByLabel('Years of ownership', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Why the number of years matters', exact: true }).click();
  const help = page.getByRole('dialog');
  await expect(help).toContainText('30 years');
  await page.setViewportSize({ width: 320, height: 600 });
  await expect.poll(async () => {
    const box = (await help.boundingBox())!;
    return box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 600;
  }).toBe(true);
  await page.mouse.click(2, 2);
  await expect(help).not.toBeVisible();
});

for (const width of [390, 1440]) {
  test(`personal result actions at ${width}px validate, cancel edits and reset with keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/map/?mode=ongoing-owner');
    await expect(page.getByTestId('primary-difference')).toBeVisible();
    const originalDifference = await page.getByTestId('primary-difference').innerText();
    const originalMap = await page.getByTestId('map-selection-summary').innerText();
    const panel = page.getByTestId('impact-panel');
    if (width === 390) await page.locator('.scenario-settings > summary').click();
    const before = await geometry(page);
    const opener = panel.getByRole('button', { name: 'Use your own figures', exact: true });
    await expect(panel.getByRole('button', { name: 'Reset to area figures', exact: true })).toHaveCount(0);
    await opener.click();
    const dialog = page.getByRole('dialog', { name: /^(Use your own figures|Edit your figures)$/ });
    await expect(dialog).toBeVisible();
    expect(await geometry(page)).toEqual(before);
    await page.getByLabel('Property value (£)', { exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
    await expect(page.getByLabel('Property value (£)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toBeVisible();
    await page.getByLabel('Property value (£)', { exact: true }).fill('300000');
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(page.getByLabel('Property value (£)', { exact: true })).toHaveValue('');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Property value (£)', { exact: true }).fill('300000');
    await page.getByLabel('Annual Council Tax bill (£)', { exact: true }).fill('1800');
    await page.getByRole('button', { name: 'Update comparison', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const editor = panel.getByRole('button', { name: 'Edit your figures', exact: true });
    await expect(editor).toBeFocused();
    await expect(page.getByTestId('primary-difference')).toContainText('£360');
    await expect(panel).toContainText('Personal comparison · your figures');
    await expect(page.getByTestId('map-selection-summary')).toHaveText(originalMap);
    await editor.click();
    await expect(dialog).toHaveAccessibleName('Edit your figures');
    await page.getByLabel('Property value (£)', { exact: true }).fill('500000');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(page.getByTestId('primary-difference')).toContainText('£360');
    await editor.click();
    await expect(page.getByLabel('Property value (£)', { exact: true })).toHaveValue('300,000');
    await expect(page.getByLabel('Annual Council Tax bill (£)', { exact: true })).toHaveValue('1,800');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(editor).toBeFocused();
    const reset = panel.getByRole('button', { name: 'Reset to area figures', exact: true });
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(opener).toBeFocused();
    await expect(reset).toHaveCount(0);
    await expect(page.getByTestId('primary-difference')).toHaveText(originalDifference);
    await expect(page.getByTestId('map-selection-summary')).toHaveText(originalMap);
    expect((await geometry(page)).pageWidth).toBe(width);
  });
}

test('source records open from help and return focus to a visible trigger', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('primary-difference')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Data behind this estimate', exact: true });
  await trigger.click();
  await page.getByRole('button', { name: 'View source records →', exact: true }).click();
  const records = page.getByRole('dialog', { name: 'Source records', exact: true });
  await expect(records).toBeVisible();
  await expect(records).toContainText('england-2026-09-26-v1');
  await expect(records).toContainText('illustrative-ppt:1.0.0');
  await expect(records.getByLabel('Area source references')).not.toBeEmpty();
  await expect(page.locator('[popover]:popover-open')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(records).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('share dialog does not move the page and preserves explicit postcode consent', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Postcode', { exact: true }).fill('LE4 0DD');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByTestId('postcode-status')).toBeVisible();
  const before = await geometry(page);
  const opener = page.getByRole('button', { name: 'Create link', exact: true });
  await expect(page.getByLabel('Include full postcode in link')).not.toBeChecked();
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Share this comparison', exact: true })).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  expect(new URL(await page.getByLabel('Share link', { exact: true }).inputValue()).searchParams.has('postcode')).toBe(false);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.getByLabel('Include full postcode in link').check();
  await opener.click();
  expect(new URL(await page.getByLabel('Share link', { exact: true }).inputValue()).searchParams.get('postcode')).toBe('LE4 0DD');
});
