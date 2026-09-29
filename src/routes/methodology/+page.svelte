<svelte:head>
  <title>How it works · Tax Map</title>
  <meta name="description" content="How the customisable property tax comparison works, what its estimates mean, and which assumptions and data limits apply." />
</svelte:head>

<article class="prose">
  <p class="eyebrow">Understanding the estimate</p>
  <h1>How it works</h1>
  <p class="lead">Tax Map uses an area’s median sale price and estimated Council Tax bill to compare tax costs for a typical home. It does not calculate the bill for a specific address.</p>
  <ol><li>Choose an area.</li><li>Choose how to compare costs.</li><li>Read the estimated change and its assumptions.</li></ol>

  <h2 id="using-the-map">Using the map</h2>
  <ol><li>Select an area to update the result.</li><li>Zoom in to explore neighbourhoods.</li><li>Pan or select another council to load its neighbourhoods.</li></ol>
  <p>Changing the map layer does not change your selected result.</p>
  <p>In London view, zoom to the 2 km scale for neighbourhood estimates. Zoom out to compare boroughs.</p>

  <h2 id="scenario">The scenario</h2>
  <p>
    The <strong>illustrative property tax — uncapped</strong> applies your chosen annual percentage to
    the selected property value, starting at <strong>0.48%</strong>. You can change the rate in the comparison settings.
    It assumes this replaces Council Tax for an owner-occupied primary
    residence and, in supported purchase comparisons, also replaces Stamp Duty Land Tax (SDLT).
    It does not estimate a tenant's change in personal costs.
  </p>
  <p>
    The default rate is informed by <a href="https://fairershare.org.uk/proportional-property-tax/">Fairer Share's proposal</a>.
    Transition caps, deferral, second-home rules and changes in owner/occupier liability are excluded.
    This illustration is neither an enacted tax nor a complete implementation of that proposal.
  </p>

  <h2 id="comparisons">Three ways to compare</h2>
  <p>The default compares Council Tax with property tax, excluding Stamp Duty. Choose an “Include Stamp Duty” option to include purchase costs.</p>
  <dl>
    <dt><strong>Yearly costs without a purchase</strong></dt>
    <dd>Compare one year of Council Tax with one year of the illustrative property tax.</dd>
    <dt><strong>Spread purchase costs over time</strong></dt>
    <dd>
      Compare Council Tax plus purchase SDLT divided by the chosen ownership period with the annual
      scenario bill. The initial assumption is <strong>20 years</strong>; change “Years of ownership” to any positive whole number.
      Stamp Duty is still paid once when buying. This is a simple allocation,
      excluding growth, future tax changes, financing and discounting.
    </dd>
    <dt><strong>Costs in the purchase year</strong></dt>
    <dd>
      Compare Council Tax plus the whole purchase SDLT payment with the scenario's annual bill.
      This describes first-year cash cost; it has no recurring monthly equivalent.
    </dd>
  </dl>
  <p>
    Change equals scenario cost minus current cost: a negative figure means lower estimated cost;
    a positive figure means higher estimated cost. Monthly equivalents divide the unrounded annual
    result by 12. Percentage change uses the current cost as its denominator and is unavailable when
    that cost is zero.
  </p>

  <h2 id="area-estimates">How the area baseline is estimated</h2>
  <p>
    The all-property median price is a proxy for value. It describes homes sold during the published
    period, while Council Tax stock describes a different population. The median is not revalued to
    today's prices and is not an individual property's valuation.
  </p>
  <p>
    We weight Council Tax bands A–H by the area's published dwelling counts, using the statutory
    ratios to Band D: 6/9, 7/9, 8/9, 9/9, 11/9, 13/9, 15/9 and 18/9. The result is multiplied by
    the authority's full average Band D charge, including local and major precepts.
  </p>
  <p>
    This is <strong>estimated gross Council Tax using the authority-average charge</strong>. It does
    not recover each parish's exact bill or include personal discounts, exemptions, premiums or
    Council Tax support. The weighting denominator is the sum of the included band counts, which
    can differ from the separately rounded published total.
  </p>
  <p>
    Council and neighbourhood results use independent price and stock inputs. Council results are
    not averages of neighbourhood medians. These typical-home changes cannot be summed to estimate
    total revenue, household gains or housing wealth. Property-type comparisons remain unavailable
    until compatible price and stock categories are validated.
  </p>

  <h2>The dates describe different periods</h2>
  <ul>
    <li><strong>Sale prices:</strong> 1 October 2024–30 September 2025.</li>
    <li><strong>Property stock:</strong> 31 March 2025.</li>
    <li><strong>Council Tax:</strong> 1 April 2026–31 March 2027.</li>
    <li><strong>Geography:</strong> 2021 neighbourhoods (MSOAs), May 2025 councils (LADs).</li>
  </ul>
  <p>
    Combining these inputs does not make them simultaneous observations. Official geographic codes
    and the pinned parent lookup establish the joins. Unresolved cross-authority assignments require
    review before a neighbourhood estimate is shown; a display polygon does not determine a
    postcode's taxing authority.
  </p>

  <h2 id="unavailable">Unavailable means unavailable</h2>
  <p>
    An unexplained dash in a required VOA stock cell withholds the area estimate. Missing or suppressed
    prices, missing charges and unresolved geography also prevent a numeric comparison. We preserve
    these states rather than treating missing values as zero or substituting a council-wide result.
  </p>
  <p>
    The England inventory includes 296 councils and 6,856 neighbourhoods. Source gaps, incompatible
    geography and invalid boundaries remain explicit; see the coverage page for available counts. A published numeric median
    meets ONS's minimum publication rule, but no transaction-count or confidence score is available
    in this release.
  </p>
  <p>
    The map's neutral band is <strong>−£100 through +£100 per year, inclusive</strong>. It is a visual
    threshold, not a confidence interval. Monthly and percentage displays retain that annual
    classification. Unavailable areas have a separate style, and the result panel keeps the actual
    amount and direction within the neutral band.
  </p>

  <h2 id="your-figures">Your own value and bill</h2>
  <p>
    Optional personal inputs replace the selected-home value or annual Council Tax baseline only.
    They do not change the area estimate or map colours. An unavailable area can support a separate
    personal comparison only when every missing dependency is replaced by a valid input. Resetting
    returns to the original area estimate, including its unavailable state.
  </p>

  <h2 id="buyers">Purchase-tax scope</h2>
  <p>
    Purchase comparisons use the reviewed England SDLT rules effective <strong>1 April 2025</strong>,
    checked on 26 September 2026. The selected property value is assumed to be the entire chargeable
    consideration. Supported scenarios assume UK-resident individual buyers, one main residence,
    no additional-property higher rates, and a freehold or existing assigned lease.
  </p>
  <p>
    First-time-buyer relief requires every purchaser to meet HMRC's conditions and the purchase price
    to be no more than £500,000. It does not silently become a standard calculation above that limit.
    Non-resident, company, trust, partnership, shared-ownership, mixed-use, linked or multiple-property,
    and new-lease cases are outside scope. Selecting a scenario is not a determination of eligibility.
    See <a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates">HMRC's residential rates</a>
    and <a href="https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29811">first-time-buyer conditions</a>.
  </p>

  <details id="precision">
    <summary>Precision and reproducibility</summary>
    <p>
      Source money is stored in pence; weighted values and intermediate results retain exact
      fractions. Comparison breakdowns round to pennies, and primary amounts to whole pounds with
      exact halves away from zero. SDLT follows its separate rule of rounding the summed tax down to
      a whole pound. Monthly conversion and map classification happen before display rounding.
    </p>
    <p>
      The current release uses methodology <code>phase0-v1</code>, policy <code>illustrative-ppt:1.0.0</code>,
      data <code>england-2026-09-26-v1</code> (with the original <code>sample-2026-09-26-v1</code> retained for old links) and purchase rules <code>sdlt-england-2025-04-01-v1</code>.
      Source references, dates and availability reasons remain attached to the results.
      Shared links also retain your property tax rate, comparison mode and ownership period. Links without a rate use 0.48%.
    </p>
  </details>
  <p>
    This application is an England data preview with incomplete coverage. See <a href="/data-sources">data sources and
    coverage</a> for the pinned editions, credits and data limitations, or
    <a href="/map">return to the map</a>.
  </p>
</article>
