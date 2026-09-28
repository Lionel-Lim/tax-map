# Implementation plan

Prepared: 6 September 2026. Status updated 26 September 2026: Phases 0–3 complete; England coverage expansion delivered as an internal preview. Phase 4 production and publication work remains open. See [England expansion](england-expansion.md), [Phase 3 findings](phase3-findings.md), [Phase 2 findings](phase2-findings.md), [Phase 1 findings](phase1-findings.md), [Phase 0 findings](phase0-findings.md) and the [calculation contract](methodology.md).

Final planning review: 26 September 2026. The [review record](plan-review-2026-09-26.md) identifies the additions below and the decisions reserved for publication. No user decision blocks Phase 1.

## Basis and intended outcome

This plan combines the original **Interactive Property Tax Map** conversation with the subsequent **Implementation Phases** discussion in the tax-map project. The original request establishes SvelteKit, England first, open data, postcode lookup, a geographic overview, comparison with Council Tax and Stamp Duty, and low operating costs. The later discussion recommends a small validated dataset before national coverage.

The workspace was empty when this plan was prepared. There is no existing application, repository configuration, test suite or hosting configuration to preserve. Architecture and methodology choices below are working recommendations from those discussions, not claims that every detail has already been decided.

The product should answer: **“Under these assumptions, how would the tax cost of a typical home in this area change?”** Postcode search selects an area estimate. The overview shows the same calculation across areas.

The first working milestone compares annual Council Tax with a raw 0.48% scenario. The intended England release also includes Stamp Duty comparison modes and postcode lookup, preserving the original request.

## Scope and milestones

| Milestone | Included | Completion evidence |
| --- | --- | --- |
| M0 — calculation contract | Pinned definitions, candidate datasets, geography mapping, worked examples and policy configuration | Each displayed number can be traced to a definition and manually checked |
| M1 — working sample | A few representative authorities and their MSOAs; real data pipeline; ongoing-owner calculation; map, postcode lookup, result panel and methodology | A postcode-to-result journey works with validated real sample data |
| M2 — England release | All expected England areas accounted for; three comparison modes; supported buyer profiles; property-type controls where supported; optional personal inputs; accessible search and sharing | Release checks pass and coverage gaps are visible |
| M3 — enhancements | Additional policies, transition rules, specialist buyer cases and wider geography | Each addition has its own validated methodology and data |

Keep accounts, a database, a runtime calculation API and an administration portal outside the initial scope. Add them only for a concrete requirement. Aggregate tax revenue, “percentage of households better off,” and totals derived by multiplying median values by housing stock are separate modelling work.

## Working decisions and checks

| Topic | Working direction | Resolve before |
| --- | --- | --- |
| Geography | MSOA 2021 for detail; local-authority districts at national zoom; England only | Phase 1: verify source vintages and official lookups, including reorganisations |
| Typical value | ONS rolling annual median transaction price, initially all properties; property-type breakdowns for M2 | Phase 1: confirm tables, coverage, suppression and property-type mapping |
| Price period | Pinned: year ending September 2025; retain the exact edition instead of silently using latest data | Completed in Phase 0; revalidate before changing the release bundle |
| Council Tax baseline | Gross area estimate weighted by VOA band counts and the applicable annual band charges | M0: verify total area charges, precepts, rounded counts and suppressed cells |
| Council Tax year | Pinned: 2026–27, with the date mismatch to prices and stock made visible | Completed in Phase 0; retain separate source periods in the UI |
| Policy | Versioned, uncapped illustrative 0.48% annual replacement scenario for primary residences | M0: explicitly declare replacement of Council Tax and, in purchase modes, SDLT |
| Comparison basis | Ongoing owner for M1; add annualised ownership and purchase year for M2 | Phase 3: make basis visible beside every result |
| Ownership period | Suggested default 20 years, editable to a positive whole number | Phase 3: document annualisation as a simple scenario assumption |
| Buyer profiles | Standard single-home purchaser and eligible first-time buyer for M2 | Phase 2: pin current rules and define unsupported cases |
| Low-quality inputs | Explicit unavailable result for missing/suppressed required inputs; user confirmed no fallback for unexplained VOA dash markers | Defined in the Phase 0 methodology; verify marker semantics before revising |
| Hosting | Static app plus versioned data; PMTiles storage supporting byte-range requests | Phase 4: verify deployment compatibility, traffic assumptions and cost |

