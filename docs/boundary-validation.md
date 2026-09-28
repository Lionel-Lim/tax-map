# Sample boundary validation

The Phase 1 pipeline writes `msoa.geojson` and `lad.geojson` as WGS84 GeoJSON FeatureCollections. Every feature has a stable official code as its `id` and only `code`, `name` and `geography` (`MSOA` or `LAD`) properties. The layer inventories must match the selected sample exactly. Features are sorted by code and the serialization is deterministic.

## Source CRS correction

The pinned MSOA file, `data/raw/phase0/msoa21-boundaries-v3.geojson`, declares `EPSG:27700` and contains British National Grid eastings/northings. The Phase 0 manifest incorrectly labelled it `EPSG:4326`; Phase 1 corrects that schema field without changing the source file or its checksum. The LAD source declares `EPSG:4326` and already contains longitude/latitude coordinates. The builder checks the actual source declaration against the manifest and rejects a mismatch.

MSOA coordinates are transformed with the fixed PROJ pipeline for inverse British National Grid followed by OSGB36 to WGS 84 (6), retaining longitude/latitude axis order. Its reported transformation accuracy is 2 metres, below the source's 200-metre generalisation. The complete operation is recorded in the validation report. It needs no network or transformation grids, so installing an optional grid cannot silently change the selected operation. This operation is suitable for the generalised map display; these polygons are not a cadastral or precise address-assignment product. See the [pyproj transformation API](https://pyproj4.github.io/pyproj/stable/api/transformer.html) for pipeline construction, axis order and operation accuracy.

## Generalisation and topology

Both pinned sources are ONS BSC boundaries already generalised at 200 metres and clipped to the coastline. Phase 1 retains that generalisation, including all islands. There is no second geometric simplification and no vertex dropping. Seven decimal places of WGS84 coordinate precision reduce the payload, with checks on the exact serialized output.

The builder rejects invalid input rings, non-polygon geometries, empty or collapsed parts, duplicate codes, duplicate polygons, missing sample codes and non-finite coordinates. It checks each selected geometry before and after transformation and checks each layer as an edge-matched, non-overlapping coverage. The [Shapely coverage validator](https://shapely.readthedocs.io/en/2.1.2/reference/shapely.coverage_is_valid.html) requires GEOS 3.12 or later. Full-source feature counts and code uniqueness are checked; geometric validation is scoped to the selected sample.

Coordinate rounding must preserve geometry validity, coverage validity, polygon component counts and interior-ring counts. If it fails, the entire layer keeps full coordinate precision, with a reason recorded in the report. Keeping one precision policy for the whole layer preserves matching coordinates on shared edges. A synthetic tiny-island test proves that a polygon which would collapse under rounding is retained. Output rings use GeoJSON's counterclockwise exterior convention.

No topology repair was required for this sample. The repair policy is to fail on invalid source geometry or coverage, rather than silently repairing or removing it. Any future repair must be explicitly reviewed and recorded, including preservation of every polygon component. Individual geometric validity is insufficient to establish coverage validity: independently simplifying neighbouring polygons can introduce gaps or overlaps. Shapely's [coverage simplification](https://shapely.readthedocs.io/en/2.1.2/reference/shapely.coverage_simplify.html) is an option for a future larger release after its coverage preconditions and island preservation are verified.

Coverage checks apply within each layer. They do not claim that the independently produced MSOA 2021 and LAD 2025 layers coincide exactly, prove that MSOAs nest within billing authorities, or establish charging geography. Those remain separate statistical/lookup validation requirements.

## Measured sample output

Measured using Shapely 2.1.2 / GEOS 3.13.1 and pyproj 3.7.2 / PROJ 9.5.1. The build report records these runtime versions, the transform, validation results, precision fallback reasons, bytes, gzip bytes and SHA-256 hashes.

| Measure | MSOA | LAD |
| --- | ---: | ---: |
| Features | 198 | 5 |
| Polygon components retained | 212 | 14 |
| Interior rings | 0 | 0 |
| Vertices before/after | 6,900 / 6,900 | 1,545 / 1,545 |
| Input selected features, compact bytes | 241,548 | 59,040 |
| Output bytes | 195,860 | 37,581 |
| Output gzip bytes | 49,010 | 14,290 |
| Output coordinate decimal places | 7 | 7 |
| Input/output coverage valid | Yes / Yes | Yes / Yes |
| Topology repairs | 0 | 0 |

The input-size comparison uses compact selected source features, including their original source properties; the output-size reduction primarily comes from minimal properties and coordinate precision, not fewer vertices. Gzip sizes are measurements, not separate emitted files.

Run the boundary regression tests with:

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_boundaries.py' -v
```

The twelve tests cover deterministic output and stable IDs, missing and duplicate source codes, invalid and unclosed rings, overlapping polygons, validating both layers before writing either, CRS mismatches, British National Grid conversion, incorrect WGS84 coordinate ranges, island preservation and holes/shared edges after serialization. The build also runs all checks against the real pinned sample.
