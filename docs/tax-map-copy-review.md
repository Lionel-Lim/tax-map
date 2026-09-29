# Tax Map — copy and popover proposal

**Review status: approved by the user; implemented and verified locally on 29 September 2026.**

Validation: the production build and Svelte checks pass. All 45 functional browser checks passed, and the six overlay checks passed again after the final focus and spacing adjustments. Desktop and mobile layouts were reviewed, including a 320px viewport. WebKit checks confirmed focus returns after closing help, personal-input, sharing and source-record overlays. The changes have not been deployed.

Review the proposed on-page text first, then the popover wording. Allow about 15–20 minutes for the full review, or review one section at a time. Approve the proposal as a whole, or identify a change by its ID, such as B2 or C4.

The wording follows the [i-have-adhd skill](https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md): clear actions, small groups, and relevant context beside the task. The popover design below follows your request.

“Old” means the current local website, including the layout changes from the previous review. Braces such as {years}, {area}, and {amount} represent existing dynamic values; the implementation will retain their data sources and calculation rules. This is a proposed copy change, not a change to the tax model.

## A. First view and search

### A1. Page introduction

**Old**

- A DIFFERENT WAY TO TAX PROPERTY
- What would change for a typical home?
- Explore an illustrative 0.48% annual property tax, compared with Council Tax and Stamp Duty.

**Proposed on page**

- Heading: **See how property tax could change**
- Description: **Compare a typical home’s Council Tax and relevant Stamp Duty with an illustrative 0.48% annual property tax.**
- First action: **Enter a postcode to explore your area.**

Remove the decorative eyebrow. Place one ⓘ button beside “0.48% annual property tax,” with the accessible name “About the 0.48% scenario.”

**Proposed popover — About this scenario**

> The annual tax is 0.48% of the property value.
>
> This illustration assumes it replaces Council Tax and, for the purchase comparisons, Stamp Duty. It has no transition cap.
>
> It is not an enacted tax. The estimate covers an owner-occupied main home.
>
> Read how the estimate works →

The final link opens the methodology page. A short owner-occupied-home qualification also stays beside the result (C4).

### A2. Coverage strip

**Old**

> Explore England
>
> 293 council estimates · 2,961 neighbourhood estimates · data gaps stay visible
>
> Coverage & limitations ↗

**Proposed on page**

> **England · some estimates unavailable** ⓘ
>
> Data & coverage →

Retain the existing separate coverage figures: **296 English councils · 6,856 neighbourhoods**. These are inventory totals, not available-estimate counts.

**Proposed popover — Where estimates are available**

> Council estimates: **293 of 296**.
>
> Neighbourhood estimates: **2,961 of 6,856**.
>
> Some areas lack the data or valid boundaries needed for an estimate. Missing data is never counted as zero.
>
> See coverage and sources →

All counts stay dynamic. Archived sample links keep their sample-specific counts and an explicit “Archived sample” label.

### A3. Postcode search and privacy

**Old**

> Find your neighbourhood
>
> Enter a postcode
>
> Find postcode →
>
> Lookup uses the May 2025 directory. Only an outward-code file is requested; full postcodes are matched in your browser.

**Proposed on page**

> **Find your area** ⓘ
>
> Placeholder: **Enter a postcode**
>
> Button: **Find area →**

**Proposed popover — About postcode search**

> Search uses the May 2025 postcode directory. Newer postcodes may be missing.
>
> The first part of your postcode selects a data file to download. Your browser then matches the full postcode locally.
>
> Search finds a neighbourhood estimate, not a bill for your address. Some neighbourhoods have no estimate.

Keep postcode lookup errors and their next action beside the field. Do not put them in this popover.

### A4. Geography and area search

| Old | Proposed on page |
|---|---|
| Map geography | Map areas ⓘ |
| Council areas / Neighbourhoods | Council areas / Neighbourhoods — retain |
| Explore by area | Search by area name |
| Search area name or code… | Enter an area name or code |

**Old supporting text**

> Browsing {council}. Search any neighbourhood name or code across England. Select an area to load its estimate.

**Proposed supporting text**

> Browsing **{council}**. Search any neighbourhood in England.

Show the first sentence only when the list is scoped to a council.

**Proposed popover — Council or neighbourhood?**

