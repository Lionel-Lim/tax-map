# Phase 2 calculation engine

Phase 2 provides one pure TypeScript engine for the map, list and result panel to use in Phase 3. It supports ongoing ownership, annualised ownership and purchase-year comparisons under the illustrative uncapped 0.48% property tax. It includes a local terminal demo; the web interface belongs to Phase 3.

## Try it now

Run from the repository directory with Node 22.14.0 (recorded in `.node-version`) or a compatible newer release. Dependencies are pinned in `package-lock.json`:

```sh
npm ci
npm run compare -- --value 300000 --bill 1800
```

Amounts in this command are **pounds**. The example returns current Council Tax **£1,800**, scenario **£1,440**, difference **−£360/year** and **−£30/month**. The CLI converts decimal pounds directly into integer pence without floating-point multiplication.

Try the checked Leicester neighbourhood, or include purchase tax spread over an explicit ownership period:

```sh
npm run compare -- --area E02002830
npm run compare -- --area E02002830 --mode annualised-ownership --years 20 --buyer standard
```

Try a first-time-buyer scenario or a personal bill for an unavailable area:

```sh
npm run compare -- --value 400000 --bill 1800 --mode purchase-year --buyer first-time-buyer
npm run compare -- --area E02000927 --bill 1800
```

The second example preserves the original area's unavailable status and labels the result as a personal comparison. Without `--bill`, that area still returns unavailable. Re-run without overrides to reset to the original area estimate.

`--help` explains scope. `--json` returns the complete result and source provenance. For machine consumers without npm's progress output, run `node .build/domain/scripts/domain/compare.js ... --json` after `npm run build:domain`. Failed or unavailable comparisons exit with code 1; successful comparisons exit with code 0. The demo neither serves a website nor updates release data.

Buyer presets explicitly assume UK-resident individuals, a single residential main home, no additional-property surcharge or special transaction/relief, and a freehold purchase. The first-time preset additionally assumes every purchaser satisfies HMRC eligibility. They illustrate those assumptions; they do not establish an individual's eligibility. The [SDLT rule contract](sdlt-rules.md) describes the scope, official sources and exclusions.

## Public API

Import the exports in [`src/lib/domain/tax/index.ts`](../src/lib/domain/tax/index.ts). The domain has no network, filesystem, clock or Node dependencies. Both browser-only and Node TypeScript configurations are checked.

| Function | Purpose |
| --- | --- |
| `compareArea(area, options, policy?)` | Validate a Phase 1 record, retain its sources, apply explicit personal overrides and calculate. Use this for all area selections in Phase 3. |
| `compareTaxes(input, policy?)` | Calculate from explicit validated numbers and caller-supplied provenance. Useful for standalone personal inputs and independent fixtures. |
| `calculateCouncilTax(input)` | Derive the exact gross baseline from eight band counts and the authority's full Band D charge. |
| `calculateSdlt(valuePence, buyer, ruleVersion)` | Calculate the supported England purchase liability and expose each marginal band. |

The higher-level functions accept unknown input and return `available`, `unavailable` or `invalid-input`. Failed comparisons have reasons, field-specific issues and official guidance links for unsupported SDLT cases; they have no numeric comparison or neutral map classification. Low-level rational arithmetic functions expect valid arithmetic operands and throw on an invalid denominator.

`compareTaxes` requires input schema `1.0.0`, policy `illustrative-ppt:1.0.0`, an explicit mode, jurisdiction `England`, residence scope `primary-residence`, value, annual bill and provenance. Values use non-negative **safe integer pence**; a weighted Council Tax baseline may instead use a reduced or reducible `{ numerator, denominator }` pair of integers or canonical integer strings. `null` means unavailable. Negative, fractional-number, unsafe, non-finite and coercible string monetary values are rejected. Personal overrides accept integer pence only.

`annualised-ownership` requires a positive whole-number `ownershipYears`. Both purchase modes require an explicit supported buyer and `sdlt-england-2025-04-01-v1`. No date-based or “latest” fallback exists. Valid purchase inputs supplied in ongoing-owner mode are checked but do not add purchase tax; the CLI rejects irrelevant buyer/year switches to keep its commands unambiguous.

