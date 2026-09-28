"""Boundary regression tests use tiny geometries to exercise destructive cases."""

import json
from pathlib import Path
import tempfile
import unittest

import shapely
from shapely.geometry import shape

from pipeline.boundaries import build_boundaries


def feature(code, coordinates, geography="msoa", geometry_type="Polygon"):
    prefix = "MSOA21" if geography == "msoa" else "LAD25"
    return {"type": "Feature", "properties": {f"{prefix}CD": code, f"{prefix}NM": code + " name"},
            "geometry": {"type": geometry_type, "coordinates": coordinates}}


LEFT = [[[-0.2, 51.5], [-0.1, 51.5], [-0.1, 51.6], [-0.2, 51.6], [-0.2, 51.5]]]
RIGHT = [[[-0.1, 51.5], [0, 51.5], [0, 51.6], [-0.1, 51.6], [-0.1, 51.5]]]


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / "output"
        self.sources = {}
        self.write_source("msoa", [feature("E02000002", RIGHT), feature("E02000001", LEFT)])
        self.write_source("lad", [feature("E06000001", LEFT, "lad")])

    def write_source(self, geography, features, crs="EPSG:4326"):
        source_id = f"{geography}-boundaries"
        prefix = "MSOA21" if geography == "msoa" else "LAD25"
        self.sources[source_id] = {
            "id": source_id, "localPath": f"{geography}.geojson",
            "schema": {"featureCode": f"{prefix}CD", "crs": crs, "features": len(features)},
        }
        data = {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": crs}},
                "features": features}
        (self.root / f"{geography}.geojson").write_text(json.dumps(data))

    def build(self, msoas=None):
        return build_boundaries(self.root, self.sources,
                                {"E02000001", "E02000002"} if msoas is None else msoas,
                                {"E06000001"}, self.output)

    def test_stable_ids_minimal_properties_and_deterministic_output(self):
        first_report = self.build()
        first = (self.output / "msoa.geojson").read_bytes()
        second_report = self.build()
        self.assertEqual(first, (self.output / "msoa.geojson").read_bytes())
        self.assertEqual(first_report, second_report)
        data = json.loads(first)
        self.assertNotIn("crs", data)
        self.assertEqual([f["id"] for f in data["features"]], ["E02000001", "E02000002"])
        self.assertEqual(set(data["features"][0]["properties"]), {"code", "name", "geography"})
        self.assertEqual(data["features"][0]["properties"]["geography"], "MSOA")
        self.assertEqual(first_report["msoa"]["outputBytes"], len(first))

    def test_missing_polygon_stops_both_outputs(self):
        with self.assertRaisesRegex(ValueError, "missing sample boundaries"):
            self.build({"E02000003"})
        self.assertFalse(self.output.exists())

    def test_duplicate_source_codes_fail(self):
        self.write_source("msoa", [feature("E02000001", LEFT), feature("E02000001", RIGHT)])
        with self.assertRaisesRegex(ValueError, "duplicate boundary code"):
            self.build({"E02000001"})

    def test_self_intersection_fails_without_silent_repair(self):
        bow_tie = [[[-0.2, 51.5], [-0.1, 51.6], [-0.2, 51.6], [-0.1, 51.5], [-0.2, 51.5]]]
        self.write_source("msoa", [feature("E02000001", bow_tie)])
        with self.assertRaisesRegex(ValueError, "invalid boundary"):
            self.build({"E02000001"})

    def test_unclosed_ring_is_rejected_before_library_auto_closes_it(self):
        self.write_source("msoa", [feature("E02000001", [LEFT[0][:-1]])])
        with self.assertRaisesRegex(ValueError, "ring must be closed"):
            self.build({"E02000001"})

    def test_overlapping_polygons_fail_even_when_each_is_valid(self):
        self.write_source("msoa", [feature("E02000001", LEFT), feature("E02000002", LEFT)])
        with self.assertRaisesRegex(ValueError, "coverage"):
            self.build()

    def test_invalid_lad_does_not_write_msoa_first(self):
        self.write_source("lad", [feature("E06000099", LEFT, "lad")])
        with self.assertRaisesRegex(ValueError, "missing sample boundaries"):
            self.build()
        self.assertFalse(self.output.exists())

    def test_manifest_crs_must_match_file(self):
        self.sources["msoa-boundaries"]["schema"]["crs"] = "EPSG:27700"
        with self.assertRaisesRegex(ValueError, "source CRS differs"):
            self.build()

    def test_projected_input_is_transformed_to_longitude_latitude(self):
        london = [[[530000, 180000], [530100, 180000], [530100, 180100],
                   [530000, 180100], [530000, 180000]]]
        self.write_source("msoa", [feature("E02000001", london)], "EPSG:27700")
        report = self.build({"E02000001"})
        west, south, east, north = report["msoa"]["bbox"]
        self.assertTrue(-0.13 < west < east < -0.12)
        self.assertTrue(51.50 < south < north < 51.51)
        self.assertEqual(report["msoa"]["sourceCrs"], "EPSG:27700")
        self.assertFalse(report["msoa"]["coordinateTransformation"]["requiresNetworkOrGrids"])

    def test_projected_coordinates_mislabelled_wgs84_fail(self):
        projected = [[[530000, 180000], [530100, 180000], [530100, 180100],
                      [530000, 180100], [530000, 180000]]]
        self.write_source("msoa", [feature("E02000001", projected)])
        with self.assertRaisesRegex(ValueError, "WGS84 bounds"):
            self.build({"E02000001"})

    def test_tiny_island_forces_full_precision_instead_of_disappearing(self):
        island = [[[0.1, 51.5], [0.10000001, 51.5], [0.10000001, 51.50000001],
                   [0.1, 51.50000001], [0.1, 51.5]]]
        self.write_source("msoa", [feature("E02000001", [LEFT, island], geometry_type="MultiPolygon")])
        report = self.build({"E02000001"})
        self.assertEqual(report["msoa"]["polygonComponents"], 2)
        self.assertIsNone(report["msoa"]["simplification"]["coordinateDecimals"])
        self.assertIsNotNone(report["msoa"]["simplification"]["precisionFallbackReason"])
        data = json.loads((self.output / "msoa.geojson").read_text())
        geometry = shape(data["features"][0]["geometry"])
        self.assertGreater(geometry.geoms[1].area, 0)

    def test_hole_and_shared_edges_survive_serialization(self):
        hole = [[-0.18, 51.52], [-0.16, 51.52], [-0.16, 51.54], [-0.18, 51.54], [-0.18, 51.52]]
        self.write_source("msoa", [feature("E02000001", LEFT + [hole]), feature("E02000002", RIGHT)])
        report = self.build()
        self.assertEqual(report["msoa"]["interiorRings"], 1)
        features = json.loads((self.output / "msoa.geojson").read_text())["features"]
        geometries = [shape(f["geometry"]) for f in features]
        self.assertTrue(shapely.coverage_is_valid(geometries))
        self.assertAlmostEqual(geometries[0].intersection(geometries[1]).length, 0.1)

    def test_parent_shards_reuse_validated_geometry_exactly(self):
        parents = {"E02000001": "E06000001", "E02000002": "E06000001"}
        report = build_boundaries(self.root, self.sources, set(parents), {"E06000001"},
                                  self.output, parent_lookup=parents)
        self.assertEqual((self.output / "msoa.geojson").read_bytes(),
                         (self.output / "msoa/E06000001.geojson").read_bytes())
        self.assertEqual(report["msoa"]["shards"]["E06000001"]["featureCount"], 2)
        self.assertNotIn("omittedGeometry", report)

    def test_invalid_source_omission_is_explicit_and_never_repairs(self):
        bow_tie = [[[-0.2, 51.5], [-0.1, 51.6], [-0.2, 51.6], [-0.1, 51.5], [-0.2, 51.5]]]
        self.write_source("msoa", [feature("E02000001", bow_tie), feature("E02000002", RIGHT)])
        parents = {"E02000001": "E06000001", "E02000002": "E06000001"}
        report = build_boundaries(self.root, self.sources, set(parents), {"E06000001"},
                                  self.output, parent_lookup=parents, allow_invalid_omission=True)
        self.assertEqual([row["code"] for row in report["omittedGeometry"]], ["E02000001"])
        self.assertIn("invalid boundary", report["omittedGeometry"][0]["reason"])
        self.assertEqual(report["msoa"]["topologyRepairs"], [])
        self.assertEqual(report["msoa"]["requestedFeatureCount"], 2)
        self.assertEqual(report["msoa"]["featureCount"], 1)
        self.assertFalse(report["msoa"]["allSampleCodesPresent"])
        self.assertEqual([f["id"] for f in json.loads((self.output / "msoa.geojson").read_text())["features"]],
                         ["E02000002"])

    def test_invalid_shared_coverage_is_documented_before_omission(self):
        distant = [[[0.2, 51.5], [0.3, 51.5], [0.3, 51.6], [0.2, 51.6], [0.2, 51.5]]]
        self.write_source("msoa", [feature("E02000001", LEFT), feature("E02000002", LEFT),
                                    feature("E02000003", distant)])
        report = build_boundaries(self.root, self.sources, {"E02000001", "E02000002", "E02000003"},
                                  {"E06000001"}, self.output, allow_invalid_omission=True)
        self.assertEqual([row["code"] for row in report["omittedGeometry"]], ["E02000001", "E02000002"])
        self.assertTrue(all("coverage" in row["reason"] for row in report["omittedGeometry"]))
        self.assertTrue(report["msoa"]["outputCoverageValid"])

    def test_invalid_shard_parent_stops_all_outputs(self):
        with self.assertRaisesRegex(ValueError, "no selected parent authority"):
            build_boundaries(self.root, self.sources, {"E02000001", "E02000002"}, {"E06000001"},
                             self.output, parent_lookup={"E02000001": "E06000001"})
        self.assertFalse(self.output.exists())

    def test_omission_does_not_bypass_coordinate_or_crs_errors(self):
        projected = [[[530000, 180000], [530100, 180000], [530100, 180100],
                      [530000, 180100], [530000, 180000]]]
        self.write_source("msoa", [feature("E02000001", projected)])
        with self.assertRaisesRegex(ValueError, "WGS84 bounds"):
            build_boundaries(self.root, self.sources, {"E02000001"}, {"E06000001"}, self.output,
                             allow_invalid_omission=True)


if __name__ == "__main__":
    unittest.main()