> Council estimates cover a local authority. Neighbourhood estimates cover a smaller statistical area, called an MSOA.
>
> Each uses its own price and Council Tax data. A council estimate does not replace a missing neighbourhood estimate.
>
> Zooming can change the map layer. Your selected result changes when you choose another area.

## B. Comparison settings

### B1. Comparison label and choices

| Old | Proposed on page |
|---|---|
| Comparison basis | Compare costs ⓘ |
| Annualised ownership | Spread purchase costs over time |
| Ongoing owner | Yearly costs without a purchase |
| Purchase year | Costs in the purchase year |

Retain the current default: spread purchase costs over **20 years**.

**Proposed popover — Choose a comparison**

1. **Spread purchase costs over time:** compare Council Tax plus Stamp Duty divided by your chosen number of years with the annual scenario tax.
2. **Yearly costs without a purchase:** compare Council Tax with the annual scenario tax. Stamp Duty is excluded.
3. **Costs in the purchase year:** compare Council Tax plus the full Stamp Duty payment with one year of the scenario tax. This is a first-year comparison.

Use this same terminology wherever a comparison mode is named, including the methodology page.

### B2. Ownership period and the explanatory note

**Old**

> Ownership years
>
> All property types combined. One-off Stamp Duty is spread over {years} years, with no price growth or discounting.

**Proposed on page**

> **Years of ownership** ⓘ
>
> **All property types combined.**

The selected number remains visible in its input. The result card also names the period (C2).

**Proposed popover — Why the number of years matters**

> Stamp Duty is normally paid once when buying.
>
> Here, its cost is divided by **{years} years** to show a yearly comparison. Changing the number changes this comparison; it does not change how Stamp Duty is paid.
>
> The illustration assumes no price growth and does not discount future costs.

Show this control and popover only for the spread-over-time comparison.

### B3. Buyer and eligibility

| Old | Proposed on page |
|---|---|
| Buyer profile | Buyer type ⓘ |
| Standard single-home buyer | Standard main-home buyer |
| Eligible first-time buyer | Eligible first-time buyer — retain |
| Buyer assumptions & unsupported cases | Remove the expanding row; place its explanation in the buyer popover |

**Old explanation**

> UK-resident individuals buying a single primary residence; no additional-property surcharge, shared ownership, linked transaction or new lease rent. The model assumes a freehold purchase.
>
> All purchasers are assumed eligible first-time buyers under HMRC’s worldwide ownership definition. Above £500,000 the first-time-buyer model is unavailable; it does not silently switch profiles.
>
> Check official SDLT guidance ↗

The second paragraph currently appears only for the first-time-buyer choice.

**Proposed popover — Buyer assumptions**

> This model assumes UK-resident individuals buying one main home as a freehold purchase.
>
> It excludes additional-property surcharges, shared ownership, linked transactions and new lease rent.
>
> For the first-time-buyer option, every purchaser must meet HMRC’s eligibility rules.
>
> Check official Stamp Duty guidance ↗

**Proposed visible note when first-time buyer is selected**

> All buyers must qualify. Supported up to **£500,000**. ⓘ

Use the same buyer popover for that icon. A result above the supported limit remains visibly unavailable; keep the current explanation and official-guidance link in the result panel.

### B4. Result display

| Old | Proposed on page |
|---|---|
| Display result | Show change as ⓘ |
| Annual £ | Pounds per year |
| Monthly £ equivalent | Monthly equivalent |
| Percentage change | Percentage — keep the % unit on the result |
| Purchase-year £ | Pounds in purchase year |

**Proposed popover — Result units**

> **Pounds per year:** the estimated yearly difference.
>
> **Monthly equivalent:** the yearly difference divided by 12, not a monthly bill.
>
> **Percentage:** the difference compared with current costs. It is unavailable when current costs are zero.

For purchase-year mode, replace the first two paragraphs with:

> **Pounds in purchase year:** the difference in first-year costs, including the one-off purchase tax. There is no monthly equivalent in this mode.

Keep the current rule that purchase-year mode has no monthly option.

## C. Result card

### C1. Result identity, direction and amount

| Old | Proposed on page |
|---|---|
| TYPICAL HOME IMPACT | ESTIMATED TAX CHANGE |
| {area} | {area} — retain |
| Council area estimate · {code} / Neighbourhood estimate · {code} | Council estimate ⓘ / Neighbourhood estimate ⓘ |
| ↓ Lower estimated cost / ↑ Higher estimated cost / No estimated change | ↓ Estimated decrease / ↑ Estimated increase / No estimated change |

