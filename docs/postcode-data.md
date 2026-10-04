# Postcode source and lookup contract

The sample uses the [ONS Postcode Directory, May 2025](https://geoportal.statistics.gov.uk/datasets/3be72478d8454b59bb86ba97b4ee325b/about), including the V2 correction of Northern Ireland latitude/longitude conversion dated 17 June 2025. The pinned ZIP is 245,482,583 bytes, SHA-256 `7a2ca62fbf46389235c228c004be540426789ad7e4f31fc28761326aca10a88e`.

[postcode-source-manifest.json](../data/postcode-source-manifest.json) pins the exact download URL, bytes, archive checksum, checksums for every imported CSV and both user-guide formats, the publisher item metadata, the ONS licence page and the Northern Ireland end-user licence. The build incorporates this manifest into the durable source archive along with the Phase 0 sources. The raw cache and the source archive stay outside the browser release. Use the integrated pipeline command in [README.md](../README.md) for source preservation and rebuilding; sharding has no network dependency.

The upstream source includes current and terminated postcodes across the United Kingdom and Crown Dependencies. The tracked lookup excludes Northern Ireland: 2,651,940 records in 3,039 shards remain. This is a historical edition: “unknown” means absent from this edition, not that a postcode never existed or cannot have been created later. Country and status for retained records come from source fields. BT inputs are excluded by publication policy before lookup, without asserting that a particular postcode exists.

## Geography limitations

The user guide describes May 2025 administrative areas and supplies `msoa21` for the 2021 England/Wales MSOAs. Inspection nevertheless found current postcode records with old Barnsley `E08000016` and Sheffield `E08000019` authority codes. The pinned parent lookup uses new authority codes `E08000038` and `E08000039`. This matches the reorganisation caveat already recorded in the [methodology](methodology.md). The shard column is named `sourceLad`, deliberately preserving the supplied authority code.

The builder requires each non-null current-English MSOA to exist among the English keys of the official parent lookup and each non-null current-English LAD to exist among its English parent values. It rejects unknown codes and cross-country code inconsistencies. The only reviewed vintage exceptions are `E08000016` and `E08000019`; where an MSOA is present, its official parent must be one of the two replacement authorities. These records appear separately in `legacyAuthorityAssignments` with original codes, official parents, counts and example postcodes. They are excluded from the comparison of current LAD assignments. The pipeline does not relabel them or claim they establish the replacement boundaries.

For the remaining current English records, `crossAuthorityMsoas` inventories MSOAs assigned to multiple source LADs, and `parentConflicts` inventories source LAD assignments that conflict with the official MSOA parent. The report retains counts and example postcodes for each assignment. Terminated postcodes do not establish a present-day conflict. A conflicting sample MSOA, a sample MSOA with missing current LAD, a legacy sample assignment, or a sample MSOA with no current postcodes is passed to the statistics pipeline as `sampleGeographyNeedsReview`; its tax estimate is withheld. Missing MSOA assignments remain explicit unresolved records with bounded source-member and row references. The national inventory is postcode-assignment evidence; it is not a polygon-overlap proof or a resolution of the differing charging geographies.

## Browser artifact schema

`postcodes/index.json` declares schema version 1, the pinned source ID and date, country labels, sample coverage, and a mapping from outward codes to shard paths, record counts, byte sizes and SHA-256 hashes. It also lists the following ordered array fields. Each `postcodes/<OUTWARD>.json` contains `schemaVersion`, `outward` and `rows`.

| Field | Meaning |
| --- | --- |
| `postcode` | Uppercase source postcode with one space before the three-character inward code |
| `latitude`, `longitude` | Source coordinates in degrees; both null if no usable source location is available |
| `country` | Source GSS country code or null |
| `msoa21` | Source 2021 MSOA code, or the source's equivalent geography outside England/Wales; null for blank/pseudo codes |
| `sourceLad` | Supplied administrative code, without relabelling old authority codes; null for blank/pseudo codes |
| `status` | `current` if `doterm` is blank, otherwise `terminated` |
| `terminationMonth` | Source `YYYYMM`, or null for a current postcode |
| `positionQuality` | Original `osgrdind` indicator, or null if absent |

Coordinates with the documented latitude sentinel `99.999999`, blank coordinates, or quality indicator `9` are unavailable. Source positional-quality codes are preserved, including imputed or approximate locations; a retained numeric coordinate is not a claim of address-level precision. Nonfinite or out-of-range coordinates fail validation. The source guide is retained inside the archived ZIP for the meaning of quality indicators.

The application can normalise input and derive an outward code to choose a shard; only a matching source record establishes a known postcode. A missing outward shard or missing row means unknown in the pinned edition. A failed fetch must remain a network error, not an unknown postcode. A matching row supplies country and termination status, then its `msoa21` can be compared with the index's sample inventory. The area's statistics determine whether the estimate is available. The Phase 3 application still needs to implement these states.

Each shard also has a `.json.gz` equivalent. JSON uses sorted object keys, compact separators, sorted postcode rows and a trailing newline. Gzip uses compression level 9, an empty filename and timestamp zero, avoiding current-time or output-path metadata; see the [Python gzip documentation](https://docs.python.org/3.12/library/gzip.html). The build streams CSV rows into a temporary SQLite uniqueness index, then holds only one outward-code shard at a time. SQLite files, complete source rows and workbooks are never browser artifacts. Reproduction assumes the pinned Python/dependency runtime; the complete release verification checks actual artifact hashes.

## Licensing and publication

The [ONS postcode licensing guidance](https://www.ons.gov.uk/methodology/geography/licences) states that postcode products derived from Code-Point Open are subject to the Open Government Licence, with these attributions for the pinned 2025 data:

- Contains OS data © Crown copyright and database right 2025.
- Contains Royal Mail data © Royal Mail copyright and database right 2025.
- Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

ONS separately identifies Northern Ireland data as subject to LPS terms and says commercial use needs a separate licence; it describes the supplied Northern Ireland End User Licence as for internal business use only. The exact licence document is pinned alongside the private source archive. This project does not assert permission to redistribute those records. They are removed from the tracked releases, and the Python builder excludes rows with either a BT postcode prefix or the Northern Ireland country code before writing JSON/gzip shards. The website build rejects any such rows reintroduced into its sources. The pinned `publicReleaseReady: false` metadata is retained as historical provenance and coverage caution, not as an assertion that the cleaned releases still contain Northern Ireland data. See [data publication](data-publication.md).

## Verification

`tests/test_postcodes.py` covers national-versus-sample retention, current/terminated records, outside-England records, canonical duplicate detection across CSV members, schema validation, unknown geography failures, reviewed legacy-code handling, missing geography/coordinates, sample withholding, cross-authority conflicts, and deterministic JSON/gzip output. The integrated validation report adds counts and conflict evidence for the full pinned source. The source edition is changed only by a reviewed repin and a new release.

The [Phase 1 validation report](evidence/phase1-validation.json) records the following historical, pre-filter results for `sample-2026-09-26-v1`. These totals describe the original private input, not the cleaned tracked release:

| Check | Observed result |
| --- | ---: |
| All retained source postcodes | 2,714,963 |
| Current / terminated | 1,804,636 / 910,327 |
| Outward-code shards | 3,121 |
| Current / terminated in the sample MSOAs | 49,074 / 21,556 |
| Sample MSOAs with current postcode evidence | 198 of 198 |
| Duplicate normalised postcodes | 0 |
| Locations retained as unavailable | 24,086 |
| Current English records with no MSOA assignment | 786 |
| MSOAs with multiple current-compatible LAD assignments | 39 |
| MSOAs with a current-compatible source LAD / official parent conflict | 40 |
| Sample MSOAs requiring postcode-driven geography review | 0 |

The two reviewed legacy source codes account for 6,864 current Barnsley-coded and 11,807 current Sheffield-coded postcodes, recorded in 101 MSOA/source-authority assignment groups. These are separate from the 39/40 current-compatible geography inventories above. The sample's absence of conflicts is evidence for these five authorities, not a claim of national charging-geography compatibility.

All national shard JSON payloads total 241,936,570 bytes; the deterministic gzip equivalents total 27,211,902 bytes. The largest individual JSON shard is `SE1` at 331,030 bytes (32,894 compressed). The application should fetch only the requested outward shard. These sizes exclude the small index and other release artifacts.
