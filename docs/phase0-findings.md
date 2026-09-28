# Phase 0 findings

Completed 6 September 2026. The calculation contract and five real examples are ready for the sample pipeline. This closes P0.1–P0.5 with explicit source limitations; it does not establish readiness for an England-wide publication.

## Deliverables

- [Methodology](methodology.md): definitions, units, exact arithmetic, missing-data rules, geographic joins and a manually reconciled example.
- [Source manifest](../data/source-manifest.json): 13 downloaded files with SHA-256 checksums, exact URLs, periods, field selections and reuse requirements.
- [Policy configuration](../data/policies/illustrative-ppt-v1.json): versioned uncapped 0.48% illustration.
- [Sample selection](../data/fixtures/phase0-sample-areas.json), [worked examples](../data/fixtures/phase0-worked-examples.json) and [validation report](evidence/phase0-validation.json).
- [Reproducible audit](../scripts/phase0/README.md), with pinned reading dependency. The production pipeline is still Phase 1 work.

## Verified joins and coverage

All 6,856 English MSOA identifiers match across ONS prices, VOA stock, the official parent lookup and the downloaded boundaries. All map to a 2026–27 billing-authority charge. The England LAD boundary and billing inventories both contain 296 codes.

The tax workbook uses column **B** for GSS codes and **AL** for the full area Band D charge. Column A's “E-code” is a different identifier. Column Z alone omits major precepts.

The audit found 3,843 English MSOAs with an unexplained dash in at least one band count. In response to the decision question, the user chose **“Show unavailable for now”**. No council-wide fallback will be inserted into these MSOA results. There are 3,013 MSOAs with complete numeric bands, subject to other quality checks.

## Five sample authorities

| Authority | GSS code | MSOAs | Numeric bands | Unverified-marker areas | Purpose |
| --- | --- | ---: | ---: | ---: | --- |
| Leicester | E06000016 | 38 | 3 | 35 | Urban unitary; independently checked charge components |
| Wandsworth | E09000032 | 38 | 25 | 13 | London; high property values and low Council Tax |
| Burnley | E07000117 | 12 | 2 | 10 | Lower values; two-tier Council Tax and local precepts |
| Cumberland | E06000063 | 33 | 5 | 28 | 2023 reorganisation; urban/rural mix |
| North Yorkshire | E06000065 | 77 | 56 | 21 | Rural areas, parishes and 2023 reorganisation |
| **Total** | | **198** | **91** | **107** | Includes working and unavailable journeys |

Keep all 198 areas in the sample inventory so missing-data behaviour can be tested. The five worked examples are deliberately selected from complete records; they are not a random or nationally representative sample.

## Worked comparisons

All are ongoing-owner comparisons at the uncapped illustrative rate. Values below are rounded to pennies after the calculation; source-cell references and exact fractions are in the fixtures.

| MSOA | Median price | Estimated gross Council Tax | Scenario | Annual change |
| --- | ---: | ---: | ---: | ---: |
| Leicester 004 — E02002830 | £246,000 | £1,994.78 | £1,180.80 | −£813.98 |
| Wandsworth 001 — E02000923 | £800,000 | £1,274.13 | £3,840.00 | +£2,565.87 |
| Burnley 004 — E02005179 | £105,000 | £1,865.67 | £504.00 | −£1,361.67 |
| Allerdale 003, now Cumberland — E02003967 | £210,000 | £2,084.11 | £1,008.00 | −£1,076.11 |
| Craven 001, now North Yorkshire — E02005742 | £306,500 | £2,541.48 | £1,471.20 | −£1,070.28 |

## Limitations carried forward

| Finding | Treatment now | Follow-up |
| --- | --- | --- |
| VOA CSV has `-`; inspected guidance describes `[c]` | Preserve raw marker and show unavailable, as the user chose | Verify meaning from corrected official documentation or clarification before changing the rule |
| Stock counts are rounded independently | Use band-sum denominator and a 45-dwelling single-area reconciliation bound | Apply compatible aggregation checks in Phase 1; do not compare incompatible VOA geography methods |
| Stock and prices have different observation dates and populations | Show each source period and describe the area proxy | Reassess on each data refresh |
| Authority average contains local precepts but not exact MSOA/parish bills | Explicit authority-average-charge flag | Later parish-specific charging or actual-bill input can improve precision |
| Barnsley/Sheffield stock authority codes precede the 2025 boundary change | Join MSOAs by official current lookup; retain boundary-change flag | Review old-versus-new LAD stock totals before publishing these LAD results |
| Stroud 001 (`E02004651`) maps to Gloucester in the current best-fit lookup | Mark MSOA geography as needing review; withhold its tax estimate | Resolve cross-boundary charge treatment before national coverage |
| VOA bungalows form a separate category from houses | All-properties only in the initial contract | Verify category compatibility before property-type controls |
| Postcode source not yet downloaded/pinned | No postcode-coverage claim | Select compatible archive and validate coordinates/status in P1.4 |
| Boundary IDs/polygon presence verified; detailed topology not tested | Suitable for sample contract and fixture preparation | Validate topology and map rendering in Phase 1 |

No further user decision is needed to begin Phase 1 under this contract. The next work is the sample import/validation pipeline using these sources and fixtures.
