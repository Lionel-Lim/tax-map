"""Validate the pinned BSC coverage and export compact WGS84 sample boundaries."""

from __future__ import annotations

import gzip
import hashlib
import json
import math
from pathlib import Path

import shapely
import pyproj
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform


# Pin the grid-free PROJ operation rather than letting installed optional grids
# select a different transformation on another machine. This is inverse British
# National Grid + OSGB36 to WGS 84 (6), whose stated accuracy is 2 metres.
BNG_TO_WGS84_PIPELINE = (
    "proj=pipeline step inv proj=tmerc lat_0=49 lon_0=-2 "
    "k=0.9996012717 x_0=400000 y_0=-100000 ellps=airy "
    "step proj=push v_3 step proj=cart ellps=airy "
    "step proj=helmert x=446.448 y=-125.157 z=542.06 "
    "rx=0.15 ry=0.247 rz=0.842 s=-20.489 convention=position_vector "
    "step inv proj=cart ellps=WGS84 step proj=pop v_3 "
    "step proj=unitconvert xy_in=rad xy_out=deg"
)
COORDINATE_DECIMALS = 7


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def _parts(geometry) -> list:
    return list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]


def _structure(geometry) -> tuple[int, int]:
    parts = _parts(geometry)
    return len(parts), sum(len(part.interiors) for part in parts)


def _read_geometry(raw: dict, code: str):
    _require(raw.get("type") in {"Polygon", "MultiPolygon"},
             f"{code}: boundary must be a Polygon or MultiPolygon")
    coordinates = raw.get("coordinates", [])
    polygons = coordinates if raw["type"] == "MultiPolygon" else [coordinates]
    _require(bool(polygons), f"{code}: empty boundary")
    for rings in polygons:
        _require(bool(rings), f"{code}: empty polygon")
        for ring in rings:
            _require(len(ring) >= 4 and ring[0] == ring[-1],
                     f"{code}: polygon ring must be closed and contain at least four positions")
            _require(all(len(xy) == 2 and all(isinstance(v, (int, float)) and
                         not isinstance(v, bool) and math.isfinite(v) for v in xy) for xy in ring),
                     f"{code}: expected finite two-dimensional coordinates")
    return shape(raw)


def _validate_geometry(geometry, code: str, *, wgs84: bool) -> None:
    _require(geometry.geom_type in {"Polygon", "MultiPolygon"},
             f"{code}: boundary must be a Polygon or MultiPolygon")
    _require(not geometry.is_empty, f"{code}: empty boundary")
    coordinates = shapely.get_coordinates(geometry)
    _require(all(math.isfinite(float(v)) for xy in coordinates for v in xy),
             f"{code}: non-finite boundary coordinates")
    _require(not geometry.has_z, f"{code}: expected two-dimensional boundary")
    _require(geometry.is_valid,
             f"{code}: invalid boundary: {shapely.is_valid_reason(geometry)}")
    _require(all(part.area > 0 for part in _parts(geometry)),
             f"{code}: boundary contains an empty or collapsed polygon")
    if wgs84:
        # The build exports English sample areas. A broader UK envelope catches
        # projected coordinates, reversed axes and an incorrect datum pipeline.
        west, south, east, north = geometry.bounds
        _require(-9 <= west <= east <= 3 and 49 <= south <= north <= 61,
                 f"{code}: coordinates outside expected UK WGS84 bounds")


def _validate_coverage(geometries: list, codes: list[str], stage: str) -> None:
    _require(bool(shapely.coverage_is_valid(geometries)),
             f"{stage}: overlapping or non-edge-matched boundary coverage")
    # Duplicate IDs are checked before this point. Equal polygons assigned to
    # different IDs must also fail, rather than painting one area twice.
    normalized = [shapely.normalize(geometry).wkb for geometry in geometries]
    _require(len(set(normalized)) == len(codes),
             f"{stage}: duplicate boundary polygons")


def _round_coordinates(value):
    if isinstance(value, (tuple, list)):
        return [_round_coordinates(item) for item in value]
    return round(value, COORDINATE_DECIMALS)


def _quantize(geometries: list, codes: list[str]) -> tuple[list, str | None]:
    rounded = [shape({"type": geometry.geom_type,
                      "coordinates": _round_coordinates(mapping(geometry)["coordinates"])})
               for geometry in geometries]
    try:
        for code, original, candidate in zip(codes, geometries, rounded, strict=True):
            _validate_geometry(candidate, code, wgs84=True)
            _require(_structure(original) == _structure(candidate),
                     f"{code}: coordinate rounding changed polygon components or holes")
        _validate_coverage(rounded, codes, "Rounded output")
    except ValueError as error:
        # Keep the whole layer at full precision. Mixing rounded and unrounded
        # adjacent polygons could create gaps or overlaps at their shared edge.
        return geometries, str(error)
    return rounded, None