`compareArea` additionally requires data version `sample-2026-09-26-v1` and area schema `1.0.0`. The caller must load the requested immutable release and verify artifact hashes. The CLI does this for `areas.json` and `policy.json`, checks manifest/data/policy/methodology consistency, and passes the bundled policy to the engine. A changed rate, cap, replacement assumption or extra policy field cannot masquerade as the pinned policy.

The Phase 1 manifest remains unchanged, including its null SDLT version: its area data did not depend on SDLT. Phase 2 adds a separately pinned rule layer. Purchase results record both the original data release and the explicit SDLT version. A future application release must declare this combination in its own release configuration.

## Arithmetic and results

All intermediate calculations use reduced BigInt fractions. Public results serialize those integers as strings, so JSON does not lose precision. A money amount exposes `exactPence`, `roundedPence`, whole-pound `displayPounds` and two-decimal `displayPrecise`.

With value V, weighted annual Council Tax C, statutory payable SDLT S and ownership years Y:

| Mode | Current | Scenario | Result basis |
| --- | --- | --- | --- |
| Ongoing owner | C | V × 48 / 10,000 | Annual |
| Annualised ownership | C + S / Y | V × 48 / 10,000 | Annual |
| Purchase year | C + S | V × 48 / 10,000 | First-year cash cost |

Difference is scenario minus current; positive means higher cost. Annual modes divide the **unrounded** difference by 12 for a monthly equivalent. Purchase-year results have `monthlyEquivalent: null` and a first-year cash-cost warning. Percentage difference is `difference / current × 100`, or null when current is zero.

Money displays round halves away from zero, independently from the exact amount for each display precision. Zero has no sign. The classification uses exact values: `lower` below −£100, `near-zero` from −£100 through +£100 inclusive, and `higher` above +£100. Classification contains its basis and threshold: in purchase-year mode this is explicitly a **first-year** £100 threshold. A future map legend must use that basis, never describe a purchase-year result as recurring savings. Monthly and percentage presentation do not recalculate the class.

Council Tax uses exact band ratios of 6, 7, 8, 9, 11, 13, 15 and 18 ninths of Band D, weighted by stock counts and divided by the **sum of the eight band counts**. The independently published total is a reconciliation check with the agreed inclusive 45-dwelling tolerance. Unknown, missing and suppressed stock is never zero-filled; an explicit published zero remains zero. A missing charge, missing total, non-positive stock sum, excessive reconciliation difference or unresolved geography prevents a baseline. Negative/unsafe malformed counts are input errors.

SDLT has a different statutory rounding boundary: exact marginal taxes are summed, then payable SDLT is rounded **down to whole pounds before annualisation**. See the official source explanation and threshold fixtures in the [SDLT contract](sdlt-rules.md). First-time-buyer consideration above £500,000 returns unavailable for that profile; the engine never silently changes the buyer selection.

## Area availability and personal inputs

Results preserve data/methodology/policy/rule/engine versions, original area identity and availability, source periods and references, quality flags, input-source labels and scenario assumptions. Returned provenance is detached from the caller's record.

The area adapter verifies any retained baseline against its raw stock and charge inputs, including a baseline on a price-unavailable row. Retained prices and baselines require matching source references. Each missing dependency must be replaced: a value override cannot repair missing stock, and a bill override cannot repair a missing price. Unknown quality reasons remain unavailable even with both overrides. Unsupported policy or purchase cases remain unsupported.

A personal comparison never mutates its area record. Phase 3 must keep original area calculations for map colours, call `compareArea` for the selected-home result, label any override, and reset by recalculating without overrides. `compareTaxes` alone does not authenticate source files or determine which area dependencies an override replaces; pass area-derived inputs through `compareArea`.

## Verification

```sh
npm run check
npm test
.venv/bin/python -m pipeline verify-release
```

Tests compare independent Phase 0 and official SDLT examples, threshold-adjacent pennies, first-time eligibility, invalid inputs, source markers, exact fractions, statutory/display rounding, classification and provenance. Integration checks exercise all 203 areas in all three standard modes, all 107 personal-bill repairs and reset behaviour. CLI checks cover executable examples and corrupted or inconsistent release metadata/policy.

The test compiler writes only `.build/domain/`; `scripts/domain/build.mjs` clears that generated directory before compiling. Published Phase 1 files and their source archive remain immutable. Acceptance results are in [Phase 2 findings](phase2-findings.md).
