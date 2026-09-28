/** Local demonstration of the pure engine; not the Phase 3 application. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { compareArea, compareTaxes, FIRST_TIME_BUYER, STANDARD_BUYER, POLICY_VERSION,
  SDLT_RULE_VERSION, INPUT_SCHEMA_VERSION, SAMPLE_DATA_VERSION, AREA_SCHEMA_VERSION } from '../../src/lib/domain/tax/index.js';
import type { ComparisonResult } from '../../src/lib/domain/tax/index.js';

const HELP = `Try the Phase 2 tax engine (amounts entered in pounds):
  npm run compare -- --area E02002830
  npm run compare -- --area E02002830 --mode annualised-ownership --years 20 --buyer standard
  npm run compare -- --value 400000 --bill 1800 --mode purchase-year --buyer first-time-buyer
  npm run compare -- --area E02000927 --bill 1800

Options: --area CODE, --value GBP, --bill GBP, --mode ongoing-owner|annualised-ownership|purchase-year,
         --years WHOLE_NUMBER, --buyer standard|first-time-buyer, --json, --help.
Default mode: ongoing-owner. Purchase modes require an explicit buyer; annualised mode also requires years.
Purchase presets assume UK-resident individual purchasers, a single freehold main residence, no additional-property
surcharge, linked/mixed/shared-ownership transaction or special relief. The first-time preset explicitly assumes
all purchasers satisfy HMRC eligibility. These are scenario assumptions, not an assessment of your tax status.`;

function pence(value: string, field: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new Error(`${field}: use non-negative pounds with at most two decimal places.`);
  const [pounds, decimal = ''] = value.split('.');
  const exact = BigInt(pounds!) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field}: amount exceeds the supported integer range.`);
  return Number(exact);
}
function main(): void {
  const args = process.argv.slice(2), options: Record<string, string> = {};
  const switches = new Set(['--json', '--help']);
  const valued = new Set(['--area', '--value', '--bill', '--mode', '--years', '--buyer']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if ((!switches.has(key) && !valued.has(key)) || key in options) throw new Error(`Unknown or duplicate option: ${key}`);
    if (switches.has(key)) options[key] = 'true';
    else {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      options[key] = value;
    }
  }
  if (options['--help'] || args.length === 0) { console.log(HELP); return; }
  const mode = options['--mode'] ?? 'ongoing-owner';
  if (options['--years'] !== undefined && !/^[1-9]\d*$/.test(options['--years'])) throw new Error('--years must be a positive whole number.');
  if (mode !== 'ongoing-owner' && !options['--buyer']) throw new Error('Purchase comparisons require --buyer standard or first-time-buyer.');
  if (mode === 'ongoing-owner' && (options['--buyer'] || options['--years'])) throw new Error('Ongoing-owner mode does not use buyer or ownership-year options.');
  const buyerName = options['--buyer'];
  if (buyerName && !['standard', 'first-time-buyer'].includes(buyerName)) throw new Error('Unsupported buyer profile.');
  const shared = { schemaVersion: INPUT_SCHEMA_VERSION, policyVersion: POLICY_VERSION, mode,
    jurisdiction: 'England', residenceScope: 'primary-residence',
    ...(options['--years'] ? { ownershipYears: Number(options['--years']) } : {}),
    ...(buyerName ? { buyer: buyerName === 'standard' ? STANDARD_BUYER : FIRST_TIME_BUYER, sdltRuleVersion: SDLT_RULE_VERSION } : {}),
  };
  const overrides = {
    ...(options['--value'] !== undefined ? { propertyValuePence: pence(options['--value'], '--value') } : {}),
    ...(options['--bill'] !== undefined ? { annualCouncilTaxPence: pence(options['--bill'], '--bill') } : {}),
  };
  let result: ComparisonResult;
  if (options['--area']) {
    const dir = resolve('static/data', SAMPLE_DATA_VERSION);
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
    if (manifest.releaseId !== SAMPLE_DATA_VERSION || manifest.schemaVersion !== AREA_SCHEMA_VERSION
      || manifest.methodologyVersion !== 'phase0-v1' || !Array.isArray(manifest.policyVersions)
      || manifest.policyVersions.length !== 1 || manifest.policyVersions[0] !== POLICY_VERSION) {
      throw new Error('Release metadata does not match the selected data, methodology and policy versions.');
    }
    const artifact = (name: string): unknown => {
      const payload = readFileSync(resolve(dir, name));
      if (createHash('sha256').update(payload).digest('hex') !== manifest.artifacts[name]?.sha256) throw new Error(`${name}: artifact checksum mismatch.`);
      return JSON.parse(payload.toString());
    };
    const dataset = artifact('areas.json') as { releaseId: string; schemaVersion: string; areas: { code: string }[] };
    if (dataset.releaseId !== manifest.releaseId || dataset.schemaVersion !== manifest.schemaVersion || !Array.isArray(dataset.areas)) {
      throw new Error('Area data and manifest versions do not match.');
    }
    const policy = artifact('policy.json');
    const area = dataset.areas.find((a: { code: string }) => a.code === options['--area']);
    if (!area) throw new Error('Area code is not in the five-authority sample.');
    const { schemaVersion: _, ...settings } = shared;
    result = compareArea(area, { ...settings, dataVersion: dataset.releaseId, dataSchemaVersion: dataset.schemaVersion, overrides }, policy);
  } else {
    result = compareTaxes({ ...shared, propertyValuePence: overrides.propertyValuePence ?? null,
      annualCouncilTaxPence: overrides.annualCouncilTaxPence ?? null,
      provenance: { dataVersion: null, methodologyVersion: 'phase0-v1', valueSource: 'personal-input', councilTaxSource: 'personal-input' } });
  }
  if (options['--json']) console.log(JSON.stringify(result, null, 2));
  else if (result.status !== 'available') {
    console.log(`${result.status}: ${result.reasons.join(', ')}`);
    for (const issue of result.issues) console.log(`  ${issue.message}`);
    for (const url of result.guidanceUrls) console.log(url);
  } else {
    console.log(`${result.provenance.area?.name ?? 'Personal inputs'} — ${result.estimateKind}`);
    console.log(`Illustrative 0.48% property tax — uncapped; ${result.mode}`);
    console.log(`Property value: ${result.propertyValue.displayPrecise}`);
    console.log(`Current ${result.basis}: ${result.current.total.displayPrecise}`);
    if (result.sdlt) console.log(`Upfront SDLT: ${result.current.sdltUpfront.displayPrecise}; included here: ${result.current.sdltIncluded.displayPrecise}`);
    console.log(`Scenario: ${result.scenario.total.displayPrecise}`);
    console.log(`Difference: ${result.difference.displayPrecise} (${result.direction})`);
    if (result.monthlyEquivalent) console.log(`Monthly equivalent: ${result.monthlyEquivalent.displayPrecise}`);
    if (result.provenance.area) console.log(`Original area estimate: ${result.provenance.area.availability}; data ${result.provenance.dataVersion}`);
    if (buyerName) console.log(`Buyer preset: ${buyerName}; UK-resident individuals, eligible single freehold main-residence purchase. See --help for scope.`);
    for (const assumption of result.assumptions) console.log(`  ${assumption}`);
  }
  if (result.status !== 'available') process.exitCode = 1;
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