Keep the amount, selected unit, chart and input amounts visible. Move the area code into the existing source information, proposed as “Data behind this estimate” (C3).

**Proposed popover — About this estimate**

> This result uses the area’s median sale price and estimated average Council Tax bill. It is not a bill for a specific address.
>
> You can use your own property value and Council Tax bill below.

**Old purchase-year qualification**

> First-year cash-cost comparison; this is not a recurring saving.

**Proposed visible purchase-year qualification**

> First-year costs only. This is not a recurring yearly change.

For annual and monthly modes, retain the signed annual and monthly equivalent amounts. For percentage mode, keep “vs current cost” visible. Avoid “You will save” or “Your new bill.”

### C2. Comparison basis and chart explanation

| Old | Proposed on page |
|---|---|
| Annualised over {years} years | Purchase costs spread over {years} years ⓘ |
| Purchase-year comparison | Costs in the purchase year ⓘ |
| Ongoing-owner comparison | Yearly costs without a purchase ⓘ |
| 0.48% scenario | Illustrative 0.48% tax |

**Old extra sentences below the basis label**

> Council Tax + one-off Stamp Duty spread evenly over ownership.
>
> Annual Council Tax + one-off Stamp Duty in the current system.
>
> Annual Council Tax compared with the illustrative annual property tax.

**Proposed placement**

Move the applicable explanation into the corresponding comparison popover from B1. Keep its selected mode and period visible on the card.

**Old chart note**

> {upfront amount} one-off Stamp Duty, spread over {years} years.

**Proposed placement**

Put this unchanged sentence in a popover next to the chart’s **Stamp Duty ÷ {years} years** label. The chart still shows both the Council Tax and Stamp Duty amounts. The input summary still shows the full one-off Stamp Duty amount.

### C3. Calculation and data details

| Old expandable heading | Proposed floating-popover trigger |
|---|---|
| Calculation & precise figures | ⓘ How this is calculated |
| Source dates & estimate quality | ⓘ Data behind this estimate |

**Old calculation wording**

> Property value × 0.0048 = {property tax} per year.
>
> Current comparison cost: {current total}. Includes {annualised Stamp Duty} in annualised Stamp Duty.
>
> Scenario − current = {difference} per year / in year one.
>
> Monthly equivalent: {monthly amount}. Calculated before rounding, not a billing schedule.
>
> Map class: {class}. A neutral colour means within £100 of current cost; it is not a confidence interval.

**Proposed popover — How this is calculated**

1. **Illustrative yearly tax:** {property value} × 0.48% = {property tax}.
2. **Current comparison cost:** {current total}.
3. **Estimated change:** {scenario comparison total} − {current total} = {difference} {period}.

Add the applicable current-cost explanation directly below step 2:

- Spread over time: “Council Tax plus {annualised Stamp Duty} in Stamp Duty per year, spread over {years} years.”
- Without a purchase: “Council Tax only.”
- Purchase year: “Council Tax plus the full one-off Stamp Duty payment.”

Then, where applicable:

> Monthly equivalent: {monthly amount}. Calculated before rounding; this is not a monthly bill.
>
> Read the full calculation method →

Keep the existing precise amounts. Put the map-class explanation in the legend popover (D1), instead of repeating it here. Preserve the current model assumptions on the linked methodology page and retain any result-specific assumption in this calculation popover.

**Old source explanation**

> The median sale value and stock-weighted gross bill describe different populations. Neither identifies the Council Tax band of a particular home.

The current section also contains source dates, area-quality explanations, data/policy/rule versions and area source references.

**Proposed popover — Data behind this estimate**

> **Area:** {area} · {code}
>
> **Sale prices:** year ending September 2025
>
> **Housing stock:** 31 March 2025
>
> **Council Tax:** 2026–27
>
> **Postcode directory:** May 2025
>
> These sources cover different dates and groups of homes. They do not identify an individual home’s Council Tax band.
>
> {Existing area-quality explanations, retained verbatim.}
>
> View source records →

Retain the exact versions and area source references behind “View source records,” opening a separate labelled overlay. Do not put raw JSON in the short help popover or remove its existing availability.

### C4. Scope, personal results and unavailable data

**Old scope note**

> Owner-occupied primary residence only. Illustrative, uncapped replacement of Council Tax and supported purchase SDLT. This does not estimate a tenant’s personal costs.

