import type { ComparisonMode, ComparisonResult } from '../domain/tax/types.js';

export type ResultKind = 'lower' | 'near-zero' | 'higher' | 'unavailable';
export type Geography = 'LAD' | 'MSOA';

/** All map, list and panel colours use the engine's exact-pence classification. */
export const colourByKind: Record<ResultKind, string> = {
  lower: '#397b9d',
  'near-zero': '#d6d2c3',
  higher: '#ca7847',
  unavailable: '#898694',
};

const labelByKind: Record<ResultKind, string> = {
  lower: 'Lower cost',
  'near-zero': 'Within £100',
  higher: 'Higher cost',
  unavailable: 'Unavailable',
};

export function resultPresentation(result: ComparisonResult | null | undefined) {
  const kind: ResultKind = result?.status === 'available' ? result.classification.kind : 'unavailable';
  return { kind, label: labelByKind[kind], colour: colourByKind[kind] };
}

export function geographyLabel(geography: Geography): string {
  return geography === 'LAD' ? 'Council area' : 'Neighbourhood (MSOA)';
}

export function comparisonBasisLabel(mode: ComparisonMode): string {
  return mode === 'purchase-year' ? 'in the purchase year' : 'per year';
}
