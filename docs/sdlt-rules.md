# Phase 2 SDLT rule contract

The England calculation uses `sdlt-england-2025-04-01-v1`, effective **1 April 2025**, checked against GOV.UK and HMRC on **26 September 2026**. The [machine-readable register](../data/rules/sdlt-england-2025-04-01.json) and executable rules are checked for equality in the tests. This is an explicitly selected dated scenario; the engine does not choose rules from today's date or assert that they apply indefinitely. A future change requires a new reviewed version.

## Rates and independent examples

The [GOV.UK residential rate table](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates) gives these marginal slices:

| Chargeable consideration slice | Standard rate |
| --- | --- |
| Up to £125,000 | 0% |
| Over £125,000 to £250,000 | 2% |
| Over £250,000 to £925,000 | 5% |
| Over £925,000 to £1,500,000 | 10% |
| Over £1,500,000 | 12% |

Eligible first-time buyers pay 0% up to £300,000, then 5% to a maximum purchase consideration of £500,000. The relief is unavailable above £500,000. The [historical-rate register](https://www.gov.uk/government/publications/rates-and-allowances-stamp-duty-land-tax) ends the previous period on 31 March 2025.

The [official-example fixtures](../data/fixtures/phase2-sdlt-examples.json) independently record the two examples on the residential rates page: a £295,000 standard purchase owes £4,750, and an eligible £500,000 first-time purchase owes £10,000. Expected figures are stored separately from executable calculations.

## Supported transaction and eligibility

The API requires explicit confirmation of UK residence for SDLT purposes, individual purchasers, a main residence, no additional-dwelling higher rates, a single residential dwelling without linked transactions, no shared ownership, and either freehold or an existing assigned lease. These are assumptions supplied by the caller. `STANDARD_BUYER` and `FIRST_TIME_BUYER` are frozen scenario presets, not determinations of a person's eligibility.

The first-time-buyer profile additionally requires `firstTimeBuyerEligible: true`. It asserts that **every purchaser** satisfies [HMRC's eligibility conditions](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29811). Intending to occupy the dwelling as a main residence is required. Linked transactions, higher-rate transactions and non-residential land cannot be treated as an ordinary eligible purchase.

The assertion includes [HMRC's first-time-buyer definition](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29845): previous acquisition of a major dwelling interest anywhere in the world can disqualify a purchaser, including an inherited or gifted interest or a part share. HMRC describes exceptions and special cases, including short leases and trusts; the engine does not infer these from a short questionnaire. A UK postal address or nationality alone does not establish UK residence for SDLT.

Non-resident, additional-property, company, trust, partnership, shared-ownership, mixed-use, multiple/linked purchase and new-lease cases return `unavailable` with guidance links. Unknown fields and missing confirmations also fail closed. A first-time profile above £500,000 returns `first-time-buyer-price-limit`, including at £500,000.01. It never silently becomes a standard calculation; a caller may explicitly choose the standard scenario where its scope fits.

## Consideration, arithmetic and rounding

`calculateSdlt(valuePence, buyer, ruleVersion)` receives the **entire chargeable consideration**, in non-negative safe-integer pence. It is not a deposit or mortgage balance. [HMRC SDLTM03700](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm03700) explains that consideration can include money and other value. This engine does not value non-cash consideration, apply other reliefs, or prepare a tax return. In the comparison, the selected property value is explicitly assumed to equal consideration.

[HMRC SDLTM00050](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050) specifies marginal calculation followed by rounding the calculated tax down to a whole pound. The engine retains input pence, computes each slice exactly with BigInt, sums the unrounded taxes, and floors the total to whole pounds. No per-band rounding or intermediate consideration rounding is applied. This SDLT boundary differs from the comparison's ordinary half-away-from-zero display rounding.

For example, £1,500,008.34 generates £93,751.0008 of raw tax and £93,751 payable. Rounding consideration first would lose this pound. Results expose the exact raw tax and each band's tax as reduced string numerator/denominator pairs in pence; `totalPence` is the integer payable amount as a string. All results are JSON serializable, including at JavaScript's safe-integer input limit.

Tests cover a penny below, at and above every standard rate threshold and both first-time thresholds; raw fractions are checked even when payable whole pounds coincide. They also cover zero, the price-limit rejection, missing confirmations, excluded transactions, monetary validation, version validation, official examples and statutory rounding.
