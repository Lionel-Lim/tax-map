import { divide, rational, roundHalfAwayFromZero, serializeRational } from './rational.js';
import type { Rational, SerializedRational } from './rational.js';

export interface MoneyAmount {
  readonly exactPence: SerializedRational;
  readonly roundedPence: string;
  readonly displayPounds: string;
  readonly displayPrecise: string;
}

export interface MoneyFormatOptions {
  /** Include + for positive values; zero never receives a sign. */
  readonly signed?: boolean;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatRounded(amount: bigint, decimalPlaces: 0 | 2, signed: boolean): string {
  const sign = amount < 0n ? '-' : signed && amount > 0n ? '+' : '';
  const magnitude = amount < 0n ? -amount : amount;
  if (decimalPlaces === 0) return `${sign}£${groupThousands(magnitude.toString())}`;
  const pounds = magnitude / 100n;
  const pennies = (magnitude % 100n).toString().padStart(2, '0');
  return `${sign}£${groupThousands(pounds.toString())}.${pennies}`;
}

/** Both display precisions are rounded directly from the exact amount in pence. */
export function moneyAmount(value: Rational, options: MoneyFormatOptions = {}): MoneyAmount {
  const roundedPence = roundHalfAwayFromZero(value);
  const roundedPounds = roundHalfAwayFromZero(divide(value, rational(100n)));
  return {
    exactPence: serializeRational(value),
    roundedPence: roundedPence.toString(),
    displayPounds: formatRounded(roundedPounds, 0, options.signed === true),
    displayPrecise: formatRounded(roundedPence, 2, options.signed === true),
  };
}
