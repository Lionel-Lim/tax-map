# Geographic context for the map

`land.json` is a simplified country outline derived from the already pinned
`data/raw/phase0/lad25-boundaries-v2.geojson` (ONS Local Authority Districts,
May 2025). Country shapes were dissolved from the LAD polygons with Shapely
2.1.2, simplified with topology preserved at 0.009 degrees, then rounded to five
decimal places. This is visual geographic context only; calculations, area
selection and coverage use the versioned release boundaries.

Contains OS data © Crown copyright and database right 2025. Contains National
Statistics data © Crown copyright and database right 2025. See the project's
source register and pinned source manifest for the underlying source and licence.

The map uses local GeoJSON, system fonts and DOM labels; it needs no hosted
basemap, sprite, glyph or tile service.

The England release loads its validated LAD layer for the overview and fetches
one `boundaries/msoa/<LAD>.geojson` file when exploring neighbourhoods in that
council. Its full MSOA layer remains an audit artifact, not an initial browser
download. Neighbourhood geometry is displayed only after its statistics are
loaded. A maximum of seven spaced DOM labels keeps the national view readable
without requiring external font glyphs.
