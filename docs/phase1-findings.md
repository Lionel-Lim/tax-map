# Phase 1 findings

Completed 26 September 2026. **P1.1–P1.5 are complete.** Release
`sample-2026-09-26-v1` supplies validated inputs for the Phase 2 calculation engine
and Phase 3 application. This is an internal validation dataset; the interactive
application and public England release remain later work.

## Delivered

| Task | Deliverable | Evidence |
| --- | --- | --- |
| P1.1 | Python 3.12.14, pinned dependencies, offline build and independent source archive | 17 files, 334,505,129 original bytes; source/member hashes and manifest snapshots verified |
| P1.2 | Prices, stock and full charges with raw markers, integer pence and source references | Five existing MSOA worked examples pass; no suppression marker converted to zero |
| P1.3 | 198 MSOA and five independent LAD records; joins and reconciliation | 91 available MSOAs, 107 unavailable MSOAs, five available LADs; independent Leicester LAD fixture |
| P1.4 | WGS84 boundaries, name/code search and national minimal postcode shards | 203 valid features retaining all 226 polygon components; 2,714,963 postcodes in 3,121 shards |
| P1.5 | Immutable release, artifact manifest and validation report | 50 passing tests; clean offline rebuild reproduced all 6,251 release files exactly |

The [active pointer](../static/data/manifest.json) selects the
[release manifest](../static/data/sample-2026-09-26-v1/manifest.json). It records
source periods, policy/methodology versions, geography vintages,
code/configuration hashes, and every artifact's size and SHA-256. Rational
Council Tax baselines retain precision for the later browser engine.

## Coverage

| Authority | MSOAs | Available | Unavailable | LAD result |
| --- | ---: | ---: | ---: | --- |
| Leicester | 38 | 3 | 35 | Available |
| Wandsworth | 38 | 25 | 13 | Available |
| Burnley | 12 | 2 | 10 | Available |
| Cumberland | 33 | 5 | 28 | Available |
| North Yorkshire | 77 | 56 | 21 | Available |
| **Total** | **198** | **91** | **107** | **5 available** |

The 107 unavailable areas retain the agreed `stock-marker-unverified` reason;
there is no council fallback. Postcode evidence found no additional sample
geography conflict. All 198 sample MSOAs have current postcode records: 49,074
current and 21,556 terminated records in total. Of the current sample postcodes,
26,355 map to available area estimates. This measures input coverage, not a
completed browser journey or household coverage.

The national lookup preserves country, current/terminated status, coordinates
and original geography codes. Unknown means absent from the May 2025 edition;
postcodes introduced later cannot be recognized. The build keeps 24,086 missing
locations as null and reports 786 current English records without an MSOA.

## Findings and treatment

- **Boundary CRS correction:** the original MSOA file uses British National Grid
  (`EPSG:27700`). The earlier manifest label was incorrect. The source bytes are
  unchanged; Phase 1 converts to WGS84 deterministically. All geometry and shared
  edges pass validation, without repairs or island deletion. See
  [boundary validation](boundary-validation.md).
- **Independent LAD checks:** explicit `geography=LAUA` filters avoid other stock
  geographies. All five sample band totals and compatible published-total checks
  pass. The separately transcribed Leicester LAD baseline is exactly
  `12538301125/65412` pence, displayed as £1,916.82. See
  [LAD validation](lad-validation.md).
- **Postcode vintage exceptions:** the source retains old Barnsley and Sheffield
  codes for 6,864 and 11,807 current postcodes. These are recorded separately,
  without relabelling them onto changed boundaries. Unexpected non-empty English
  geography keys fail validation. With compatible codes, 39 national MSOAs have
  multiple authority assignments and 40 have an official-parent conflict; all
  are outside the sample and need review before national estimates. See
  [postcode data](postcode-data.md).
- **Source recovery:** `data/archive/` preserves exact source and metadata bytes
  independently of `data/raw/`. The recovery check started with no raw cache,
  restored all 17 sources and rebuilt identical content without downloads. This
  is durable local preservation; off-machine backup is not configured. Retain
  the archive when moving or removing the workspace.
- **Publication constraints:** ONS identifies separate Northern Ireland postcode
  reuse terms. The licence is pinned and outputs declare `publicReleaseReady:
  false`. Resolve redistribution rights and the planned usable-coverage decision
  before publication. Hosting has not been provisioned.

## Verification and sizes

- [Validation report](evidence/phase1-validation.json): joins, markers,
  reconciliation, exceptions, missing locations, outliers and topology.
- [Test evidence](evidence/phase1-tests.json): 50 tests; zero failures/errors/skips.
- [Reproduction evidence](evidence/phase1-reproducibility.json): 17 restored
  sources, zero upstream requests, 6,251 byte-identical files including the manifest.
- [Pipeline instructions](../pipeline/README.md): setup, build, archive retrieval,
  verification and immutable versioning.

Area statistics occupy 333,804 bytes; search data 37,461 bytes. Boundaries total
233,441 bytes (approximately 63 KB compressed). The postcode index is 859,152
bytes; national shards total 241,936,570 JSON bytes or 27,211,902 gzip bytes.
Fetch only the requested outward-code shard; the largest JSON shard is 331,030
bytes. Browser performance and serving compression remain app/hosting checks.
Raw ZIPs, CSVs and workbooks are absent from browser output.

## Next step

Begin Phase 2 with the pure TypeScript policy/input/result contract and
ongoing-owner engine, using the generated inputs and independent fixtures.
The sample still defaults to ongoing owner; SDLT modes and the interactive map
follow the saved plan. No further product decision is needed to begin Phase 2.