def _build_layer(root: Path, source: dict, codes: set[str], geography: str, *,
                 allow_invalid_omission: bool = False) -> tuple[bytes, dict]:
    _require(bool(codes), f"{geography}: empty sample code set")
    data = json.loads((root / source["localPath"]).read_text(encoding="utf-8"))
    _require(data.get("type") == "FeatureCollection", "Boundary source must be a FeatureCollection")
    schema = source["schema"]
    declared_crs = data.get("crs", {}).get("properties", {}).get("name", "EPSG:4326")
    crs = CRS.from_user_input(declared_crs)
    _require(crs == CRS.from_user_input(schema["crs"]),
             f"{geography}: source CRS differs from pinned manifest ({declared_crs})")
    epsg = crs.to_epsg()
    _require(epsg in {27700, 4326}, f"{geography}: unsupported boundary CRS {declared_crs}")
    transformer = Transformer.from_pipeline(BNG_TO_WGS84_PIPELINE) if epsg == 27700 else None
    features = data.get("features", [])
    if "features" in schema:
        _require(len(features) == schema["features"], f"{geography}: source feature count differs from manifest")
    code_key = schema["featureCode"]
    name_key = code_key.removesuffix("CD") + "NM"
    inventory = {}
    for feature in features:
        code = feature.get("properties", {}).get(code_key)
        _require(isinstance(code, str) and bool(code), f"{geography}: missing feature code")
        _require(code not in inventory, f"{geography}: duplicate boundary code {code}")
        inventory[code] = feature
    missing = codes - inventory.keys()
    _require(not missing, f"{geography}: missing sample boundaries {sorted(missing)}")
    ordered_codes = sorted(codes)
    selected = [inventory[code] for code in ordered_codes]
    native_geometries = []
    names = []
    retained_codes = []
    omitted = []
    for code, feature in zip(ordered_codes, selected, strict=True):
        name = feature["properties"].get(name_key)
        _require(isinstance(name, str) and bool(name.strip()), f"{code}: missing boundary name")
        _require(feature.get("geometry") is not None, f"{code}: null boundary")
        geometry = _read_geometry(feature["geometry"], code)
        try:
            _validate_geometry(geometry, code, wgs84=epsg == 4326)
        except ValueError as error:
            # The England release may explicitly withhold a topologically invalid
            # source shape. No coordinate repair, missing key or CRS error is hidden.
            if not allow_invalid_omission or ': invalid boundary:' not in str(error):
                raise
            omitted.append({"code": code, "reason": str(error)})
            continue
        native_geometries.append(geometry)
        names.append(name.strip())
        retained_codes.append(code)
    ordered_codes = retained_codes
    _require(bool(ordered_codes), f"{geography}: no valid boundaries remain")
    if allow_invalid_omission:
        invalid_edges = shapely.coverage_invalid_edges(native_geometries)
        retained = []
        for code, geometry, name, edges in zip(ordered_codes, native_geometries, names, invalid_edges, strict=True):
            if edges.is_empty:
                retained.append((code, geometry, name))
            else:
                omitted.append({"code": code,
                                "reason": f"{code}: source boundary coverage has overlapping or non-edge-matched edges"})
        _require(bool(retained), f"{geography}: no valid boundary coverage remains")
        ordered_codes, native_geometries, names = map(list, zip(*retained))
        omitted.sort(key=lambda item: item["code"])
    _validate_coverage(native_geometries, ordered_codes, "Source sample")
    geometries = [transform(transformer.transform, geometry) if transformer else geometry
                  for geometry in native_geometries]
    for code, native, geometry in zip(ordered_codes, native_geometries, geometries, strict=True):
        _validate_geometry(geometry, code, wgs84=True)
        _require(_structure(native) == _structure(geometry), f"{code}: reprojection changed polygon components")
    _validate_coverage(geometries, ordered_codes, "Reprojected sample")
    output_geometries, fallback_reason = _quantize(geometries, ordered_codes)
    output_geometries = [shapely.orient_polygons(geometry) for geometry in output_geometries]
    output = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": code,
         "properties": {"code": code, "name": name, "geography": geography.upper()},
         "geometry": mapping(geometry)}
        for code, name, geometry in zip(ordered_codes, names, output_geometries, strict=True)
    ]}
    payload = _json_bytes(output)
    # Check the exact serialized product, including component inventories and
    # matching shared edges, rather than relying only on in-memory validation.
    serialized = json.loads(payload)
    final_geometries = [shape(feature["geometry"]) for feature in serialized["features"]]
    for code, original, final in zip(ordered_codes, native_geometries, final_geometries, strict=True):
        _validate_geometry(final, code, wgs84=True)
        _require(_structure(original) == _structure(final), f"{code}: output lost polygon components or holes")
    _validate_coverage(final_geometries, ordered_codes, "Serialized output")
    input_vertices = int(sum(shapely.get_num_coordinates(native_geometries)))
    output_vertices = int(sum(shapely.get_num_coordinates(final_geometries)))
    report = {
        "sourceId": source.get("id", f"{geography}-boundaries"),
        "geometryRuntime": {"shapely": shapely.__version__, "geos": shapely.geos_version_string,
                            "pyproj": pyproj.__version__, "proj": pyproj.proj_version_str},
        "sourceCrs": f"EPSG:{epsg}", "outputCrs": "EPSG:4326",
        "featureCount": len(ordered_codes), "allSampleCodesPresent": not omitted,
        "sourceGeometryValid": True, "sourceCoverageValid": True,
        "outputGeometryValid": True, "outputCoverageValid": True,
        "polygonComponents": sum(_structure(g)[0] for g in final_geometries),
        "interiorRings": sum(_structure(g)[1] for g in final_geometries),
        "componentsAndHolesPreserved": True,
        "topologyRepairs": [], "repairPolicy": "fail on invalid source geometry or coverage",
        "simplification": {
            "method": "retain source BSC 200m generalisation; quantize coordinates only",
            "additionalGeometryTolerance": 0,
            "coordinateDecimals": None if fallback_reason else COORDINATE_DECIMALS,
            "precisionFallbackReason": fallback_reason,
            "inputVertices": input_vertices, "outputVertices": output_vertices,
        },
        "coordinateTransformation": {
            "operation": "Inverse British National Grid + OSGB36 to WGS 84 (6)" if transformer else "identity",
            "accuracyMetres": 2 if transformer else 0,
            "pipeline": BNG_TO_WGS84_PIPELINE if transformer else None,
            "requiresNetworkOrGrids": False,
        },
        "inputSampleBytes": len(_json_bytes({"type": "FeatureCollection", "features": selected})),
        "outputBytes": len(payload),
        "outputGzipBytes": len(gzip.compress(payload, mtime=0)),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bbox": [float(value) for value in shapely.total_bounds(final_geometries)],
    }
    if allow_invalid_omission:
        report["requestedFeatureCount"] = len(codes)
        report["omittedGeometry"] = omitted
        report["repairPolicy"] = "no repairs; explicitly omit invalid source topology and withhold its area estimate"
    return payload, report