The [source register](source-register.md) and [pinned manifest](../data/source-manifest.json) record the completed file-level checks. The [Phase 0 methodology](methodology.md) supersedes provisional details above and documents remaining source limitations. The [postcode source manifest](../data/postcode-source-manifest.json) and Phase 1 findings record postcode acquisition, vintage checks and reuse limitations.

## Calculation contract

Use a pure TypeScript domain module. Map components and result panels consume the same calculation result. Store monetary inputs in integer pence; represent the policy rate as an exact ratio, such as 48/10,000. Define rounding at named output boundaries and retain precision until then.

```text
V = representative property value, or an explicitly entered value
C = estimated gross annual Council Tax, or an explicitly entered annual bill
S = SDLT on V for the supported buyer profile and rule version
Y = ownership period in years
P = V × 0.0048

Ongoing owner:        current = C;         scenario = P
Annualised ownership: current = C + S/Y;    scenario = P
Purchase year:       current = C + S;      scenario = P

Difference = scenario − current
Positive = higher estimated cost; negative = lower estimated cost
```

These formulas assume replacement of Council Tax and removal of SDLT for the supported primary-residence scenario. Policy configuration must declare those assumptions. A later policy that retains a tax must include it on the scenario side. Do not reuse these formulas unchanged for an unrelated proposal.

For annual comparisons, monthly equivalent is the unrounded annual difference divided by 12. Purchase-year results are labelled as a first-year cash-cost comparison; hide the recurring monthly label in that mode. Annualisation excludes price growth, future tax changes, financing costs and discounting.

### Council Tax estimate

```text
C = Σ(band count × annual band charge) / Σ(band count)
```

Use counts for the same area and selected property type where the sources support it. Prefer published total area charges. If charges are derived from Band D, document and validate the band ratios and treatment of parish, police, fire and other precepts. Never substitute a council's own component for the full charge.

The gross weighted estimate does not reproduce the individual bill for a median-price home and does not model personal discounts or exemptions. The price median represents sold properties, while the counts describe housing stock. Explain this combination in the methodology and in the result's “area estimate” label.

Do not infer Council Tax bands from contemporary sale prices. Do not treat suppressed or unavailable counts as zero. Rounded counts require a documented reconciliation tolerance. A zero denominator yields an unavailable result.

### Numerical examples

These use synthetic Council Tax baselines, not published area estimates. SDLT examples use the standard single-property rates checked on 6 September 2026; see the [official rate reference](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates).

| Example | Inputs | Expected result |
| --- | --- | --- |
| Rate regression | Value £300,000 | Scenario £1,440/year; catches accidental use of 4.8% |
| Ongoing owner, lower | Value £300,000; Council Tax £1,800/year | Difference −£360/year; −£30/month |
| Ongoing owner, higher | Value £500,000; Council Tax £1,800/year | Difference +£600/year; +£50/month |
| Annualised, standard buyer | Value £500,000; Council Tax £1,800; SDLT £15,000; 20 years | Current £2,550/year; scenario £2,400; difference −£150/year |
| Purchase year, standard buyer | Same value, Council Tax and SDLT | Current £16,800; scenario £2,400; first-year difference −£14,400 |
| Missing value or baseline | One required input unavailable | No numeric result; explicit reason |

Define percentage difference as `difference / current × 100`; it is unavailable when the current amount is zero. Display money consistently to whole pounds in the primary UI, with precise values available in the breakdown. Normalise rounded negative zero to zero.

## Architecture and proposed layout

Official data → offline import and validation → versioned static statistics, postcode shards and boundaries → SvelteKit application → browser-side comparison and map styling.

