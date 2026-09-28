import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

function cli(args: string[]) {
  return spawnSync(process.execPath, ['.build/domain/scripts/domain/compare.js', ...args], { encoding: 'utf8' });
}
test('CLI exposes the verified ongoing-owner example and sample area', () => {
  const example = cli(['--value', '300000', '--bill', '1800']);
  assert.equal(example.status, 0, example.stderr);
  assert.match(example.stdout, /Scenario: £1,440.00/);
  assert.match(example.stdout, /Difference: -£360.00/);
  const sample = cli(['--area', 'E02002830', '--json']);
  assert.equal(sample.status, 0, sample.stderr);
  assert.equal(JSON.parse(sample.stdout).provenance.area.code, 'E02002830');
});
test('CLI purchase modes use explicit buyer and years, with FTB limits and no monthly purchase label', () => {
  const purchase = cli(['--value', '400000', '--bill', '1800', '--mode', 'purchase-year', '--buyer', 'first-time-buyer']);
  assert.equal(purchase.status, 0, purchase.stderr);
  assert.match(purchase.stdout, /Upfront SDLT: £5,000.00/);
  assert.doesNotMatch(purchase.stdout, /Monthly equivalent/);
  const annual = cli(['--value', '500000', '--bill', '1800', '--mode', 'annualised-ownership', '--buyer', 'standard', '--years', '20', '--json']);
  assert.equal(annual.status, 0, annual.stderr);
  assert.equal(JSON.parse(annual.stdout).difference.roundedPence, '-15000');
  const excluded = cli(['--value', '500000.01', '--bill', '1800', '--mode', 'purchase-year', '--buyer', 'first-time-buyer']);
  assert.equal(excluded.status, 1);
  assert.match(excluded.stdout, /https:\/\/www.gov.uk\//);
});
test('CLI preserves unavailable sample status while enabling a separately labelled personal bill', () => {
  assert.equal(cli(['--area', 'E02000927']).status, 1);
  const personal = cli(['--area', 'E02000927', '--bill', '1800', '--json']);
  assert.equal(personal.status, 0, personal.stderr);
  const result = JSON.parse(personal.stdout);
  assert.equal(result.estimateKind, 'personal-comparison');
  assert.equal(result.provenance.area.availability, 'unavailable');
});
test('CLI validates decimal pounds exactly and rejects ambiguous or unsupported arguments', () => {
  for (const args of [ ['--value', '-1'], ['--value', '1e3'], ['--bill', '2.001'],
    ['--value', '100', '--value', '200'], ['--unknown'], ['--area', 'E02099999'],
    ['--value', '300000', '--bill', '1800', '--mode', 'annualised-ownership', '--buyer', 'standard'],
    ['--value', '300000', '--bill', '1800', '--mode', 'purchase-year'],
    ['--value', '300000', '--bill', '1800', '--buyer', 'standard'] ]) {
    assert.equal(cli(args).status, 1, args.join(' '));
  }
  const exact = cli(['--value', '0.01', '--bill', '0.00', '--json']);
  assert.equal(exact.status, 0, exact.stderr);
  assert.deepEqual(JSON.parse(exact.stdout).scenario.total.exactPence, { numerator: '3', denominator: '625' });
});

test('CLI rejects inconsistent release versions, policy bytes and policy semantics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tax-map-cli-'));
  const relative = 'static/data/sample-2026-09-26-v1';
  const release = join(dir, relative);
  mkdirSync(release, { recursive: true });
  const originalManifest = JSON.parse(readFileSync(`${relative}/manifest.json`, 'utf8'));
  const areas = readFileSync(`${relative}/areas.json`);
  const originalPolicy = readFileSync(`${relative}/policy.json`);
  const run = () => spawnSync(process.execPath, [resolve('.build/domain/scripts/domain/compare.js'),
    '--area', 'E02002830', '--json'], { cwd: dir, encoding: 'utf8' });
  try {
    writeFileSync(join(release, 'areas.json'), areas);
    writeFileSync(join(release, 'policy.json'), originalPolicy);
    for (const patch of [{ releaseId: 'old-release' }, { schemaVersion: '2.0.0' },
      { methodologyVersion: 'unknown' }, { policyVersions: ['unknown'] }]) {
      writeFileSync(join(release, 'manifest.json'), JSON.stringify({ ...originalManifest, ...patch }));
      assert.equal(run().status, 1);
    }
    writeFileSync(join(release, 'manifest.json'), JSON.stringify(originalManifest));
    assert.equal(run().status, 0);
    const policy = JSON.parse(originalPolicy.toString());
    policy.annualRate.numerator = 480;
    const changed = JSON.stringify(policy);
    writeFileSync(join(release, 'policy.json'), changed);
    assert.match(run().stderr, /checksum mismatch/);
    const modifiedManifest = structuredClone(originalManifest);
    modifiedManifest.artifacts['policy.json'].sha256 = createHash('sha256').update(changed).digest('hex');
    writeFileSync(join(release, 'manifest.json'), JSON.stringify(modifiedManifest));
    const invalidPolicy = run();
    assert.equal(invalidPolicy.status, 1);
    assert.ok(JSON.parse(invalidPolicy.stdout).reasons.includes('unsupported-policy-configuration'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