**Proposed on page**

> **Illustrative estimate · owner-occupied main home only.** ⓘ

**Proposed popover — Who this covers**

> This illustration covers a main home lived in by its owner. It does not estimate a tenant’s personal costs.
>
> It assumes an uncapped property tax replacing Council Tax and, in the supported purchase comparisons, Stamp Duty.

**Other visible wording**

| Old | Proposed on page |
|---|---|
| Personal calculation · entered values apply only to this home. | Using your entered values. Area estimates on the map are unchanged. |
| The original area estimate is unavailable. Its map colour remains unavailable. | The area estimate is still unavailable on the map. |
| Area estimate unavailable | Area estimate unavailable — retain |
| Check the comparison inputs | Check your inputs |
| Missing data is never treated as zero. A council estimate is not substituted. | Missing data is not counted as zero. We do not substitute a council estimate. |

Keep the specific unavailable reason, invalid-field explanation and recovery action visible. These are not optional help.

## D. Map, personal inputs and sharing

### D1. Legend

**Old**

> Change in cost · per year / purchase year
>
> Lower over £100 · Within £100 either way · Higher over £100 · Unavailable
>
> The neutral band includes −£100 to +£100. It is a display threshold, not a confidence interval. Colours keep this basis in every display mode.

**Proposed on page**

> **Estimated change · per year** ⓘ
>
> Lower by over £100 · Within £100 · Higher by over £100 · No estimate

Use **“Estimated change · purchase year”** when that mode is selected. Retain the four swatches and unavailable hatch.

**Proposed popover — How map colours work**

> “Within £100” includes changes from **−£100 to +£100**. It groups similar results; it does not measure the uncertainty of an estimate.
>
> Colours use annual pounds even when you display monthly equivalents or percentages. In purchase-year mode, they use purchase-year pounds.
>
> Hatched areas have no estimate.

### D2. Map guidance

**Old note below the map**

> Showing independent council / neighbourhood (MSOA 2021) estimates. Selected result: {geography}. Zooming changes the map layer, not the selected estimate. Colours always use first-year / annual pounds.

**Old guidance inside the map**

> Zoom in for neighbourhood estimates.
>
> Blue is lower cost · orange is higher · hatched is unavailable.
>
> Pan or click another council to load its neighbourhoods.

**Proposed on page**

> **Select an area to see its estimate.** ⓘ

Keep the selected area, estimate type, scenario cost and change visible inside the map. Also keep the existing notice visible if the selected result belongs to a different geography or is outside the London view.

**Proposed popover — Using the map**

1. Select an area to update the result.
2. Zoom in to explore neighbourhoods.
3. Pan or select another council to load its neighbourhoods.

Then show:

> Changing the map layer does not change your selected result.

In London view, also show:

> Zoom to the 2 km scale for neighbourhood estimates. Zoom out to compare boroughs.

Remove the duplicate colour explanation; it remains in the visible legend and its popover. Retain loading, network-error and map-fallback messages on the page.

### D3. Personal inputs

**Old**

> Use your own property value or bill
>
> Optional, in pounds. Blank fields retain the area input. Missing dependencies must each be replaced; the original unavailable estimate stays on the map.

**Proposed on page**

> **Use your own figures** ⓘ
>
> Enter pounds. Leave a field blank to keep the area value.

**Proposed popover — About your figures**

> Your entries update this comparison only. They do not change the map’s area estimates.
>
> If an area estimate is unavailable, you must supply every missing value before a personal comparison can be calculated.
>
> Personal values are excluded from share links.

| Old | Proposed |
|---|---|
| Apply personal inputs | Update comparison |
| Reset to area estimate | Use area figures |
| Keep area value / Keep area estimate | Use area value / Use area bill |

Keep the existing field labels with “£”.

**Proposed presentation:** make “Use your own figures” an action opening a compact, labelled form overlay. The ⓘ button explains the feature. Entering values must be an explicit action, not hidden inside a help icon. The overlay includes **Update comparison**, **Use area figures**, and **Close**. Validation stays beside the relevant input. Applying a valid change closes the form, returns focus to the opener and announces the updated result. This replaces the expanding form without moving the page.

### D4. Sharing

**Old**

> Share this comparison
>
> Share the area estimate and assumptions. Personal amounts are excluded.
>
> Shared URLs and static-host requests may be logged.

**Proposed on page**

