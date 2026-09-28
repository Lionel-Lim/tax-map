# Phase 2 findings

Completed 26 September 2026. P2.1–P2.5 are complete. The shared calculation engine and a terminal demo are usable; the interactive map is the next phase.

## Delivered

| Plan item | Delivered evidence |
| --- | --- |
| P2.1 | Strict TypeScript input/result contracts, runtime validation, explicit versions, immutable policy semantics and browser-compatible domain code. |
| P2.2 | Exact weighted Council Tax, ongoing-owner comparison, annual/monthly/percentage displays, signed change, inclusive ±£100 classification, missing-data handling and source provenance. |
| P2.3 | Dated standard and first-time-buyer SDLT rules, marginal-band breakdowns, annualised ownership and first-year cash comparisons. |
| P2.4 | Explicit rejection of invalid money/years/schema, unsupported policy/rule versions and unsupported buyer/transaction scope. Failures expose official guidance URLs for the Phase 3 interface. |
| P2.5 | Independent worked-example, official-tax-example, threshold, eligibility, rounding, zero-baseline, rate-regression and integration tests. |

Code is in [`src/lib/domain/tax/`](../src/lib/domain/tax/index.ts). The [usage and integration guide](phase2-engine.md) explains APIs, units, commands and display rules. The [SDLT contract](sdlt-rules.md) records the official references and reviewed scope.

## Acceptance evidence

`npm run check` passes strict Node and browser configurations. `npm test` passes **97 tests**, with no failures or skips. The [machine-readable validation record](evidence/phase2-validation.json) identifies the toolchain, versions and implementation hashes.

Coverage includes:

- All five independently checked Phase 0 neighbourhood comparisons, the independent Leicester council baseline, and the synthetic examples.
- Both official SDLT examples, pennies below/at/above every standard threshold and both first-time thresholds, statutory whole-pound rounding, and explicit rejection above the first-time relief limit.
- Exact 0.48% arithmetic, annualisation fractions, no rounding before monthly conversion or classification, signed zero, and a null percentage when the current cost is zero.
- All **203** Phase 1 areas in each of the three standard modes: **96 available** (91 neighbourhoods and five councils), **107 unavailable**.
- All 107 unavailable areas becoming separate personal comparisons when a valid bill replaces the missing baseline. Original availability, map inputs and source records remain unchanged; resetting restores unavailable results.
- Incomplete overrides, malformed enum values, unsupported scope, mismatched baselines, absent source references and inconsistent release/policy metadata failing explicitly.
- JSON-safe results with detached source provenance; the CLI verifies artifact hashes and version consistency before using area data.

Independent code review identified validation gaps in enum handling, retained baselines on price-unavailable records, source references and release-policy consistency. These were repaired and covered by regression tests before acceptance.

The existing release verifier passed for all **6,250 listed artifacts** (6,251 files including its manifest). The Phase 1 manifest SHA-256 remains `798684c202cde82f6301c67bec36ca85863e591e1157642b131f8d7d32381da6`; all recorded pipeline and configuration hashes still match. No published Phase 1 artifact or original methodology/fixture was rewritten.

## Try it

From the project directory:

```sh
npm run compare -- --value 300000 --bill 1800
```

Expected: **£1,440 scenario cost, £360 less per year and £30 less per month** compared with the entered £1,800 bill. Use `--area E02002830` for the independently checked Leicester neighbourhood. The [guide](phase2-engine.md) has annualised, purchase-year, personal-override and JSON examples.

## Phase 3 handoff

Use `compareArea` for both ordinary area calculations and selected-home overrides; it delegates to the same `compareTaxes` arithmetic. Map colouring must retain each original area result while personal overrides affect only the selected-home panel. Use the returned classification basis, money displays, assumptions and guidance links. Purchase-year results deliberately omit a monthly equivalent.

The Phase 1 manifest still has `sdltRuleVersion: null` because its statistics did not use purchase tax. This engine explicitly combines that unchanged sample with `sdlt-england-2025-04-01-v1`; the application release must record the combination. Its M1 default remains ongoing owner, with the planned M2 annualised/20-year landing default still to be implemented explicitly in the application.

The sample remains **internal validation data**. Unverified stock markers, national expansion, postcode reuse/publication constraints, usable-coverage review and hosting decisions remain as recorded in [Phase 1](phase1-findings.md). This phase does not complete the M1 postcode-to-map journey or deploy a website. Phase 3 can now begin with the static app and the ongoing-owner sample journey; no additional decision is needed to start that work.