Use SvelteKit with TypeScript and `adapter-static`, retaining prerendered page content. Load the interactive map in the browser after mount. This follows the [SvelteKit static adapter documentation](https://svelte.dev/docs/kit/adapter-static). Use MapLibre GL JS, with small GeoJSON boundaries for M1 and PMTiles for the England layer if the sample confirms this approach. The [PMTiles MapLibre integration](https://docs.protomaps.com/pmtiles/maplibre) supports browser reads from static storage.

Prefer Python for the offline pipeline; add DuckDB and geometry/tile tooling when the selected files justify them. Pin actual dependency versions during setup. Large source spreadsheets and postcode archives stay outside the application bundle.

```text
tax-map/
  docs/                       plan, methodology, sources, release procedure
  src/lib/domain/tax/         types, policies, council-tax, sdlt, comparison
  src/lib/data/               manifest, area and postcode loaders, validation
  src/lib/map/                map component, layers, legend scale, selection
  src/lib/components/         search, controls, result panel, comparison chart
  src/routes/                home, map, methodology, data-sources
  pipeline/                  download, transform, validate, build boundaries
  data/fixtures/             small synthetic and source-derived test fixtures
  data/raw/                  cached source files; excluded from application/Git
  static/data/<release>/     statistics, search index, postcode shards
  static/tiles/<release>/    versioned boundaries or PMTiles
  static/data/manifest.json  active release and artifact locations
  tests/                     domain, pipeline and browser acceptance checks
```

The application layout is proposed. Phase 1 added the offline pipeline, tests, independent source archive and static release. Phase 2 added the shared domain engine, tests and terminal demo. Phase 3 added the SvelteKit application, lazy MapLibre map, local postcode lookup, controls, sharing and browser checks. Small sample boundaries are bundled under the data release’s boundaries directory; future PMTiles can use the separate tile layout above.

Minimum contracts:

| Contract | Required content |
| --- | --- |
| Release manifest | Schema/data versions, source URLs and hashes, source periods, geography vintages, policy/rule versions, artifact paths and hashes, coverage summary |
| Area statistic | GSS code, area name/type, parent lookup reference, property type, price and baseline with units, source references, availability and quality reasons |
| Policy | ID/version, illustrative/proposal status, exact rate, tax replacement assumptions, supported residence/buyer cases, source and review date |
| Comparison result | Current/scenario breakdown, difference, units and basis, assumptions, input provenance, policy/rule/data versions or explicit unavailable reason |
| Postcode shard | Normalised postcode, location, country, geography codes and current/terminated status; minimal fields only |

Use stable geographic IDs in boundaries and statistics so scenario changes recolour features without rebuilding tiles. LAD-level values must come from valid LAD-level inputs; do not average MSOA medians or add typical-home results to derive an authority total.

## Phased delivery

### Phase 0 — define the calculation and data contract

Dependencies: none. Produces M0.

- [x] **P0.1** Write `docs/methodology.md` covering the working decisions, scenario wording, units, rounding, missing-data rules and worked examples.
- [x] **P0.2** Inspect candidate source files and select exact editions, tables, columns and geography vintages. Add URLs, checksums and licence/attribution requirements to a machine-readable source manifest.
- [x] **P0.3** Verify that prices, stock counts, annual charges and boundaries can be joined using official codes/lookups. Record reorganisations and non-nesting geography cases; no name-based fuzzy joins.
- [x] **P0.4** Define band-weighting rules, suppression treatment and source-specific quality thresholds. Distinguish source uncertainty from a map's visual neutral band.
- [x] **P0.5** Choose 3–5 sample authorities with varied prices, tax levels and geography, including an urban area, a rural area and a reorganisation case. Select exact IDs after checking coverage.

Acceptance: at least one real area example is manually reconciled to all contributing sources; synthetic examples cover both signs and missing inputs. A list of unresolved source limitations accompanies the contract. Unsupported records can be marked unavailable without blocking development with valid fixtures.

### Phase 1 — build a reproducible sample pipeline

Dependencies: P0.2–P0.5; use the P0.1 contracts.

- [x] **P1.1** Establish project/toolchain configuration, source caching and pinned dependencies; separate offline data preparation from the app build. Preserve the exact licensed source and metadata bytes in a durable archive with documented retrieval and checksum verification. A mutable upstream URL plus its hash is not sufficient for future reproduction; the archive must survive removal of the working cache.
- [x] **P1.2** Import sample prices, stock counts and total annual charges; preserve raw suppression markers and source identifiers before normalisation.
- [x] **P1.3** Validate joins and generate MSOA and LAD statistics. Include explicit missing/unsupported rows so gaps remain visible. Define the LAD stock schema and geography filters explicitly, validate its counts and boundary vintage, and independently reconcile at least one LAD example. Inventory cross-authority MSOAs and conflicting postcode/parent-authority assignments; matching codes alone do not establish compatible charging geography.
- [x] **P1.4** Generate simplified sample boundaries, a name/code search index and postcode shards by outward code. Preserve country/status information needed to explain unsupported searches. Specify enough lookup coverage to distinguish a valid postcode outside the five-authority sample from an unknown postcode; do not infer validity or country from postcode syntax alone.
- [x] **P1.5** Produce a release manifest and validation report: duplicates, unmatched codes, missing geometry, coverage, suppression, outliers and stock reconciliation.

Acceptance: a documented command rebuilds identical content from pinned inputs, apart from isolated run metadata. Every available result has compatible geometry and traceable inputs. Duplicate keys and unexplained joins fail validation. The browser artifacts contain no raw workbooks or complete postcode archive.

### Phase 2 — implement and verify the calculation engine

Dependencies: P0.1 and P0.4; can start against fixtures while Phase 1 is underway.

- [x] **P2.1** Define policy, input and result types, schema validation and the versioned uncapped 0.48% scenario.
- [x] **P2.2** Implement ongoing-owner comparison, Council Tax weighting, currency formatting and unavailable results. Use this for M1.
- [x] **P2.3** Implement versioned SDLT calculations for supported standard and first-time buyers, then annualised and purchase-year modes for M2.
- [x] **P2.4** Reject invalid ownership periods, negative/non-finite amounts, unsupported policies and unsupported buyer/transaction cases. Link unsupported tax cases to official guidance in the UI.
- [x] **P2.5** Add independent expected-result tests from the worked examples and official tax examples. Cover threshold boundaries, first-time-buyer eligibility, zero baselines, rounding and the 0.48% regression.

Completed 26 September 2026: [Phase 2 findings](phase2-findings.md) record 97 passing tests and browser/Node type checks. Unsupported SDLT cases expose official guidance URLs for the Phase 3 UI.

Acceptance: all supported comparisons return a transparent breakdown, retain input/version provenance, and match independently checked examples. Test just below, at and above every threshold in the selected SDLT rule version, including loss of first-time-buyer relief above its price limit. Standard results are never silently substituted for unsupported profiles.

### Phase 3 — build the interactive application

Dependencies: Phase 1 artifacts and Phase 2 engine. Deliver M1 first, then complete the M2 feature set.

- [x] **P3.1** Scaffold the SvelteKit static app with home/map, methodology and data-source pages, responsive layout and basic automated checks.
- [x] **P3.2** Add map selection, an accessible diverging legend, an area search/list alternative and the Typical Home Impact panel. Use one shared calculation/colour-classification path. Label the active geography and keep the selected result's geography explicit when zooming; council and neighbourhood estimates use independent inputs and can differ.
- [x] **P3.3** Add postcode normalisation and lazy shard loading. Locate the postcode and select its MSOA; distinguish malformed, unknown, terminated, outside-England, outside-sample-coverage, unavailable-area and network-error states.
- [x] **P3.4** Show value, Council Tax baseline, scenario bill, annual difference, monthly equivalent, dates, quality flags and methodology. Add a labelled horizontal comparison chart. Make the supported owner-occupied primary-residence scope visible beside the scenario; do not imply this estimates a tenant's change in personal costs.
- [x] **P3.5** Verify the M1 journey with the real sample: search postcode → select area → read ongoing-owner estimate → inspect source assumptions.
- [x] **P3.6** Add annualised ownership and purchase-year modes, buyer profile and ownership-period controls. Default M2 to annualised ownership with a clearly visible 20-year assumption; keep ongoing owner one selection away. Record and test the release's default explicitly: the current policy fixture's ongoing-owner default applies to M1, and M2 configuration must agree with the intended landing view. Explicit settings in supported shared links take precedence over the landing default.
- [x] **P3.7** Add property-type selection where both price and tax inputs support it. Add optional property value and actual annual Council Tax bill; keep these overrides confined to the selected-home result, with a reset to area estimate. For unavailable areas, permit a separately labelled personal calculation only when every required input is valid and each unavailable dependency has been replaced by an explicit personal input. Preserve the unavailable area estimate and map styling; partial overrides cannot supply missing facts or bypass unsupported policy/buyer cases. Reset restores the original area availability.
- [x] **P3.8** Add annual/monthly and absolute/percentage displays where meaningful. Add explicit result sharing using validated query parameters and data/policy versions, with browser back/forward behaviour.

Completed 26 September 2026: [Phase 3 findings](phase3-findings.md) and [acceptance evidence](evidence/phase3-validation.json) record the working sample, 147 passing tests/checks across domain, application and browser suites, static build, visual review and provisional mobile performance budgets. Only all-property inputs are supported, so the property-type selector explicitly shows that limitation. The England M2 release remains Phase 4.

Acceptance: map, list and panel agree for the same area/scenario. Personal overrides are visibly labelled and do not recolour other homes' area estimates. All user-visible assumptions accompany results. Keyboard and touch users can complete lookup and comparison without selecting a polygon. Without WebGL, search and the result panel remain usable.

Use blue/orange or another accessible diverging scale, text labels for higher/lower costs, and a distinct unavailable style. Phase 0 fixed the initial neutral band at −£100 through +£100 per year, inclusive; this is a display threshold, not a confidence interval. Its legend must expose the threshold, and monthly/percentage modes must use consistent or explicitly separate units.

Full postcodes are looked up locally after loading an outward-code shard. Sharing a full postcode is explicit; do not claim that URLs or static-host requests are never logged. Keep personal bill/value overrides out of share links by default.

### Phase 4 — expand, validate and prepare the England release

Dependencies: M1 demonstrated; complete P2.3 and P3.6–P3.8 before M2.

Progress 26 September 2026: the user requested all supported England locations. The [internal expansion](england-expansion.md) accounts for 296 councils and 6,856 neighbourhoods, with 293 and 2,961 available estimates respectively. National source checks, council-sharded statistics/GeoJSON, version-preserving search and sharing, browser checks and local mobile measurements are delivered. The tasks below remain open where their production or public-launch acceptance is broader than this expansion; inventory completeness does not close the usable-coverage decision.

- [ ] **P4.1** Expand to the expected England geography inventory. Record every area as available or unavailable with a reason; report both record coverage and dwelling coverage where supported. Report council and neighbourhood coverage separately, including geographic distribution and expected postcode-to-result success. Before public launch, review usable coverage with the user and choose a labelled limited-coverage beta or defer publication if unresolved gaps are material. Accounting for every area does not by itself establish useful coverage; the sample's no-fallback decision does not settle launch readiness.
- [ ] **P4.2** Validate outliers, coastal/island features, boundary changes and source-date mismatches. Spot-check independent examples across price ranges, authority types and property types.
- [ ] **P4.3** Generate England boundary tiles and choose statistics sharding from measured payloads. Lazy-load MSOA detail and map code; measure initial overview, postcode lookup and scenario-change performance on mobile.
- [ ] **P4.4** Complete browser acceptance checks: valid/invalid searches, outside-sample coverage, a missing-data area, each comparison mode, sufficient/partial personal overrides and reset, share/reload, keyboard navigation, narrow screens and failure recovery. Verify shared links use their declared data/policy/rule versions; unavailable or unsupported old versions must explain the problem rather than silently calculate with the latest release.
- [ ] **P4.5** Prepare CI checks and a release procedure: validate data, test calculations, build static pages, run critical browser checks, stage immutable artifacts, then update the release manifest.
- [ ] **P4.6** Select compatible static hosting and tile storage. Test actual HTTP byte-range responses, CORS where needed, cache headers and deep-link reloads; estimate request/storage/transfer costs from measured traffic assumptions. Include any basemap, font, sprite and external-service requirements, attribution and costs. Present a concrete hosting option and monthly cost estimate for the user's budget decision before provisioning paid services; confirm account/domain ownership before publication.
  - Hosting preparation, 28 September 2026: selected Cloudflare Workers Static Assets Free at `taxmap.limsight.com`. Configuration, asset-limit checks, local caching/routing and browser verification are recorded in [deployment instructions](deployment.md). Expected hosting cost is £0/month for the current static design. Public deployment, account/domain checks and production validation remain open; the current GeoJSON map does not require byte-range reads.
- [ ] **P4.7** Document refresh and rollback. Preserve old data releases for shared links; revalidate sources on refresh, publish coherent bundles and retain the previous manifest for rollback.

The [PMTiles hosting documentation](https://docs.protomaps.com/pmtiles/cloud-storage) requires byte-range support and suitable CORS for cross-origin storage. Keep data artifacts independently hostable so hosting constraints do not require changing the calculation engine.

Acceptance for M2:

- Every expected England area is accounted for; no silently dropped or zero-filled records.
- Usable coverage has been reviewed separately from inventory completeness, and any material gaps have an explicit public-release decision.
- The original postcode and overview journeys work with all three supported comparison modes.
- Results identify source periods, policy/rule versions and estimates versus entered values.
- Domain, pipeline and critical browser checks pass from a clean checkout with pinned inputs.
- Methodology, source attributions and coverage limitations are reachable from the application.
- Measured mobile performance is reviewed; record performance budgets during M1 and enforce them for M2.
- A staged release supports direct navigation, correct caching and PMTiles reads, and a rollback is demonstrated.

Preparation of this plan does not deploy the app or configure a recurring data-refresh job; those are future implementation tasks.

### Phase 5 — add enhancements after the England release

Dependencies: M2 and evidence of user benefit.

- [ ] Additional scenarios and adjustable rates, retaining explicit policy versioning.
- [ ] A full named proposal with verified transition-cap, second-home and liability rules; keep its identity distinct from the raw 0.48% illustration.
- [ ] Additional-property/non-resident buyer cases and specialist SDLT rules, with independent rule checks and tests.
- [ ] Council Tax band input with a verified local charge lookup and a link to the official band checker.
- [ ] Area comparisons, transaction-count confidence, richer property-type handling and explicit parent-area fallbacks.
- [ ] Wales and Scotland, using their own tax rules, sources and geographic definitions.
- [ ] Aggregate area impact only after developing a housing-stock valuation and transaction-frequency model.

## Execution order and immediate next work

The dependency path is **Phase 0 → sample pipeline + calculation engine → M1 sample map → remaining comparison features + England expansion → M2 release**. Pipeline and domain work can proceed independently after the contracts are fixed; this describes work dependencies, not a requirement to create additional agents.

Phases 1–3 and the internal England expansion are complete. Continue Phase 4 with source-gap review, usable-coverage and publication decisions, CI, hosting validation and release preparation. Keep all unavailable records explicit and retain the recorded postcode/geography limitations. The [England expansion](england-expansion.md) records current coverage and validation. Historical Phase 1–3 findings document the preserved sample release and application baseline.

Keep the checkboxes as the implementation backlog. Mark tasks complete only when their deliverables and acceptance evidence exist; revise the contract and dependent fixtures together when a source limitation changes the methodology.
