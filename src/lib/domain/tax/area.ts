import { compareTaxes, failure } from './comparison.js';
import { calculateCouncilTax } from './council-tax.js';
import { compare, parseRational } from './rational.js';
import { isMoneyInput, isRecord, isStringList, validExactPence, validProvenance } from './validation.js';
import { INPUT_SCHEMA_VERSION } from './types.js';
import type { ComparisonMode, ComparisonResult, ExactPenceInput, JsonObject, Provenance } from './types.js';

export const SAMPLE_DATA_VERSION = 'sample-2026-09-26-v1';
export const ENGLAND_DATA_VERSION = 'england-2026-09-26-v1';
export const SUPPORTED_DATA_VERSIONS: readonly string[] = Object.freeze([SAMPLE_DATA_VERSION, ENGLAND_DATA_VERSION]);
export const AREA_SCHEMA_VERSION = '1.0.0';
export interface AreaRecord {
  code: string; name: string; geography: 'MSOA' | 'LAD'; parentCode: string | null;
  propertyType: 'all'; availability: 'available' | 'unavailable';
  pricePence: number | null; councilTaxExactPence: ExactPenceInput | null;
  unavailableReasons: string[]; qualityFlags: string[]; sourceRefs: JsonObject;
}
export interface AreaComparisonOptions {
  dataVersion: string; dataSchemaVersion: string;
  policyVersion: string; mode: ComparisonMode;
  jurisdiction: 'England'; residenceScope: 'primary-residence';
  ownershipYears?: number; buyer?: unknown; sdltRuleVersion?: string;
  overrides?: { propertyValuePence?: number; annualCouncilTaxPence?: number };
}

function validateArea(value: unknown): value is AreaRecord {
  if (!isRecord(value) || typeof value.code !== 'string' || !/^E\d{8}$/.test(value.code)
    || typeof value.name !== 'string' || !value.name || typeof value.geography !== 'string' || !['MSOA', 'LAD'].includes(value.geography)
    || typeof value.availability !== 'string' || !['available', 'unavailable'].includes(value.availability) || value.propertyType !== 'all'
    || !isStringList(value.unavailableReasons) || !isStringList(value.qualityFlags) || !isRecord(value.sourceRefs)) return false;
  if (value.geography === 'MSOA' && (typeof value.parentCode !== 'string' || !/^E\d{8}$/.test(value.parentCode))) return false;
  if (value.geography === 'LAD' && value.parentCode !== null) return false;
  if (value.pricePence !== null && (!isMoneyInput(value.pricePence) || value.pricePence === 0)) return false;
  const baseline = parseRational(value.councilTaxExactPence);
  if (value.councilTaxExactPence !== null && !validExactPence(value.councilTaxExactPence)) return false;
  if (value.availability === 'available' && (value.unavailableReasons.length > 0 || !baseline || value.pricePence === null)) return false;
  if (value.availability === 'unavailable' && value.unavailableReasons.length === 0) return false;
  return true;
}

