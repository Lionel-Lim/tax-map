import type { MoneyAmount } from './money.js';
import type { SdltResult } from './sdlt.js';

export const ENGINE_VERSION = '1.0.0';
export const INPUT_SCHEMA_VERSION = '1.0.0';
export type ComparisonMode = 'ongoing-owner' | 'annualised-ownership' | 'purchase-year';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ExactPenceInput = { numerator: number | string; denominator: number | string };
export type InputSource = 'area-estimate' | 'personal-input' | 'fixture';
export interface Provenance {
  dataVersion: string | null;
  methodologyVersion: 'phase0-v1';
  valueSource: InputSource;
  councilTaxSource: InputSource;
  area?: { code: string; name: string; geography: 'MSOA' | 'LAD'; availability: 'available' | 'unavailable' };
  sourcePeriods?: Record<string, string>;
  sourceRefs?: JsonObject;
}
export interface ComparisonInput {
  schemaVersion: typeof INPUT_SCHEMA_VERSION;
  policyVersion: string;
  mode: ComparisonMode;
  jurisdiction: 'England';
  residenceScope: 'primary-residence';
  propertyValuePence: number | null;
  annualCouncilTaxPence: number | ExactPenceInput | null;
  ownershipYears?: number;
  buyer?: unknown;
  sdltRuleVersion?: string;
  provenance: Provenance;
  unavailableReasons?: string[];
  qualityFlags?: string[];
}
export interface Issue { code: string; field: string; message: string; guidanceUrl?: string }
export interface ResultContext {
  engineVersion: string;
  schemaVersion: string;
  requestedPolicyVersion: string | null;
  mode: ComparisonMode | null;
  provenance: Provenance | null;
}
export interface FailedComparison extends ResultContext {
  status: 'unavailable' | 'invalid-input';
  reasons: string[];
  issues: Issue[];
  guidanceUrls: string[];
}
export interface AvailableComparison extends ResultContext {
  status: 'available';
  mode: ComparisonMode;
  provenance: Provenance;
  policyVersion: string;
  sdltRuleVersion: string | null;
  currency: 'GBP';
  units: 'pence';
  basis: 'annual' | 'first-year-cash-cost';
  estimateKind: 'area-estimate' | 'personal-comparison' | 'fixture';
  ownershipYears: number | null;
  propertyValue: MoneyAmount;
  current: { councilTax: MoneyAmount; sdltUpfront: MoneyAmount; sdltIncluded: MoneyAmount; total: MoneyAmount };
  scenario: { propertyTax: MoneyAmount; councilTax: MoneyAmount; sdlt: MoneyAmount; total: MoneyAmount };
  difference: MoneyAmount;
  monthlyEquivalent: MoneyAmount | null;
  percentageDifference: { exact: { numerator: string; denominator: string }; display: string } | null;
  direction: 'higher' | 'lower' | 'unchanged';
  classification: { kind: 'higher' | 'lower' | 'near-zero'; basis: 'annual' | 'first-year-cash-cost'; thresholdPence: '10000' };
  qualityFlags: string[];
  assumptions: string[];
  sdlt: SdltResult | null;
}
export type ComparisonResult = AvailableComparison | FailedComparison;
