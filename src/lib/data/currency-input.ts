/** Accept UK currency formatting without silently repairing misplaced commas. */
export function parsePoundsInput(value: string): number | undefined {
  const input = value.trim();
  if (!input) return undefined;
  if (!/^£?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    throw new Error('Enter an amount such as £300,000 or 1800.50, with at most two decimal places.');
  }
  const [pounds, pennies = ''] = input.replace(/[£,\s]/g, '').split('.');
  const amount = BigInt(pounds!) * 100n + BigInt(pennies.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('This amount is too large. Enter a smaller value.');
  return Number(amount);
}

export function formatPoundsInput(pence: number | undefined): string {
  if (pence === undefined) return '';
  const pennies = pence % 100;
  return Math.floor(pence / 100).toLocaleString('en-GB') + (pennies ? `.${String(pennies).padStart(2, '0')}` : '');
}
