<svelte:head>
  <title>How it works · Tax Map</title>
  <meta name="description" content="Compare Council Tax with an illustrative property tax, choose whether to include Stamp Duty, and use your own figures." />
</svelte:head>

<article class="prose">
  <p class="eyebrow">Understanding the estimate</p>
  <h1>How it works</h1>
  <p class="lead">Compare a typical home's Council Tax with an illustrative property tax. Use an area estimate or enter your own figures.</p>
  <p class="reading-actions"><a class="reading-action" href="/map">Explore the map →</a><a href="/data-sources">Data sources and coverage</a></p>

  <h2 id="using-the-map">Start in 3 steps</h2>
  <ol>
    <li><strong>Choose an area.</strong> Search by postcode or area name, or select a council or neighbourhood on the map. Leicester is shown as an example until you choose an area.</li>
    <li><strong>Choose your comparison.</strong> Open <strong>Comparison settings</strong> on a small screen. Keep Council Tax only, or include Stamp Duty when buying.</li>
    <li><strong>Read “Estimated tax change”.</strong> A minus means lower costs; a plus means higher costs.</li>
  </ol>

  <h2 id="scenario">What is being compared?</h2>
  <p>The illustrative annual property tax is <strong>property value × your chosen rate</strong>. The starting rate is <strong>0.48%</strong>; you can change it on the map.</p>
  <p>This assumes the new tax replaces Council Tax and any Stamp Duty included below. It is an uncapped illustration for an owner-occupied main home in England, not an enacted tax or a tenant's personal saving.</p>

  <h2 id="comparisons">Choose what to compare</h2>
  <p>Each option compares the following cost with one year of the illustrative property tax:</p>
  <dl>
    <dt>Council Tax only</dt>
    <dd>One year of Council Tax. This is the default.</dd>
    <dt>Include Stamp Duty · spread over years</dt>
    <dd><strong>Annual Council Tax + (Stamp Duty ÷ years of ownership).</strong> Starts at 20 years. Stamp Duty is still paid once when buying.</dd>
    <dt>Include Stamp Duty · purchase year</dt>
    <dd><strong>Annual Council Tax + all Stamp Duty.</strong> Shows the first-year change, with no monthly equivalent.</dd>
  </dl>

  <h2 id="your-figures">Use your own figures</h2>
  <p>Under <strong>Estimated tax change</strong>, select <strong>Use your own figures</strong>. Enter a home value, an annual Council Tax bill, or both, then select <strong>Update comparison</strong>. A blank field keeps the area figure.</p>
  <p><strong>Edit your figures</strong> changes them; <strong>Cancel</strong> discards edits. <strong>Reset to area figures</strong> restores the area estimate and keeps your comparison settings. Selecting another area clears personal figures. Map colours always use area figures.</p>
  <p>Amounts can include a £ sign and commas, such as <strong>£300,000</strong>. Your applied figures stay in this tab's memory while you read How it works or Data &amp; coverage. Use <strong>Return to your comparison</strong> to continue. Refreshing the page or opening a shared link clears personal figures.</p>

  <h2 id="unavailable">Why an estimate may be unavailable</h2>
  <p>Missing or incompatible data is never treated as zero or replaced with a council estimate. Your own figures can replace missing prices or bills, but cannot restore a comparison withheld for an invalid boundary.</p>

  <h2>More detail</h2>
  <details id="area-estimates">
    <summary>How area estimates are calculated</summary>
    <p>The home value is the area's median sale price for all property types. It describes homes sold during the source period, not today's value of an individual home.</p>
    <p>The Council Tax estimate weights bands A–H by the area's dwelling counts, then applies the council's average Band D charge, including precepts. It excludes personal discounts, exemptions, premiums and support, and does not reproduce each parish's exact bill.</p>
    <p>The band ratios are 6/9, 7/9, 8/9, 9/9, 11/9, 13/9, 15/9 and 18/9. We divide by the sum of included band counts, rather than the separately rounded published total.</p>
    <p>Council and neighbourhood estimates use independent inputs. Council results are not averages of neighbourhood medians. These typical-home changes cannot be added up to estimate revenue or household gains. Property-type comparisons are not yet supported.</p>
    <ul>
      <li><strong>Sale prices:</strong> 1 October 2024–30 September 2025.</li>
      <li><strong>Property stock:</strong> 31 March 2025.</li>
      <li><strong>Council Tax:</strong> 1 April 2026–31 March 2027.</li>
      <li><strong>Boundaries:</strong> 2021 neighbourhoods and May 2025 councils.</li>
    </ul>
    <p>These periods differ. No transaction count or confidence score is supplied in this release. See <a href="/data-sources/#coverage">coverage and source limitations</a>.</p>
  </details>
  <details>
    <summary>Reading and navigating the map</summary>
    <p>Zoom in for neighbourhoods and out for councils. In London view, neighbourhoods appear at the 2 km scale or closer. Panning or changing the map layer leaves your selected result unchanged.</p>
    <p>The neutral colour covers changes from <strong>−£100 to +£100, inclusive</strong>. It uses the annual change, except in purchase-year mode, which uses the first-year change including Stamp Duty. Monthly and percentage displays keep the same colour classification.</p>
    <p>This band is a visual threshold, not a confidence interval. The result panel shows the actual amount and direction. Unavailable areas have a separate style.</p>
  </details>
  <details id="buyers">
    <summary>Stamp Duty eligibility and limits</summary>
    <p>Purchase comparisons use England's Stamp Duty Land Tax (SDLT) rules effective <strong>1 April 2025</strong>, reviewed on 26 September 2026. The entered value is treated as the full purchase price.</p>
    <p>The web comparison assumes UK-resident individual buyers purchasing a freehold main home, with no additional-property higher rates. The calculation engine also supports an existing assigned lease.</p>
    <p><strong>First-time-buyer relief requires every buyer to qualify and a price of £500,000 or less.</strong> Above that limit, the comparison is unavailable; it does not switch to standard rates.</p>
    <p>Non-resident, company, trust, partnership, shared-ownership, mixed-use, linked, multiple-property and new-lease cases are outside scope. Choosing a buyer type does not establish eligibility. See <a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates">HMRC's residential rates</a> and <a href="https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29811">first-time-buyer conditions</a>.</p>
  </details>
  <details id="precision">
    <summary>Assumptions, rounding and source code</summary>
    <p>The default rate is informed by <a href="https://fairershare.org.uk/proportional-property-tax/">Fairer Share's proposal</a>. This is not the full proposal: transition caps, deferral, second-home rules and changes in who pays are excluded.</p>
    <p>Spreading Stamp Duty over years is a simple allocation. It excludes price growth, future tax changes, financing and discounting.</p>
    <p>Change = illustrative property tax − current comparison cost. Monthly equivalents divide the unrounded annual change by 12. Percentage change divides by the current comparison cost and is unavailable when that cost is zero.</p>
    <p>Money is stored in pence and intermediate calculations keep exact fractions. Breakdowns round to pennies and headline amounts to whole pounds, with exact halves rounded away from zero. SDLT is rounded down to a whole pound after summing its bands. Monthly conversion and map classification happen before display rounding.</p>
    <p>The current versions are methodology <code>phase0-v1</code>, policy <code>illustrative-ppt:1.0.0</code>, data <code>england-2026-09-26-v1</code> and purchase rules <code>sdlt-england-2025-04-01-v1</code>. Shared links keep your settings and data version; links without a rate use 0.48%. The original sample remains available for older links.</p>
    <p><a href="https://github.com/Lionel-Lim/tax-map" target="_blank" rel="noopener noreferrer">View the source code on GitHub <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a> to inspect the calculations and data pipeline.</p>
  </details>
  <p class="reading-actions"><a class="reading-action" href="/map">Explore the map →</a></p>
</article>
