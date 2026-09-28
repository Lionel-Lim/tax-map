# Build and verify pinned data releases

The pipeline runs offline, independently of the SvelteKit app. The current internal
England release contains all **296 LAD councils and 6,856 MSOA neighbourhoods**,
with boundaries, search data, postcode shards and a versioned release manifest.
Its 293 available council estimates and 2,961 available neighbourhood estimates
use the same pinned official sources and calculation contract as the original
five-council sample. Missing inputs remain unavailable; no council fallback is used.

## Setup

Use Python **3.12.14** (`.python-version`) and the complete pinned dependency list:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-pipeline.txt
```

The original build used the Codex bundled Python 3.12.14 to create this venv.
No account, server, database or application build is needed. PROJ networking is
disabled and the coordinate transformation is explicit; see the boundary report.

## Build the England release

From the project root:

```sh
.venv/bin/python -m pipeline build --scope england
.venv/bin/python -m pipeline verify-release --scope england
```

The command verifies every source and pinned archive member, preserves an
independent byte-for-byte copy in `data/archive/`, restores any missing raw cache
files from that archive, validates joins and geometry, and builds
`static/data/england-2026-09-26-v1/`. Only a complete validated bundle updates
`static/data/manifest.json`. This pointer is local preparation, not deployment.

Existing release IDs are immutable: identical rebuilds are accepted; differing
bytes fail without changing the pointer. For a reviewed source, code or toolchain
change, choose a new `--release-id`. No timestamps are embedded in artifacts.
Each manifest records package versions, code/configuration hashes, source periods,
source and artifact hashes, geography vintages, coverage and policy version.

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m pipeline verify-archive
.venv/bin/python -m pipeline verify-release --scope england
```

The Python suite has **66 tests**. `--output-dir /path/to/output` builds elsewhere;
compare manifest and artifact hashes to demonstrate reproduction. For example,
build the current England release into a separate directory without updating the
workspace's active pointer:

```sh
.venv/bin/python -m pipeline build --scope england --output-dir /tmp/tax-map-england-rebuild
.venv/bin/python -m pipeline verify-release --scope england --output-dir /tmp/tax-map-england-rebuild
```

`--archive-dir /path/to/archive` selects a separately retained source archive.
The output directory must remain outside
`data/raw`; never put raw archives/workbooks in the static application directory.

## Preserve the historical sample

The CLI defaults to `--scope sample`; it does not infer scope from the active
pointer. The original `sample-2026-09-26-v1` bundle remains unchanged for supported
shared links. Verify its existing bytes with:

```sh
.venv/bin/python -m pipeline verify-release --scope sample
```

Do not rebuild that original ID with the current implementation. Its manifest
pins historical code hashes, so the immutable-release check correctly rejects
changed output. To reproduce that exact bundle, use the matching historical code,
configuration and toolchain alongside the retained source archive. To check the
sample path using current code, choose a fresh ID and a separate output directory:

```sh
.venv/bin/python -m pipeline build --scope sample --release-id sample-compatibility-check --output-dir /tmp/tax-map-sample-check
.venv/bin/python -m pipeline verify-release --scope sample --release-id sample-compatibility-check --output-dir /tmp/tax-map-sample-check
```

A fresh compatibility bundle is a pipeline output, not an automatically supported
application release; browser release versions are accepted explicitly.

The historical `scripts/phase1/verify_rebuild.py` utility targets the original
sample ID. Run it only with the matching historical implementation. It creates a
temporary workspace with no raw cache, restores the 17 archived sources, and
compares every rebuilt file with the original bundle. Its retained
`docs/evidence/phase1-reproducibility.json` records the successful Phase 1 check;
it is not evidence for a rebuild of the expanded England release.

## Source preservation and retrieval

`data/source-manifest.json` and `data/postcode-source-manifest.json` pin the exact
licensed sources, metadata, URLs and hashes. The archive contains:

- `sha256/<hash>`: independent original file bytes (not symlinks or hard links).
- `manifests/<hash>.json`: exact source-manifest snapshots.
- `catalogues/<hash>.json`: historical mappings from sources to original paths.
- `index.json`: the current source inventory and restore paths.

