# Data licences and attribution

**Keep the source notices when reusing data or map assets.** The project's MIT licence covers original code and documentation. It does not relicense third-party data, derived datasets, map geometry or dependencies.

The retained official datasets use the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/), subject to the source-specific terms recorded in the manifests.

| Data | Source and notice |
| --- | --- |
| House prices | ONS statistics adapted from HM Land Registry data, licensed under OGL v3.0. |
| Council Tax stock | VOA/HMRC, licensed under OGL v3.0. |
| Council Tax rates | MHCLG, licensed under OGL v3.0. |
| Boundaries and area lookups | ONS; contains OS data © Crown copyright and database right 2021 or 2025, as recorded for each source. |
| Postcodes | ONS Postcode Directory, May 2025. Retain the notices below. |

For ONS data: Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

For the postcode data:

- Contains OS data © Crown copyright and database right 2025.
- Contains Royal Mail data © Royal Mail copyright and database right 2025.
- Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

Northern Ireland postcode records are excluded from the distributed files. The upstream UK-wide source has separate Northern Ireland terms; see [ONS licensing guidance](https://www.ons.gov.uk/methodology/geography/licences).

The background map in `src/lib/map/data/land.json` is derived from ONS boundaries. Contains OS data © Crown copyright and database right 2025. Contains National Statistics data © Crown copyright and database right 2025. Its [source note](src/lib/map/data/README.md) explains the transformation. Screenshots containing these map assets retain the same source notices.

For exact terms, dates and transformations, use the [source manifest](data/source-manifest.json), [postcode manifest](data/postcode-source-manifest.json), and each release's `sources.json` under `static/data/`. These source-specific records take precedence over this summary. Keep them with redistributed datasets. Software dependencies retain their own licence notices.