> **Share this comparison** ⓘ
>
> Shares the area estimate and settings. Your entered figures are excluded.

**Proposed popover — What the link includes**

> The link includes the area, comparison settings and data version.
>
> Your entered property value and Council Tax bill are excluded. A full postcode is included only if you choose to add it.
>
> Shared URLs and requests for website files may be logged by the hosting service. Anyone with a link containing a postcode can read that postcode.

Retain the explicit **“Include full postcode in link”** checkbox, unchecked by default, beside the share action whenever a postcode is available. Do not move that choice into the help popover.

| Old | Proposed |
|---|---|
| Create share link | Create link |
| Copy link | Copy link — retain |
| Area-estimate link ready. Personal amounts are excluded. | Link ready. Your entered figures are excluded. |
| Link copied. Personal amounts are excluded. | Link copied. Your entered figures are excluded. |
| Select and copy the link below. | Copy this link manually. |

**Proposed presentation:** show the generated URL, **Copy link** and status in a labelled share overlay, opened by **Create link**. Keep the visible exclusion note and postcode opt-in on the main page. This avoids adding a URL field to the page layout each time a link is created.

## E. Supporting pages and interaction rules

### E1. Methodology name and introduction

**Old**

> Methodology
>
> Typical Home Impact compares an area's median sale price with an estimated gross Council Tax bill. It is a representative-area comparison, not a bill for a particular address.

**Proposed**

> **How it works**
>
> Tax Map uses an area’s median sale price and estimated Council Tax bill to compare tax costs for a typical home. It does not calculate the bill for a specific address.

Update the navigation label to **How it works** and the page title to **How it works · Tax Map**. Keep the existing URL so links still work.

Add a short overview before the detailed sections:

1. Choose an area.
2. Choose how to compare costs.
3. Read the estimated change and its assumptions.

Retain the technical explanations, model limits, dates, official links and precision rules on this page. Apply the approved comparison labels from B1 to its three mode names. Long reference material should remain readable as a page rather than becoming a succession of small popovers.

### E2. Data-page introduction

**Old**

> Data sources & coverage
>
> The map accounts for all {council total} councils and {neighbourhood total} neighbourhoods in the pinned England inventory. An area is shown as unavailable when its inputs or boundaries cannot support a consistent estimate. This is a preview with incomplete coverage; no missing input is treated as zero.

**Proposed**

> **Data & coverage**
>
> The map includes {council total} English councils and {neighbourhood total} neighbourhoods. Some have no estimate because data or valid boundaries are missing.
>
> **Coverage is incomplete. Missing data is not counted as zero.**

Use **Data & coverage** in navigation and **Data & coverage · Tax Map** as the page title.

Keep the coverage tables, source descriptions, credits, licensing, postcode limitations and data-version details on this dedicated page. Their specific figures and source references remain unchanged.

### E3. Popover behaviour to approve

1. **Open intentionally:** click, tap, Enter or Space on a small ⓘ button beside the relevant label. Give every button a descriptive accessible name, such as “About postcode search.” Do not require hover.
2. **Float above the page:** opening a popover or form overlay does not move the surrounding controls, map or result. Position it within the viewport; avoid covering its trigger where space permits. A popover can temporarily cover content, so it must be easy to dismiss.
3. **Close predictably:** provide a Close button; Escape closes it. Clicking outside closes short informational popovers. Form overlays use explicit Close/Cancel so an accidental outside tap cannot discard entered values. Return focus to the trigger when closing by keyboard or the Close button.
4. **Keep one open:** opening another help popover closes the previous one. Use a readable mobile width and a contained scroll area if necessary. Long source records and forms use labelled overlays with appropriate focus handling, rather than oversized tooltips.
5. **Keep the task visible:** amounts, units, comparison period, ownership scope, coverage gaps, errors and postcode-sharing consent stay on the page. Source-detail and calculation links remain available. Provide access to the same explanations on the supporting pages if popovers cannot be used.

### E4. Scope of approval

Approval covers the exact copy and placement in A1–E3, including the personal-input and share overlays. Popover titles are part of the proposal. All other website copy remains as it is for this pass.

The calculation engine, amounts, supported scenarios, data versions, eligibility rules and postcode-sharing defaults are unchanged by this proposal. Any new wording needed during implementation that materially changes the meaning should return for review.

**Next action: reply “Approve the proposal,” or name the IDs you want changed.**