def build_boundaries(root: Path, sources: dict, sample_msoas: set[str],
                     sample_lads: set[str], output_dir: Path, *,
                     parent_lookup: dict[str, str] | None = None,
                     allow_invalid_omission: bool = False) -> dict:
    """Write two validated sample layers and return their reproducible QA report.

    ``sources`` is the source manifest keyed by source ID. Source files must
    already have passed the caller's pinned hash checks. No network is used.
    """
    _require(shapely.geos_version >= (3, 12, 0), "Boundary validation requires GEOS >= 3.12")
    layers = {}
    # Validate both before writing either artifact.
    for geography, codes in (("msoa", sample_msoas), ("lad", sample_lads)):
        layers[geography] = _build_layer(root, sources[f"{geography}-boundaries"], codes, geography,
                                         allow_invalid_omission=allow_invalid_omission)
    shards = {}
    if parent_lookup is not None:
        for code in sample_msoas:
            _require(parent_lookup.get(code) in sample_lads,
                     f"{code}: MSOA boundary shard has no selected parent authority")
        grouped = {code: [] for code in sorted(sample_lads)}
        for feature in json.loads(layers["msoa"][0])["features"]:
            grouped[parent_lookup[feature["id"]]].append(feature)
        for parent, features in grouped.items():
            payload = _json_bytes({"type": "FeatureCollection", "features": features})
            shards[parent] = (payload, {"path": f"boundaries/msoa/{parent}.geojson",
                                       "featureCount": len(features), "bytes": len(payload),
                                       "gzipBytes": len(gzip.compress(payload, mtime=0)),
                                       "sha256": hashlib.sha256(payload).hexdigest()})
    output_dir.mkdir(parents=True, exist_ok=True)
    for geography, (payload, _) in layers.items():
        (output_dir / f"{geography}.geojson").write_bytes(payload)
    if shards:
        (output_dir / "msoa").mkdir(exist_ok=True)
        for parent, (payload, _) in shards.items():
            (output_dir / "msoa" / f"{parent}.geojson").write_bytes(payload)
    report = {geography: report for geography, (_, report) in layers.items()}
    if parent_lookup is not None:
        report["msoa"]["shards"] = {parent: row for parent, (_, row) in shards.items()}
    if allow_invalid_omission:
        report["omittedGeometry"] = [row for _, layer in layers.values() for row in layer["omittedGeometry"]]
    return report
