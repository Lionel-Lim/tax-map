# Phase 3 findings

Prepared 26 September 2026. The interactive sample application is implemented using the unchanged Phase 1 release and the shared Phase 2 calculation engine. This delivers the sample interface and planned comparison features; it does not constitute the national M2 release or approval to publish the postcode data.

## Delivered

| Plan item | Implementation |
| --- | --- |
| P3.1 | SvelteKit, TypeScript and `adapter-static`; prerendered home/map, methodology and data-source routes; responsive layout; application and browser test commands. |
| P3.2 | Browser-loaded MapLibre map, council and neighbourhood selection, blue/orange diverging legend, distinct unavailable pattern, searchable area list, and Typical Home Impact panel. Map and list use the same domain calculations and classification; the selected estimate's geography remains explicit when zoom changes the layer. |
| P3.3 | Case/whitespace normalisation, lazy postcode index and outward-code shards, concurrent-request caching, retry after failure, and distinct malformed/unknown/terminated/outside-England/outside-sample/unavailable-area/network-error states. |
| P3.4 | Property value, gross Council Tax estimate, scenario bill, change, monthly equivalent where meaningful, source dates, quality flags, labelled comparison chart, precise calculation detail and owner-occupied primary-residence scope. |
| P3.5 | Real sample postcode journey with neighbourhood selection and source-assumption inspection. `LE4 0DD` resolves to Bradgate Heights & Beaumont Leys (`E02002830`) in Leicester. |
| P3.6 | Ongoing-owner, annualised-ownership and purchase-year comparisons; standard and eligible first-time-buyer presets; editable positive whole-number ownership period. Unsupported buyer cases expose official guidance. |
| P3.7 | Optional personal property value and annual Council Tax bill in the selected-home panel, explicit personal-result labels, dependency-aware unavailable results and reset to the original estimate. Property type is visibly limited to all properties. |
| P3.8 | Annual, monthly-equivalent and percentage displays where meaningful; versioned, validated sharing; explicit postcode inclusion; browser back/forward restoration. Purchase-year comparisons do not expose a recurring monthly display. |

The main implementation is in [`src/lib/components/`](../src/lib/components/Explorer.svelte), [`src/lib/data/`](../src/lib/data/index.ts) and [`src/lib/map/`](../src/lib/map/TaxMap.svelte). The domain engine remains the single calculation path. Personal amounts affect only the selected-home calculation, never the original area statistics or map/list classification.

## Application defaults and version contract

The landing view selects the independent **Leicester council estimate**, **annualised ownership**, the **standard single-home buyer**, and an explicit **20-year ownership period**. Ongoing owner is one selection away. The annualisation assumption is displayed next to the controls and result, with no assumed price growth or discounting.

These are application defaults in [`DEFAULT_STATE`](../src/lib/data/state.ts). The immutable Phase 1 policy fixture and data manifest retain their original `ongoing-owner` M1 default, and the manifest retains `sdltRuleVersion: null`. The application combines that unchanged data with the independently versioned Phase 2 SDLT engine. No Phase 1 release bytes need to be rewritten to set the landing view.

| Component | Supported version |
| --- | --- |
| Data release | `sample-2026-09-26-v1` |
| Area schema | `1.0.0` |
| Policy | `illustrative-ppt:1.0.0` |
| Purchase SDLT rules | `sdlt-england-2025-04-01-v1` |
| Methodology | `phase0-v1` |

Generated share links declare the data, policy and SDLT rule versions, area, comparison mode, buyer, years, geography, display and property type. Supported explicit settings take precedence over the landing defaults. Unsupported versions or malformed settings produce a visible error; the application does not silently calculate with a newer release. Unknown sample area codes also fail explicitly. Opening the current sample is a separate user action.

Personal value and bill amounts are excluded from generated links. A full postcode is excluded unless the user explicitly selects its inclusion. Lookup requests contain the outward-code filename; the complete postcode is matched against that file in the browser. A postcode shared explicitly is present in the URL, and the interface explains that URLs and static-host requests may be logged. New searches and setting changes clear stale generated links.

## Try it locally

Use Node.js 22.14 or later and the pinned npm dependencies. From the project directory:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local address printed by Vite, then `/map/`. Search **LE4 0DD**, choose **Ongoing owner**, and inspect the calculation and source details. The independently recorded example is a £246,000 representative value, £1,180.80 annual scenario cost, and approximately **£814 less per year** (exact displayed change **−£813.98**). The sources describe an area estimate, not that postcode's individual homes.

