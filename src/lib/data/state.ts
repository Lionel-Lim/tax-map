import { AREA_SCHEMA_VERSION, ENGLAND_DATA_VERSION, SUPPORTED_DATA_VERSIONS } from '../domain/tax/area.js';
import type { AreaComparisonOptions } from '../domain/tax/area.js';
import type { ComparisonMode } from '../domain/tax/types.js';
import { POLICY_VERSION } from '../domain/tax/policy.js';
import { FIRST_TIME_BUYER, SDLT_RULE_VERSION, STANDARD_BUYER } from '../domain/tax/sdlt.js';
import type { Geography } from './release.js';
import { normalisePostcode } from './postcodes.js';

export type DisplayPreference = 'annual' | 'monthly' | 'percentage';
export interface SharedState {
  dataVersion: string; policyVersion: string; sdltRuleVersion: string;
  mode: ComparisonMode; buyer: 'standard' | 'first-time-buyer'; ownershipYears: number;
  areaCode: string | null; geography: Geography; display: DisplayPreference; propertyType: 'all';
  postcode: string | null;
}
/** Application landing defaults; the immutable Phase 1 bundle retains its original M1 defaults. */
export const DEFAULT_STATE: Readonly<SharedState> = Object.freeze({
  dataVersion: ENGLAND_DATA_VERSION, policyVersion: POLICY_VERSION, sdltRuleVersion: SDLT_RULE_VERSION,
  mode: 'annualised-ownership', buyer: 'standard', ownershipYears: 20,
  areaCode: 'E06000016', geography: 'LAD', display: 'annual', propertyType: 'all', postcode: null,
});
const KEYS = ['data', 'policy', 'rule', 'mode', 'buyer', 'years', 'area', 'geography', 'display', 'type', 'postcode'];
export type ParsedSharedState = { ok: true; state: SharedState } | { ok: false; errors: string[] };

export function parseSharedState(input: URLSearchParams | string): ParsedSharedState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const state: SharedState = { ...DEFAULT_STATE }, errors: string[] = [];
  for (const key of KEYS) if (params.getAll(key).length > 1) errors.push(`The shared link repeats “${key}”.`);
  const dataVersion = params.get('data');
  if (dataVersion !== null) {
    if (!SUPPORTED_DATA_VERSIONS.some(version => version === dataVersion)) errors.push(`The requested data version “${dataVersion}” is unavailable or unsupported. No newer version has been substituted.`);
    else state.dataVersion = dataVersion;
  }
  for (const [key, field, expected] of [
    ['policy', 'policyVersion', POLICY_VERSION], ['rule', 'sdltRuleVersion', SDLT_RULE_VERSION],
  ] as const) {
    const value = params.get(key);
    if (value !== null && value !== expected) errors.push(`The requested ${key} version “${value}” is unavailable or unsupported. No newer version has been substituted.`);
    else if (value !== null) state[field] = value;
  }
  const select = <K extends 'mode' | 'buyer' | 'geography' | 'display' | 'propertyType'>(key: string, field: K, choices: readonly SharedState[K][]) => {
    const value = params.get(key);
    if (value === null) return;
    if (choices.includes(value as SharedState[K])) state[field] = value as SharedState[K];
    else errors.push(`The shared link has an unsupported ${key} setting.`);
  };
  select('mode', 'mode', ['ongoing-owner', 'annualised-ownership', 'purchase-year']);
  select('buyer', 'buyer', ['standard', 'first-time-buyer']);
  select('geography', 'geography', ['LAD', 'MSOA']);
  select('display', 'display', ['annual', 'monthly', 'percentage']);
  select('type', 'propertyType', ['all']);
  const years = params.get('years');
  if (years !== null) {
    if (!/^[1-9]\d*$/.test(years) || !Number.isSafeInteger(Number(years))) errors.push('Ownership years must be a positive whole number.');
    else state.ownershipYears = Number(years);
  }
  const area = params.get('area');
  if (area !== null) {
    if (area === '') state.areaCode = null;
    else if (!/^E\d{8}$/.test(area)) errors.push('The shared link contains an invalid area code.');
    else state.areaCode = area;
  }
  const postcode = params.get('postcode');
  if (postcode !== null) {
    const normalised = normalisePostcode(postcode);
    if (!normalised) errors.push('The shared postcode is malformed.');
    else state.postcode = normalised;
  }
  if (state.mode === 'purchase-year' && state.display === 'monthly') errors.push('A purchase-year cash-cost comparison cannot use a recurring monthly display.');
  return errors.length ? { ok: false, errors } : { ok: true, state };
}

/** A whitelist prevents personal amounts or unknown state fields from entering a share URL. */
export function serializeSharedState(state: SharedState, options: { includePostcode?: boolean; postcode?: string } = {}): string {
  const params = new URLSearchParams({ data: state.dataVersion, policy: state.policyVersion, rule: state.sdltRuleVersion,
    mode: state.mode, buyer: state.buyer, years: String(state.ownershipYears), geography: state.geography,
    display: state.display, type: state.propertyType });
  params.set('area', state.areaCode ?? '');
  if (options.includePostcode) {
    const postcode = normalisePostcode(options.postcode ?? state.postcode ?? '');
    if (!postcode) throw new Error('Enter a valid postcode before explicitly sharing it.');
    params.set('postcode', postcode);
  }
  const parsed = parseSharedState(params);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  return params.toString();
}

export function stateToComparisonOptions(state: SharedState): AreaComparisonOptions {
  return { dataVersion: state.dataVersion, dataSchemaVersion: AREA_SCHEMA_VERSION, policyVersion: state.policyVersion,
    mode: state.mode, jurisdiction: 'England', residenceScope: 'primary-residence', ownershipYears: state.ownershipYears,
    buyer: state.buyer === 'first-time-buyer' ? FIRST_TIME_BUYER : state.buyer === 'standard' ? STANDARD_BUYER : { profile: state.buyer },
    sdltRuleVersion: state.sdltRuleVersion };
}
