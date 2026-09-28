# England coverage expansion

Delivered 26 September 2026, following the request to add all supported locations in England. The application now defaults to `england-2026-09-26-v1`. This is an internal preview; the remaining production and publication tasks in Phase 4 are still open.

## Coverage

| Geography | Available estimate | Explicitly unavailable | Complete inventory |
| --- | ---: | ---: | ---: |
| Council (LAD May 2025) | 293 | 3 | 296 |
| Neighbourhood (MSOA 2021) | 2,961 | 3,895 | 6,856 |

All 7,152 records remain searchable. Council estimates use their own published inputs. An unavailable neighbourhood never inherits its council's estimate.

Barnsley and Sheffield lack compatible current-boundary stock inputs; City of London's stock includes an unverified marker. At neighbourhood level, 3,843 records have unverified stock markers, 140 need geography review and six have invalid boundaries. These reasons overlap. The geography review includes changed Barnsley/Sheffield boundaries and conflicting postcode/authority assignments. Gloucester and Stroud have known best-fit aggregation differences; source-native stock groups reconcile separately, while independently published council totals remain usable.

Six source polygons fail geometry or shared-edge validation: `E02000291`, `E02000292`, `E02001686`, `E02004039`, `E02004043` and `E02004524`. Their records remain visible as unavailable and their shapes are withheld. No geometry repair or zero substitution has been applied.

Available neighbourhoods contain 11,312,860 of 25,750,060 dwellings in rounded published VOA totals (43.93%). These figures describe coverage, not the share of households benefiting. Council totals omit missing current-vintage Barnsley/Sheffield counts, so they must not be presented as a complete England dwelling denominator.

Of 1,489,907 current English postcodes in the pinned May 2025 directory, 731,066 lead to an available neighbourhood estimate (49.07%). Another 786 have no assigned MSOA. Matched unavailable areas explain their limitations; unknown, terminated and outside-England postcodes retain distinct outcomes. Newer postcodes may be absent from this source edition.

## Application and delivery

- Global name/code search covers the full inventory. Postcodes can select neighbourhoods across England, including Manchester, Birmingham, Bristol, Newcastle, Oxford, Cambridge and York.
- The initial map loads 296 council records, global search metadata and council boundaries. It never loads the 11.76 MB complete statistics audit or complete MSOA geometry on landing.
- Neighbourhood statistics and boundaries load by council, with cached requests, explicit loading states and retry after failure. Panning can load the council at the map centre without changing the selected result.
- The map limits overview labels to seven spaced labels. Source gaps remain visibly unavailable. Search and the result panel remain usable without WebGL.
- Shared links explicitly pin data, policy and tax-rule versions. The original `sample-2026-09-26-v1` remains unchanged; its links show an archived-sample notice and an explicit link to England coverage.
- The source page is prerendered and includes national and per-council coverage, boundary exclusions and credits even without JavaScript.

The existing three comparison modes, exact arithmetic, buyer assumptions and personal-input rules are retained. Source editions are unchanged: prices for the year ending September 2025, stock at March 2025, Council Tax for 2026–27, and the May 2025 postcode directory. All-property estimates are the only supported property type.

Council boundaries are 948,203 bytes raw (303,588 gzip). District boundary shards have a median raw size of 13,011 bytes and a maximum of 107,838 bytes. These measured GeoJSON shards provide the current internal detail delivery; PMTiles and hosted byte-range testing remain part of production preparation.

## Verification

All 238 tests pass: 66 Python, 99 domain, 32 data/state and 41 browser checks. Type/Svelte checks report no errors or warnings, and the static build passes. The application integration loads all 296 district shards and evaluates all 7,152 records in all three standard comparison modes (21,456 results), checking availability and provenance. Final desktop and 390-pixel mobile visual checks found no console errors or horizontal overflow.

The release verifier checks 6,843 artifacts. A second build from retained sources reproduced all 6,844 release files, including the manifest, byte-for-byte. This demonstrates deterministic retained-source reconstruction, not a new clean-cache recovery test. The original sample manifest and historical Phase 1/2 evidence remain unchanged.

Browser, static-build, visual and measured performance results are recorded in the application acceptance evidence below. Mobile timings are local Chromium measurements with a 390×844 viewport and 4× CPU slowdown; they do not establish hosted or physical-device latency.

The measured England overview transferred 2.08 MB (5.53 MB decoded) and became usable in 4.30 seconds. A Manchester postcode lookup added 0.37 MB (1.16 MB decoded), including the postcode index, outward-code file and one council's statistics/boundaries, in 1.55 seconds. Changing comparison mode took 0.65 seconds. The enforced England budgets are 6 MB decoded for the overview, 1.3 MB for detail, and 20/8/3 seconds for overview/lookup/scenario changes. The original sample keeps its lower 4.5 MB overview budget.

- [Data validation and coverage](evidence/england-validation.json)
- [Deterministic rebuild](evidence/england-reproducibility.json)
- [Application acceptance](evidence/england-application-validation.json)
- [Mobile delivery measurements](evidence/england-performance.json)
- [Pipeline instructions](../pipeline/README.md)

## Remaining release work

No public deployment or paid service was provisioned. Usable coverage needs a publication decision, postcode reuse terms need clearance, and hosting, caching, CI, staged rollback and production performance checks remain in the implementation plan. The missing-input and invalid-boundary records need source review before their estimates can become available.
