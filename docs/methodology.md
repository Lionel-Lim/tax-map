# Calculation and data contract

Version: `phase0-v1`, 6 September 2026. Applies to the first working sample. Changes to definitions, source editions or missing-data handling require a new methodology/data version and regenerated fixtures.

## What the result means

**Typical Home Impact** compares a tax scenario on an area's median sale price with a gross Council Tax estimate based on its property stock. It describes a representative-area comparison, not the bill for a particular address or the aggregate effect on an area's residents.

The first scenario is **Illustrative 0.48% property tax — uncapped**. It assumes an annual levy on the selected value replacing Council Tax for a primary residence. Purchase comparisons later assume abolition of SDLT for the supported primary-residence purchase. The policy configuration is in [illustrative-ppt-v1.json](../data/policies/illustrative-ppt-v1.json).

This is a deliberately limited scenario informed by [Fairer Share's proposed rate](https://fairershare.org.uk/proportional-property-tax/). Transition caps, deferral, second-home rules and changes in owner/occupier liability are not modelled. Do not present the scenario as a complete implementation of that proposal or an enacted tax.

## Pinned inputs

Exact download URLs, byte sizes, SHA-256 checksums, archive member checksums and field selections are recorded in [source-manifest.json](../data/source-manifest.json). The audit reads local copies without modifying the original files.

| Input | Edition and field | Use |
| --- | --- | --- |
| MSOA price | ONS year ending September 2025; `1a`, header row 3, code C, parent code A, price DT | All-property rolling annual median sale price in GBP |
| LAD price | Matching ONS administrative-geography edition; `2a`, code C, price DT | Independently published authority median for the overview |
| Stock | VOA CTSOP1.1, stock at 31 March 2025, published in the May 2026 update | `geography=MSOA`, `ecode`, `band_a` through `band_h` and `all_properties` |
| Annual charge | MHCLG 2026–27 Table 10, `Data_Billing`, GSS code B, total-area Band D AL | Full annual Band D area charge including local and major precepts |
| Parent lookup | ONS MSOA 2021 → Ward/LAD May 2025, V3 | `MSOA21CD` → `LAD25CD` |
| Boundaries | MSOA 2021 BSC V3 and LAD May 2025 BSC V2 | GSS identifiers, polygons and display geography |

The price period is **1 October 2024–30 September 2025**. The stock snapshot is **31 March 2025**. The tax year is **1 April 2026–31 March 2027**. Show these separately; the calculation does not revalue the price median to 2026 or claim simultaneous observation of all inputs.

Use the source's published sale-price median as the value proxy. Do not infer a current valuation for every home from it. Sales and housing stock have different populations. Property-type calculations remain gated on compatible definitions; the VOA file separately groups bungalows, so matching a “detached” label alone is insufficient.

## Geography and joins

Join by GSS codes only. The price, stock, MSOA boundary and lookup files each contain the same 7,264 England/Wales MSOAs, including **6,856 in England**. The 296 English LAD boundary codes match the 2026–27 billing-authority codes. All English price records join to a current authority and a charge.

Use the pinned official parent lookup. Neither readable names nor the preceding authority row in the VOA CSV is a parent-key substitute. MSOA names such as “Allerdale 003” can persist after their authority changes.

Observed VOA row groups differ from the current parent lookup for 101 English MSOAs: 30 in Barnsley, 70 in Sheffield and `E02004651` (Stroud 001, assigned to Gloucester by the current best-fit lookup). Barnsley and Sheffield changed codes following a 2025 boundary change. Preserve these differences in the [audit report](evidence/phase0-validation.json). Do not rename old LAD stock totals into new boundary definitions without checking them.

The lookup is a best-fit allocation, not proof that each MSOA is entirely within one current billing authority. Flag known cross-boundary cases such as `E02004651` as `geography-needs-review` and withhold their MSOA tax estimate until the allocation/charge treatment is documented. For Barnsley and Sheffield, current MSOA-to-LAD joins can be used as area-charge proxies with a boundary-change flag; the two LAD stock totals require review before a LAD result is published. These cases are outside the five selected sample authorities.

Use independent LAD price and stock inputs for LAD results. Never average MSOA medians, multiply a median by dwelling count to estimate total housing wealth, or sum typical-home changes to estimate revenue.

Phase 1 implementation notes (26 September 2026): the original MSOA boundary file declares British National Grid (`EPSG:27700`), despite the earlier manifest label. The source bytes are unchanged; the corrected manifest and [boundary validation](boundary-validation.md) describe the deterministic WGS84 conversion and topology checks. Display polygons do not assign postcodes to tax authorities.

The pinned May 2025 V2 ONS Postcode Directory supplies postcode country, current/terminated status, coordinates, MSOA 2021 and its original authority assignments (`sourceLad`). Despite its edition date, this file retains older Barnsley `E08000016` and Sheffield `E08000019` codes. These two known vintage exceptions are inventoried separately and are not silently relabelled or counted as proof of a physical cross-authority MSOA. Unexpected non-empty English geography keys fail validation.

For compatible authority codes, the sample pipeline inventories current postcode assignments that disagree with the official best-fit MSOA parent. Affected sample MSOAs follow the existing `geography-needs-review` rule and have no tax estimate; their source values and each conflict remain in the validation report. This extends the evidence behind the existing rule without changing the calculation or substituting a parent estimate. See [postcode data](postcode-data.md) for coverage, unsupported locations and reuse restrictions, and [LAD validation](lad-validation.md) for the independently checked council baseline.

## Gross Council Tax baseline

For each eligible MSOA, let `nA…nH` be its published rounded band counts and `D` the total-area Band D charge from `Data_Billing!AL`.

```text
band ratios = A 6/9, B 7/9, C 8/9, D 9/9,
              E 11/9, F 13/9, G 15/9, H 18/9

N = nA + nB + nC + nD + nE + nF + nG + nH
W = 6nA + 7nB + 8nC + 9nD + 11nE + 13nF + 15nG + 18nH
estimated annual Council Tax = D × W / (9 × N)
```

The band ratios are documented by [Leicester City Council](https://www.leicester.gov.uk/council-tax/further-council-tax-information-and-notes). The full charge includes precepts. Do not use column Z alone, which contains the billing authority's amount with local precepts; AL adds the major precepts as well. Do not add the Adult Social Care precept twice.

This baseline applies an **authority-average charge** to the MSOA's band distribution. It retains local/parish charges through that authority average but does not recover each parish's exact bill. Label it “Estimated gross Council Tax using the authority-average charge.” Numeric source precision does not make it an exact local bill.

Use `N`, the sum of the included band counts, as the weighting denominator. Keep the separately rounded published `all_properties` total for reconciliation; substituting it as the denominator can make the weights fail to sum to one. Do not alter counts to force a match.

The model excludes individual discounts, exemptions, premiums, collection rates and Council Tax support. It does not infer a property's tax band from today's value. A later entered annual bill can replace the estimate for the selected-home result and must be labelled as user-provided.

## Availability, suppression and quality rules

**User decision, 6 September 2026:** show unavailable where the VOA file contains an unexplained “-”; do not use a council-wide fallback for the first sample.

| Condition | Required behaviour |
| --- | --- |
| Positive numeric ONS price | Eligible value input; retain source period and cell |
| ONS `[x]`, blank or missing price | `price-unavailable`; no numeric comparison |
| VOA numeric zero | Preserve as zero |
| VOA numeric band count | Require a non-negative integer; retain the published value |
| VOA `-` | `stock-marker-unverified`; preserve marker and withhold the result |
| VOA `[c]`, if encountered | `stock-suppressed`; do not substitute zero or an arbitrary midpoint |
| VOA `..` for band I in England | Not applicable; band I is excluded from the English contract |
| Any other unexpected required-cell symbol | `source-value-unrecognised`; stop or quarantine the affected record |
| Missing band, missing charge, non-positive band-count sum | Explicit unavailable result |
| Duplicate code, conflicting lookup, missing geometry | Fail source validation before publishing |
| Known unresolved non-nesting geography | `geography-needs-review`; no MSOA tax estimate |

The current CSV contains **5,319 dash cells across 3,843 English MSOAs**. The inspected HTML guidance describes `[c]`, while the attached CSV notes do not define the dash. Do not assume they mean the same thing. Preserve the mismatch as an unresolved source issue. The remaining **3,013 MSOAs** have numeric A–H counts; that is an input-completeness count, not a statement that all 3,013 are release-ready.

For an unsuppressed MSOA, allow an absolute difference of at most **45 dwellings** between the sum of eight independently rounded bands and the independently rounded total: up to 5 per rounded band plus 5 for the total. This is a conservative rounding bound, not a statistical confidence interval. The largest observed difference among numeric English records is 30. Investigate any excess rather than widening the tolerance automatically.

For same-method, same-vintage aggregated checks, use `5 × (number of summed published cells + 1)` as the conservative rounding bound. Do not use it to excuse geography changes or unmatched records. Compare VOA postcode-derived tables with compatible postcode-derived totals, and report unmatched records separately. [VOA explains its two geography assignment methods](https://www.gov.uk/government/statistics/council-tax-stock-of-properties-2025/background-information).

ONS withholds medians when fewer than five relevant sales exist, as stated in the workbook cover. A numeric median meets that publication rule but does not imply high confidence. No transaction-count field was imported into this contract. Do not invent a count or a confidence score. Keep `transactionCount` unavailable until a compatible count source is validated.

## Comparison and rounding

```text
P = property value × 48 / 10,000
Ongoing owner: current = estimated annual Council Tax
Annual change = P − current
Monthly equivalent = annual change / 12
```

Higher positive values mean greater estimated cost; negative values mean lower cost. Store source money in integer pence. Use exact fractions or decimal arithmetic for weights, rates and intermediate results. The audit uses rational arithmetic; do not prematurely round individual derived band rates.

Convert published numeric currency fields to pence using half-up rounding, removing spreadsheet serialization artefacts such as `2511.3200000000002`. Round final breakdowns to pennies, and primary display values to whole pounds, with exact halves away from zero. Calculate monthly equivalents from the unrounded annual result. Normalise rounded negative zero.

The map's initial near-zero class is **−£100 through +£100 per year, inclusive**. This is a visual threshold only. Keep the sign and actual value in the result panel. Monthly mode uses the equivalent annual classification. An unavailable record has its own style and is never assigned to the neutral class. Percentage display is `change/current × 100`; it is unavailable when current is zero.

For M2, retain the three comparison modes in the implementation plan:

```text
S = SDLT on the selected value under a versioned, supported buyer profile
Y = positive whole-number ownership period, default 20
Annualised ownership: current = Council Tax + S/Y
Purchase year: current = Council Tax + S
Scenario side: P, under this scenario's explicit tax-replacement assumptions
```

Annualisation is a simple allocation of purchase tax, excluding growth, future changes, financing and discounting. Purchase-year results describe first-year cash cost and must not use a recurring monthly label. Pin effective-date SDLT rules and independently test thresholds in Phase 2. Unsupported purchase cases remain unavailable.

## Worked real example: Leicester 004

MSOA `E02002830`, readable name **Bradgate Heights & Beaumont Leys**, current authority Leicester `E06000016`. The lookup and actual MSOA polygon match the same code.

| Input | Source location | Value |
| --- | --- | ---: |
| Median sale price, all properties | ONS MSOA price workbook `1a!DT350` | £246,000 |
| Stock counts | CTSOP1.1 CSV row 11851, counting header as row 1 | A 2,570; B 820; C 460; D 140; E 210; F 180; G 30; H 10 |
| Published total stock | Same CSV row, `all_properties` | 4,410 |
| Band-count sum | Sum of A–H | 4,420 |
| Full area Band D charge | Council Tax workbook `Data_Billing!AL149` | £2,528.75 |

The charge independently reconciles to £2,121.87 council + £315.23 police + £91.65 fire = £2,528.75. These component figures also appear on the [council's explanatory page](https://www.leicester.gov.uk/council-tax/further-council-tax-information-and-notes).

```text
W = 2,570×6 + 820×7 + 460×8 + 140×9
    + 210×11 + 180×13 + 30×15 + 10×18 = 31,380

Council Tax estimate = £2,528.75 × 31,380 / (9 × 4,420)
                     = £311,185 / 156 = £1,994.775641…
Scenario             = £246,000 × 0.0048 = £1,180.80
Annual change        = −£813.975641… → −£813.98
Monthly equivalent  = −£67.831303… → −£67.83
```

The 10-dwelling reconciliation difference is within the rounding bound. The primary result would say **“Estimated £814 less per year”**, with the area estimate, source periods and uncapped scenario visible.

Four additional real examples, including a higher-cost result, are retained with their source references in [phase0-worked-examples.json](../data/fixtures/phase0-worked-examples.json). [Synthetic contract examples](../data/fixtures/phase0-synthetic-examples.json) cover signs, zero difference and unavailable cases for later engine tests.

## Reuse and versioning

Display ONS/VOA/MHCLG source credits and OGL links. Include the OS copyright and database-right notice when displaying boundaries, using the boundary data year recorded in the manifest. The [ONS licence guidance](https://www.ons.gov.uk/methodology/geography/licences) supplies the required wording. Logos are excluded from these reuse permissions.

A source file changing at the same URL is a new input: the audit must reject its hash until it is explicitly reviewed and repinned. Keep policy, methodology, source data and schema versions separate. Preserve source-cell references in fixtures. A data refresh must produce a coherent bundle and rerun the checks.

Phase 1 supplies the postcode archive, sample boundary validation and browser data artifacts. The application and comparison engine remain later work. Neither the Phase 0 audit nor the Phase 1 sample is a production England release; the sample's manifest explicitly records that public release readiness is false.
