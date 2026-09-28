import { parseRational } from './rational.js';
import { INPUT_SCHEMA_VERSION } from './types.js';
import type { ComparisonInput, Issue, JsonValue, Provenance } from './types.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function isMoneyInput(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string' && v.length > 0);
}
function jsonValue(value: unknown, seen = new Set<unknown>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 32 || seen.has(value)) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  seen.add(value);
  const valid = Object.values(value).every(v => jsonValue(v, seen, depth + 1));
  seen.delete(value);
  return valid;
}
export function validProvenance(value: unknown): value is Provenance {
  if (!isRecord(value) || !jsonValue(value)) return false;
  if (!(value.dataVersion === null || typeof value.dataVersion === 'string' && value.dataVersion.length > 0)
    || value.methodologyVersion !== 'phase0-v1') return false;
  const sources = ['area-estimate', 'personal-input', 'fixture'];
  if (typeof value.valueSource !== 'string' || !sources.includes(value.valueSource)
    || typeof value.councilTaxSource !== 'string' || !sources.includes(value.councilTaxSource)) return false;
  if (value.sourcePeriods !== undefined && (!isRecord(value.sourcePeriods)
    || !Object.values(value.sourcePeriods).every(v => typeof v === 'string' && v.length > 0))) return false;
  if (value.sourceRefs !== undefined && !isRecord(value.sourceRefs)) return false;
  if (value.area !== undefined) {
    const a = value.area;
    if (!isRecord(a) || typeof a.code !== 'string' || !a.code || typeof a.name !== 'string' || !a.name
      || typeof a.geography !== 'string' || !['MSOA', 'LAD'].includes(a.geography)
      || typeof a.availability !== 'string' || !['available', 'unavailable'].includes(a.availability)) return false;
  }
  if ((value.valueSource === 'area-estimate' || value.councilTaxSource === 'area-estimate')
    && (!value.area || !value.dataVersion)) return false;
  return true;
}

export function validExactPence(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== 2
    || !['number', 'string'].includes(typeof value.numerator)
    || !['number', 'string'].includes(typeof value.denominator)) return false;
  const fraction = parseRational(value);
  return fraction !== null && fraction.numerator >= 0n;
}

export function validateComparisonInput(value: unknown):
  { valid: true; input: ComparisonInput } | { valid: false; status: 'invalid-input' | 'unavailable'; issues: Issue[] } {
  const issues: Issue[] = [];
  const add = (code: string, field: string, message: string) => issues.push({ code, field, message });
  if (!isRecord(value)) return { valid: false, status: 'invalid-input', issues: [{ code: 'invalid-input-schema', field: '', message: 'Expected a comparison input object.' }] };
  const keys = new Set(['schemaVersion', 'policyVersion', 'mode', 'jurisdiction', 'residenceScope', 'propertyValuePence',
    'annualCouncilTaxPence', 'ownershipYears', 'buyer', 'sdltRuleVersion', 'provenance', 'unavailableReasons', 'qualityFlags']);
  for (const key of Object.keys(value)) if (!keys.has(key)) add('unknown-input-field', key, 'Unrecognised input field.');
  if (value.schemaVersion !== INPUT_SCHEMA_VERSION) add('unsupported-input-schema', 'schemaVersion', 'Unsupported input schema version.');
  if (typeof value.policyVersion !== 'string' || !value.policyVersion) add('invalid-policy-version', 'policyVersion', 'An explicit policy version is required.');
  if (typeof value.mode !== 'string' || !['ongoing-owner', 'annualised-ownership', 'purchase-year'].includes(value.mode)) add('unsupported-comparison-mode', 'mode', 'Unknown comparison mode.');
  if (value.propertyValuePence !== null && !isMoneyInput(value.propertyValuePence)) add('invalid-property-value', 'propertyValuePence', 'Use non-negative safe integer pence, or null for unavailable.');
  const bill = value.annualCouncilTaxPence;
  if (bill !== null && !isMoneyInput(bill)) {
    if (!validExactPence(bill)) add('invalid-council-tax', 'annualCouncilTaxPence', 'Use non-negative pence or a valid exact fraction.');
  }
  if (value.ownershipYears !== undefined && !(typeof value.ownershipYears === 'number'
    && Number.isSafeInteger(value.ownershipYears) && value.ownershipYears > 0)) add('invalid-ownership-years', 'ownershipYears', 'Ownership years must be a positive whole number.');
  if (value.mode === 'annualised-ownership' && value.ownershipYears === undefined) add('ownership-years-required', 'ownershipYears', 'Annualisation requires an explicit ownership period.');
  if (value.sdltRuleVersion !== undefined && (typeof value.sdltRuleVersion !== 'string' || !value.sdltRuleVersion)) add('invalid-sdlt-rule-version', 'sdltRuleVersion', 'An explicit SDLT version is required for purchase comparisons.');
  if (value.mode !== 'ongoing-owner' && value.sdltRuleVersion === undefined) add('sdlt-rule-version-required', 'sdltRuleVersion', 'Select an explicit SDLT rule version.');
  if (!validProvenance(value.provenance)) add('invalid-provenance', 'provenance', 'Valid input sources and supported methodology version are required.');
  for (const field of ['unavailableReasons', 'qualityFlags']) {
    if (value[field] !== undefined && !isStringList(value[field])) add('invalid-reason-list', field, 'Expected an array of non-empty strings.');
  }
  if (validProvenance(value.provenance) && value.provenance.area?.availability === 'unavailable'
    && value.provenance.valueSource === 'area-estimate' && value.provenance.councilTaxSource === 'area-estimate'
    && value.propertyValuePence !== null && value.annualCouncilTaxPence !== null
    && (!isStringList(value.unavailableReasons) || value.unavailableReasons.length === 0)) {
    add('inconsistent-area-availability', 'provenance', 'An unavailable area cannot become available without replacing its missing dependencies.');
  }
  if (issues.length) return { valid: false, status: 'invalid-input', issues };
  if (value.jurisdiction !== 'England') add('unsupported-jurisdiction', 'jurisdiction', 'This engine supports England only.');
  if (value.residenceScope !== 'primary-residence') add('unsupported-residence-scope', 'residenceScope', 'This policy supports an owner-occupied primary residence only.');
  if (issues.length) return { valid: false, status: 'unavailable', issues };
  return { valid: true, input: value as unknown as ComparisonInput };
}
