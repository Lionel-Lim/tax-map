# Property Tax Reform Map

An interactive map for exploring how an illustrative property-tax reform could affect a typical home in England. The static SvelteKit application uses pinned official data and browser-side calculations.

Phases 1–3 are complete, and the internal dataset now includes all **296 English councils and 6,856 neighbourhoods (MSOAs)**. The map includes postcode and area search, all three comparison modes, personal inputs, source details and versioned sharing. It opens on the Leicester council estimate, comparing Council Tax with an annual property tax. Users can change the property tax percentage and optionally include Stamp Duty, spread over a custom ownership period (initially 20 years) or included in full in the purchase year. Shared links retain these settings.

- [England expansion](docs/england-expansion.md): national coverage, boundary exclusions, validation and remaining publication work.
- [Cloudflare deployment](docs/deployment.md): store the project in GitHub and manually publish to `taxmap.limsight.com` on the free plan.
- [Phase 3 findings](docs/phase3-findings.md): application guide and original sample acceptance evidence.
- [Implementation plan](docs/implementation-plan.md): scope, milestones, dependencies, tasks and acceptance criteria.
- [Source register](docs/source-register.md): official data and technical references, with known source limitations.
- [Phase 0 findings](docs/phase0-findings.md): validated sources, sample selection and limitations.
- [Methodology](docs/methodology.md): calculation rules and the user-confirmed missing-data decision.
- [Phase 1 findings](docs/phase1-findings.md): delivered artifacts, verification, coverage and publication constraints.
- [Pipeline instructions](pipeline/README.md): pinned setup, source recovery, rebuilding and tests.
- [Phase 2 findings](docs/phase2-findings.md): delivered calculations and acceptance evidence.
- [Try the calculation engine](docs/phase2-engine.md): terminal examples and integration guide.
- [SDLT rules](docs/sdlt-rules.md): dated rates, eligibility, scope and official sources.

The plan draws on the earlier **Interactive Property Tax Map** and **Implementation Phases** conversations. It preserves postcode lookup, an area overview and Council Tax plus Stamp Duty comparisons.

The initial rate is an illustrative **0.48% annually** (`0.0048`). Results identify it as a reform scenario and expose its assumptions.

With Node 22.14.0 or a compatible newer version, start the application:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Try postcode **LE4 0DD**, then choose **Ongoing owner**: the area estimate is approximately **£814 less per year**. Choose **Annualised ownership** or **Purchase year** to include the supported Stamp Duty scenario. The personal-input panel changes only the selected home’s calculation.

Build and preview the static application with `npm run build` and `npm run preview`. Run `npm run check`, `npm test` (**99 domain tests**), `npm run test:app` (**32 data/state tests**) and `npm run test:browser`. The app tests load every England district and compare all 7,152 area records in all three modes. For a fresh browser-test setup, run `npx playwright install chromium`, or provide an existing browser with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. See the Phase 3 guide for details.

The calculation engine also runs in the terminal:

```sh
npm ci
npm run compare -- --value 300000 --bill 1800
```

The command accepts pounds. This example gives **£1,440/year**, a difference of **−£360/year** or **−£30/month**. Try a retained sample area with `npm run compare -- --area E02002830`; see the engine guide for purchase modes and personal overrides.

The current England release has **293 available council estimates and 2,961 available neighbourhood estimates**. The other three councils and 3,895 neighbourhoods remain explicitly unavailable, with no council fallback. Six neighbourhood polygons failed boundary validation: their records remain visible as unavailable in search and results, and their geometry is excluded from the map. Full inventory coverage does not mean every area has a usable estimate.

The browser initially loads council statistics and overview geometry. Neighbourhood statistics and geometry load by council on demand; the global name/code index remains searchable before detail loads. National minimal postcode files retain 2,714,963 current/terminated records in 3,121 outward-code shards, with only the requested shard downloaded for a lookup.

The original `sample-2026-09-26-v1` bundle remains unchanged and explicitly versioned sample links still work. It contains 198 neighbourhoods across five councils: 91 available and 107 unavailable, with all five independent council estimates available.

After the pinned setup in the pipeline instructions, rebuild with:

```sh
.venv/bin/python -m pipeline build --scope england
.venv/bin/python -m pipeline verify-release --scope england
.venv/bin/python -m unittest discover -s tests -v
```

The [active release](static/data/manifest.json) selects `england-2026-09-26-v1`. The pipeline has **66 passing tests**. The original 17 source files and independent source archive are unchanged; raw sources remain excluded from browser artifacts.

The pipeline CLI still defaults to `--scope sample` for compatibility. The historical sample release is immutable: current implementation hashes differ, so rebuilding that original ID requires its historical code. Use a fresh release ID and a separate output directory for a current-code sample compatibility build; the [pipeline instructions](pipeline/README.md) give commands.

The pinned originals are **internal validation releases**. The website now builds a separate, filtered public preview that excludes Northern Ireland postcode records and keeps coverage limitations visible. Original research files remain in this private repository; never host `static/` directly. The source archive is local; retain and back it up before removing the workspace.

The filtered public preview is live at **[taxmap.limsight.com](https://taxmap.limsight.com/)** on Cloudflare Workers Static Assets. Production page, postcode lookup and shared-link checks passed on 28 September 2026. Updates are deployed manually through Wrangler; pushing to GitHub does not change the live site. See [deployment status](docs/deployment.md) and [audit instructions](scripts/phase0/README.md) for the historical Phase 0 evidence.
