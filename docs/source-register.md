# Source register

Updated 26 September 2026 for Phase 1. Thirteen original source/data-metadata files remain pinned in [source-manifest.json](../data/source-manifest.json). The postcode archive and its metadata/licences are pinned separately in [postcode-source-manifest.json](../data/postcode-source-manifest.json). Exact bytes are preserved outside the raw cache; [pipeline instructions](../pipeline/README.md) describe archive verification and recovery. See [Phase 0 findings](phase0-findings.md), [LAD validation](lad-validation.md), [postcode data](postcode-data.md) and [boundary validation](boundary-validation.md). Property-type calculations remain deferred.

## Previous conversations

- **Interactive Property Tax Map**, tax-map project, 27 July 2026; task ID `6a678c91-a300-83ed-afbe-90670a1155b2`. Original product request and recommendations for MSOA detail, postcode shards, tax modes and static architecture. The available assistant response was truncated; the original user request and the relevant architecture/methodology sections were readable.
- **Implementation Phases**, tax-map project, 6 September 2026; task ID `6a9dc5b9-c274-83eb-881e-59ebf3d06777`. Recommends calculation contract, sample pipeline, engine, interactive MVP, England expansion and later enhancements.

The plan preserves the original postcode and Stamp Duty requirements while using the later sample-first delivery sequence. Additional technical details are planning recommendations, subject to the validation gates in the plan.

## Data sources

| Source | Intended use | Selected edition / inspected content | Validation status and remaining work |
| --- | --- | --- | --- |
| [ONS median house prices by MSOA](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesbymiddlelayersuperoutputarea) | Typical property value for the detailed layer | Year ending September 2025, released 26 March 2026; sheet 1a, column DT | 6,856 English codes match stock, lookup and boundaries; GBP values and suppression note inspected |
| [ONS median house prices for administrative geographies](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesforadministrativegeographies) | Independent LAD overview inputs | September 2025 edition, sheet 2a, column DT | Five sample LAD values inspected; national old/new stock geography treatment remains a release check |
| [Council Tax: stock of properties, 2025](https://www.gov.uk/government/statistics/council-tax-stock-of-properties-2025) | Band-count weights | CTSOP1.1 and CTSOP3.1 CSV archives and attached notes, stock at 31 March 2025 | All-property MSOA codes audited; unexplained dash marker preserved as unavailable |
| [Stock publication background information](https://www.gov.uk/government/statistics/council-tax-stock-of-properties-2025/background-information) | Interpretation of band counts and property types | Rounding, table revisions and postcode-based geography assignment reviewed | 45-dwelling single-area rounding bound defined; marker documentation and property-type compatibility remain open |
| [Council Tax levels, England 2026–27](https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027) | Annual charges by authority | Table 10, Data_Billing; B = GSS code, AL = full area Band D | All 296 England billing codes match LAD boundaries; sample charge components reconcile |
| [Council Tax levels technical notes](https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027-technical-notes) | Charge definitions and comparability | Accompanies the 2026–27 release | Authority-average precepts explicitly treated as an MSOA charge proxy |
| [ONS postcode products](https://www.ons.gov.uk/methodology/geography/geographicalproducts/postcodeproducts) | Postcode location and geographic lookup | ONSPD May 2025 V2; current/terminated postcodes and MSOA 2021; old Barnsley/Sheffield authority codes retained as explicit vintage exceptions | National minimal outward-code shards; country/status/location checks and cross-authority inventory. NI reuse restriction prevents claiming public release readiness; see postcode notes |
| [ONS guidance on MSOA boundaries](https://www.ons.gov.uk/aboutus/transparencyandgovernance/freedomofinformationfoi/geographicboundariesforallmiddlelayersuperoutputareacodesinenglandscotlandandwales) | MSOA 2021 geometry | MSOA BSC V3 GeoJSON and metadata downloaded; 7,264 EW features; source EPSG:27700 | Phase 1 converts sample to WGS84 and validates geometry, shared edges and island preservation |
| [LAD May 2025 BSC V2](https://www.data.gov.uk/dataset/cd5eb88d-305b-43f6-933f-61874773f245/local-authority-districts-may-2025-boundaries-uk-bsc-v2) | National overview geometry | 361 UK features, 296 in England; GeoJSON and metadata pinned | England codes match the current billing table |
| [MSOA 2021 to LAD 2025 lookup V3](https://www.data.gov.uk/dataset/009c5c9c-3187-4d78-ab23-330dd265002d/msoa-2021-to-ward-2025-to-lad-2025-best-fit-lookup-in-ew-v3) | Authoritative parent assignment | CSV with 7,264 unique MSOA codes | Matches ONS price parents; 101 differences from observed VOA row groups documented |

The file audit supports the all-property MSOA band-weighting approach for complete records. Price, stock and charge sources refer to different periods; the pinned manifest retains those periods separately. The user confirmed that unexplained stock markers should yield unavailable results for the first sample.

Start with all-properties inputs. The inspected CTSOP3.1 header separates bungalows from detached/semi-detached/terraced houses. Enable property-type results only after validating compatible categories in both sources. Do not silently combine a type-specific price with an all-property tax baseline.

HM Land Registry transaction processing is a later option if the selected ONS releases do not supply the counts or quality measures needed. It is not a prerequisite for the first working sample. Exact source and reuse conditions should be checked when that work is scoped.

## Policy and tax references

- [Fairer Share proportional property tax](https://fairershare.org.uk/proportional-property-tax/): the campaign describes a 0.48% rate. Use it as context for the illustration, with an explicit label that the app's first scenario omits transition mechanisms.
- [Fairer Share FAQ](https://fairershare.org.uk/faq/): describes protection for existing owners and removal of the cap on sale. Detailed eligibility and tax treatment need a separate contract before implementing a named full-proposal scenario.
- [HMRC residential SDLT rates](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates): source for the standard and first-time-buyer schedules, eligibility and official calculator. Pin a rule version and effective date at implementation; recheck before release.

The raw scenario assumes replacement of Council Tax and SDLT for the supported owner-occupied cases. It does not claim to reproduce the complete campaign proposal or announce a government tax change. Do not use this model to infer aggregate revenue or the fraction of households that would gain.

## Technical references

- [SvelteKit static site generation](https://svelte.dev/docs/kit/adapter-static): prerender static routes with the static adapter and retain useful page content before browser interactivity loads.
- [PMTiles with MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre): browser integration for static vector archives.
- [PMTiles storage requirements](https://docs.protomaps.com/pmtiles/cloud-storage): HTTP byte-range support and CORS requirements for separate origins; hosting validation belongs in the release checklist.

Package versions and deployment-provider limits remain implementation decisions. The plan does not rely on an unverified free hosting allowance.