For the generated static application:

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173/map/`. The static output is written to `build/`. Methodology and data-source pages remain available without JavaScript; interactive search and calculation require JavaScript. If WebGL is unavailable, postcode search, the area list and the result panel remain usable.

## Validation

The verification commands are:

```sh
npm run check
npm test
npm run test:app
npm run build
npm run test:browser
```

The browser suite uses the built app on port 4173 and starts a local preview if needed. It requires a Playwright-compatible Chromium installation; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can identify an existing executable.

Application tests cover release compatibility, source and baseline consistency, search joins, the lazy postcode cache and failure recovery, full-postcode exclusion from fetch paths, every supported lookup state, version rejection, sharing defaults and URL round trips. Browser scenarios in [`tests/browser/phase3.spec.ts`](../tests/browser/phase3.spec.ts) exercise real postcodes, the map, the independently checked ongoing-owner calculation, purchase modes, unavailable and partial personal overrides, reset, invalid-input recovery, sharing/history, and graphics/network failure handling.

Independent review also checked that invalid years cannot become a hidden input trap after changing modes, failed/new lookups cannot retain an old opted-in postcode link, history restoration clears stale validation alerts, and zoom-driven layer changes invalidate previously generated shares.

Acceptance completed on 26 September 2026:

- Type checks pass for the engine and Svelte application, with no errors or warnings.
- **97 domain tests**, **23 data/state tests**, and **27 browser checks** pass (26 functional cases and one mobile performance check).
- Static production build succeeds for all four routes. MapLibre and its explicit worker are loaded in the browser; the large map chunk produces a Vite size advisory and is included in the measured budget.
- The existing release verifies all **6,250 artifacts**. Its manifest hash and every Phase 2 domain source file remain unchanged.
- Desktop and 390px layouts were visually inspected, including unavailable hatching and the WebGL fallback. The map requires no external basemap, font, sprite or tile requests.

See [machine-readable acceptance evidence](evidence/phase3-validation.json), [desktop view](evidence/phase3-desktop.png), [mobile map](evidence/phase3-map-mobile.png) and [WebGL fallback](evidence/phase3-webgl-fallback.png).

### Sample performance baseline

The [repeatable browser measurement](../tests/browser/performance.spec.ts) uses a 390×844 viewport, disabled cache, 4× CPU slowdown and a local production preview with **no network throttling**. It includes automation overhead and is not a hosted or physical-phone speed claim. [Measured evidence](evidence/phase3-performance.json):

| Measure | Observed | Provisional regression budget |
| --- | --- | --- |
| Initial resources, decoded | 3.30 MB | 4.50 MB |
| Initial resources, encoded by preview | 1.10 MB | Hosting must verify compression |
| First postcode request, decoded index + LE4 shard | 1.08 MB | 1.30 MB |
| Initial overview | 3.01 seconds | 20 seconds under this local test |
| First postcode result | 0.45 seconds | 8 seconds under this local test |
| Scenario update | 0.38 seconds | 3 seconds under this local test |

No postcode index or shard loads before a lookup. The first lookup loads the index and only its outward-code shard; later lookups reuse cached files. These generous local thresholds catch major regressions. Phase 4 must measure real network/device conditions, reduce national payloads, and set the England release’s user-facing performance targets.

## Coverage and remaining work

The data still covers **five councils and 198 neighbourhoods**: Burnley, Cumberland, Leicester, North Yorkshire and Wandsworth. There are five available council estimates and 91 available neighbourhood estimates. The remaining **107 neighbourhoods are explicitly unavailable** because stock-count markers have unverified meanings. No zero-fill or council fallback is introduced. A separate personal calculation is available only when entered inputs replace every missing dependency; resetting restores the original unavailable area estimate.

Only the all-property category has a compatible price and Council Tax baseline in this release. The selector is disabled with that limitation visible. Prices are from the year ending September 2025, stock from 31 March 2025, charges from 2026–27, and postcodes from May 2025. These mixed periods, rounded stock counts and authority-average charge assumptions remain visible.

The sample map uses bundled simplified country outlines and the versioned council/MSOA GeoJSON. It loads MapLibre and its worker in the browser, uses system fonts and local labels, and requires no hosted basemap, glyph, sprite or tile service. The [map context note](../src/lib/map/data/README.md) records the country-outline source and attribution. This is a sample implementation; England-scale geometry, sharding and PMTiles still need the Phase 4 assessment.

The following Phase 4 work remains:

- National coverage and geography validation, including a separate assessment of useful coverage and postcode-to-result success; publication requires a coverage decision, not merely accounting for every area.
- Resolution of postcode redistribution constraints, particularly the pinned Northern Ireland/LPS terms. The release remains **internal validation data** with `publicReleaseReady: false`; see [postcode licensing and lookup limitations](postcode-data.md).
- Hosted, real-device and England-scale performance measurement, tighter production budgets, lazy detail/tile choices and sustained browser/accessibility verification beyond the sample acceptance cases.
- Static-host selection and cost review, cache/deep-link behaviour, any PMTiles range/CORS requirements, account/domain decisions and approval for public deployment.
- Release CI, refreshed-data compatibility checks, immutable artifact staging, preservation of supported old links, and a demonstrated refresh/rollback procedure.

No national expansion or public deployment is implied by this application work. The [implementation plan](implementation-plan.md), [Phase 1 findings](phase1-findings.md) and [methodology](methodology.md) retain the underlying data and release constraints.