/** Selects inputs without changing the original area's availability or map data. */
export function compareArea(areaValue: unknown, optionsValue: unknown, policy?: unknown): ComparisonResult {
  const bad = (code: string, field: string, message: string, status: 'unavailable' | 'invalid-input' = 'invalid-input') =>
    failure(optionsValue, status, [{ code, field, message }]);
  if (!isRecord(optionsValue)) return bad('invalid-area-options', 'options', 'Area comparison options are required.');
  const allowed = new Set(['dataVersion', 'dataSchemaVersion', 'policyVersion', 'mode', 'jurisdiction', 'residenceScope', 'ownershipYears', 'buyer', 'sdltRuleVersion', 'overrides']);
  if (Object.keys(optionsValue).some(k => !allowed.has(k))) return bad('unknown-area-option', 'options', 'Unrecognised area option.');
  if (typeof optionsValue.dataVersion !== 'string' || !SUPPORTED_DATA_VERSIONS.includes(optionsValue.dataVersion)) return bad('unsupported-data-version', 'dataVersion', 'Load the explicitly requested supported data release.', 'unavailable');
  if (optionsValue.dataSchemaVersion !== AREA_SCHEMA_VERSION) return bad('unsupported-data-schema', 'dataSchemaVersion', 'Unsupported area data schema.', 'unavailable');
  if (!validateArea(areaValue)) return bad('invalid-area-record', 'area', 'Area values, availability, reasons or source schema are inconsistent.');
  const area = areaValue;
  const overrides = optionsValue.overrides === undefined ? {} : optionsValue.overrides;
  if (!isRecord(overrides) || Object.keys(overrides).some(k => !['propertyValuePence', 'annualCouncilTaxPence'].includes(k))) return bad('invalid-overrides', 'overrides', 'Only explicit property value and annual bill overrides are supported.');
  for (const [key, value] of Object.entries(overrides)) {
    if (!isMoneyInput(value)) return bad('invalid-personal-input', `overrides.${key}`, 'Personal amounts must be non-negative safe integer pence.');
  }
  const valueOverride = Object.hasOwn(overrides, 'propertyValuePence');
  const billOverride = Object.hasOwn(overrides, 'annualCouncilTaxPence');
  const stock = area.sourceRefs.stock, charge = area.sourceRefs.charge, price = area.sourceRefs.price;
  const hasText = (ref: Record<string, unknown>, key: string) => typeof ref[key] === 'string' && ref[key].length > 0;
  if (!valueOverride && area.pricePence !== null && (!isRecord(price) || price.code !== area.code
    || price.sourceId !== (area.geography === 'MSOA' ? 'ons-msoa-prices' : 'ons-lad-prices')
    || price.units !== 'GBP' || !hasText(price, 'cell') || !hasText(price, 'period'))) {
    return bad('invalid-area-provenance', 'sourceRefs.price', 'A retained area value requires matching source and period references.');
  }
  // Check any retained baseline, including one in a row whose price is unavailable.
  if (!billOverride && area.councilTaxExactPence !== null) {
    if (!isRecord(stock) || !isRecord(charge) || stock.code !== area.code
      || charge.code !== (area.parentCode ?? area.code) || stock.sourceId !== 'voa-stock-all'
      || charge.sourceId !== 'council-tax' || !hasText(stock, 'period') || !hasText(charge, 'period')
      || !hasText(stock, 'member') || !hasText(charge, 'cell')) {
      return bad('invalid-area-provenance', 'sourceRefs', 'A retained baseline requires matching stock, charge and period references.');
    }
    const weighted = calculateCouncilTax({ counts: stock.rawCounts, bandDPence: charge.bandDPence,
      reportedTotal: stock.reportedTotal, geographyNeedsReview: area.qualityFlags.includes('geography-needs-review') });
    if (weighted.status !== 'available' || compare(parseRational(weighted.exactPence)!, parseRational(area.councilTaxExactPence)!) !== 0) {
      return bad('area-baseline-mismatch', 'councilTaxExactPence', 'Published baseline does not match compatible raw inputs.');
    }
  }
  const baselineReasons = new Set(['stock-marker-unverified', 'stock-suppressed', 'stock-unavailable', 'stock-total-unavailable',
    'stock-denominator-zero', 'stock-total-nonpositive', 'charge-unavailable', 'council-tax-unavailable', 'geography-needs-review']);
  const remaining = area.unavailableReasons.filter(reason => {
    if (reason === 'price-unavailable') return !valueOverride;
    if (baselineReasons.has(reason)) return !billOverride;
    if (reason === 'source-value-unrecognised') return !(valueOverride && billOverride);
    return true;
  });
  const sourcePeriods: Record<string, string> = {};
  for (const field of ['price', 'stock', 'charge']) {
    const reference = area.sourceRefs[field];
    if (isRecord(reference) && typeof reference.period === 'string') sourcePeriods[field] = reference.period;
  }
  const provenance: Provenance = {
    dataVersion: optionsValue.dataVersion, methodologyVersion: 'phase0-v1',
    valueSource: valueOverride ? 'personal-input' : 'area-estimate',
    councilTaxSource: billOverride ? 'personal-input' : 'area-estimate',
    area: { code: area.code, name: area.name, geography: area.geography, availability: area.availability },
    sourcePeriods, sourceRefs: area.sourceRefs,
  };
  if (!validProvenance(provenance)) return bad('invalid-area-provenance', 'sourceRefs', 'Source references must be valid JSON provenance.');
  return compareTaxes({ schemaVersion: INPUT_SCHEMA_VERSION,
    policyVersion: optionsValue.policyVersion, mode: optionsValue.mode, jurisdiction: optionsValue.jurisdiction,
    residenceScope: optionsValue.residenceScope,
    propertyValuePence: valueOverride ? overrides.propertyValuePence : area.pricePence,
    annualCouncilTaxPence: billOverride ? overrides.annualCouncilTaxPence : area.councilTaxExactPence,
    ...(optionsValue.ownershipYears !== undefined ? { ownershipYears: optionsValue.ownershipYears } : {}),
    ...(optionsValue.buyer !== undefined ? { buyer: optionsValue.buyer } : {}),
    ...(optionsValue.sdltRuleVersion !== undefined ? { sdltRuleVersion: optionsValue.sdltRuleVersion } : {}),
    provenance, unavailableReasons: remaining, qualityFlags: [...area.qualityFlags],
  }, policy);
}