The archive is deliberately **outside the disposable `data/raw/` cache**. The
build verifies archived copies even when a cache copy exists. A corrupt copy is
an error and is never silently replaced. Missing cache files are restored without
network access. Tests exercise cache deletion, restoration and corruption.

On a new machine, copy the retained `data/archive/` directory into place (or
provide its path with `--archive-dir`), then run the build with an explicit scope.
The England expansion does not change the original source files or archive.
Preserve archive blobs, manifests and catalogues together, alongside the code and
configuration. The raw
cache is optional. Keep old catalogues and release bundles for rollback.

This task creates a durable local archive, not an off-machine backup. Archive
blobs are excluded from Git; copying only source code will not preserve them.
Before removing the workspace, copy the archive to retained storage and run
`verify-archive` there. No cloud account or paid storage has been provisioned.

For first-time acquisition without an archive, download each exact `downloadUrl`
to `localPath` and run `archive`. Downloads are separate from builds. A URL may
now serve different bytes: a checksum failure requires review, not automatic
repinning. Upstream URLs are not the recovery mechanism for historical releases.

## Browser data contracts

- `areas.json`: complete inventory for the selected release, integer price pence, exact rational
  Council Tax pence, availability/reasons and raw source references. LAD inputs
  are independently published, never averages of MSOA prices.
- `councils.json` (England): the 296 initial council records. The England browser
  loads this instead of the complete `areas.json`.
- `areas/msoa/<LAD>.json` (England): neighbourhood statistics grouped by council,
  with schema, release and parent identifiers. `manifest.initialAreasPath` and
  `manifest.areaShards` declare the initial payload, district paths, record counts,
  sizes and hashes. The browser validates each whole district before merging it.
- `search.json`: name/code and statistical-name terms, geography, parent and
  availability. England includes all 7,152 records, so a neighbourhood can be
  found before its statistics or geometry load.
- `boundaries/lad.geojson`: WGS84 council overview geometry with stable GSS IDs.
- `boundaries/msoa/<LAD>.geojson` (England): neighbourhood geometry loaded on demand
  for the active council. The complete `boundaries/msoa.geojson` remains available
  for audit; the original sample uses its complete MSOA boundary artifact.
- `postcodes/index.json` and outward-code shards: local postcode lookup; read
  the schema and field order in the index, and load one outward-code shard.
- `policy.json`: versioned scenario configuration retaining its original
  ongoing-owner data default. The application separately declares annualised
  ownership over 20 years as its landing default and pins the supported SDLT rules.
- `sources.json`: source metadata, periods, reuse conditions and attribution.
- `validation.json`: evidence, exceptions, source reconciliation and coverage.
- `manifest.json`: coherent bundle identity and complete artifact hash inventory.

No raw workbook, source ZIP or full source postcode CSV is placed in browser
output. National minimal postcode shards distinguish unknown, terminated and
outside-England locations, and known outside-sample locations in the archived
sample. The index retains its schema-1 `sampleMsoas` and `sampleLads` field names;
in the England release they contain all 6,856 MSOAs and 296 LADs. The browser checks
them against global search metadata rather than only downloaded statistics.
Postcodes introduced after the pinned directory cannot be recognized.

Six neighbourhood polygons are explicitly excluded after failing boundary
validation. Their records remain in statistics and search with a `boundary-invalid`
availability reason and a `geometry-unavailable` quality flag; they have no numeric area estimate. These
exclusions and unresolved charging-geography cases are recorded in the release
manifest and validation report. See [England expansion](../docs/england-expansion.md).

These artifacts are for **internal validation**. Public release readiness is
false: Northern Ireland postcode reuse, usable coverage and public hosting still
need the planned review. The app, loader and browser tests are separate from this
offline pipeline; **99 domain tests** and **32 data/state tests** include every
England area across all three comparison modes. Run `npm run test:browser` for
the interactive journeys. Nothing in these commands publishes the application.
See [postcode data](../docs/postcode-data.md), [LAD validation](../docs/lad-validation.md),
[boundary validation](../docs/boundary-validation.md) and the historical
[Phase 1 findings](../docs/phase1-findings.md) for source-specific evidence.
