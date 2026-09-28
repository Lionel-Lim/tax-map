# Final plan review — 26 September 2026

## Outcome

Phase 0 remains complete. The plan covers the original postcode lookup, geographic overview, England-first scope, Council Tax plus Stamp Duty comparisons, SvelteKit and low operating costs. No missing core feature or calculation-contract error was identified in this review. Application implementation has not started, and no decision is required to begin Phase 1.

The review compared all phases of the implementation plan against the methodology, source register and manifest, Phase 0 findings, fixtures, audit code and available original conversation. It reviewed the existing evidence; it did not rerun the source audit, refresh tax rules or download newer datasets.

## Five groups of amendments

1. **Public-release coverage.** The original acceptance criteria could pass when every area was listed but most neighbourhood estimates were unavailable. The pinned sources have unexplained markers in 3,843 of 6,856 English MSOAs (about 56%). This does not describe council-level coverage. P4.1 now requires separate coverage reports, geographic distribution and a public-release decision if material gaps remain. The user's earlier choice continues to mean unavailable rather than an inferred council fallback.

2. **Reproducibility.** Hashes detect changed files but cannot retrieve old bytes. P1.1 now requires durable retention and documented retrieval of the exact source files and metadata, independently of the ignored working cache. This makes the clean-checkout reproduction criterion achievable even if publishers replace upstream files.

3. **Council and geographic validation.** The five worked comparisons validate MSOAs; the council overview also needs its own stock schema, geography-vintage checks and an independently reconciled LAD example. P1.3 now states those requirements and calls for an inventory of cross-authority and postcode/parent disagreements. P3.2 requires the displayed geography to stay explicit when zooming changes the level of detail.

4. **Incomplete-data journeys.** P1.4 and P3.3 distinguish valid postcodes outside the sample from unknown postcodes. P3.7 defines sufficient versus partial personal inputs: a valid personal comparison can coexist with an unavailable area estimate, and reset restores the original state. It cannot bypass unsupported policy or buyer cases. P3.4 makes owner-occupied primary-residence scope visible. P4.4 also checks these journeys and historical shared-link versions.

5. **Configuration and operating costs.** The sample keeps its ongoing-owner default; the England release retains the plan's annualised-ownership default with a visible 20-year assumption. P3.6 now explicitly reconciles the release default with configuration and shared links. Already pinned source periods and the neutral band no longer read as unresolved candidates. P4.6 includes the complete map asset/service cost, a concrete hosting proposal, budget and account/domain ownership.

## Decisions for the user

| Decision | When needed | Recommended next step |
| --- | --- | --- |
| Publish a limited-coverage England beta or wait if substantial neighbourhood gaps remain | After coverage has been measured and source investigation has progressed; before public release | Present actual neighbourhood and council coverage and representative postcode journeys before asking; do not invent an arbitrary coverage threshold now |
| Hosting budget and publication account/domain | Before paid provisioning or publication | Present a compatible hosting option with measured cost assumptions for approval |

Neither decision blocks Phase 1. No approval is being requested for hypothetical spending or publication in this review.

The landing comparison is an optional preference, not an unresolved blocker: ongoing owner for M1, annualised ownership over an editable 20 years for M2. This review does not change that choice. Property-type controls remain conditional on compatible data; full named proposals, specialist buyer cases and wider UK geography remain later enhancements.

## Next work

Start P1.1–P1.3 with source preservation, explicit MSOA/LAD contracts and the five-authority sample. All implementation checkboxes remain open; this review adds acceptance criteria rather than claiming those features are built.
