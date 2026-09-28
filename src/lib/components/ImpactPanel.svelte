<script lang="ts">
  import type { AreaRecord, ComparisonResult, MoneyAmount } from '$lib/domain/tax/index.js';
  import { geographyLabel, resultPresentation } from '$lib/map/presentation.js';
  let { area, result, display = 'annual' }: { area: AreaRecord; result: ComparisonResult; display?: 'annual' | 'monthly' | 'percentage' } = $props();
  const quality: Record<string,string> = {
    'authority-average-charge-proxy': 'Council-average charges; local parish bills may differ.',
    'mixed-source-periods': 'Price, stock and tax inputs refer to different dates.',
    'rounded-stock-counts': 'Housing-stock counts are rounded in the source.',
    'boundary-invalid': 'The published neighbourhood boundary fails geometry validation. Its estimate is withheld until the source shape is reviewed.',
    'geometry-unavailable': 'This neighbourhood has no validated map shape in this release.',
    'geography-needs-review': 'The source geographies or charging authority assignments are incompatible; no estimate is substituted.',
    'stock-unavailable': 'Compatible housing-stock counts are unavailable for this area.',
    'stock-marker-unverified': 'A stock-count marker has an unverified meaning; no estimate is substituted.',
  };
  const pounds = (v: string) => v.replace(/^[+-]/, '');
  // Floating-point conversion is only for chart pixels; money comes from the exact engine result.
  const chartPence = (amount: MoneyAmount) => Number(amount.exactPence.numerator) / Number(amount.exactPence.denominator);
  let style = $derived(resultPresentation(result));
  let isPurchase = $derived(result.status === 'available' && result.mode === 'purchase-year');
  let maximum = $derived(result.status === 'available' ? Math.max(chartPence(result.current.total), chartPence(result.scenario.total), 1) : 1);
</script>

<section class="impact-panel" aria-labelledby="impact-heading" data-testid="impact-panel">
  <div class="panel-eyebrow"><span>TYPICAL HOME IMPACT</span><span class="live-dot" aria-hidden="true"></span></div>
  <h2 id="impact-heading">{area.name}</h2>
  <p class="area-subtitle">{geographyLabel(area.geography)} estimate <span>· {area.code}</span></p>
  {#if result.status === 'available'}
    {#if result.estimateKind === 'personal-comparison'}
      <p class="notice personal-label">Personal calculation · entered values apply only to this home.</p>
    {/if}
    {#if area.availability === 'unavailable'}
      <p class="notice">The original area estimate is unavailable. Its map colour remains unavailable.</p>
    {/if}
    <div class="impact-number" class:lower={style.kind === 'lower'} class:higher={style.kind === 'higher'}>
      <span class="direction-label">{result.direction === 'unchanged' ? 'No estimated change' : `${result.direction === 'lower' ? '↓ Lower' : '↑ Higher'} estimated cost`}</span>
      <div class="big-number" data-testid="primary-difference">
        {#if display === 'percentage'}
          {result.percentageDifference ? result.percentageDifference.display.replace(/^[+-]/, '') : 'Not defined'}
        {:else if display === 'monthly' && !isPurchase}
          {pounds(result.monthlyEquivalent!.displayPounds)}
        {:else}
          {pounds(result.difference.displayPounds)}
        {/if}
        <span>{display === 'percentage' ? 'vs current cost' : isPurchase ? 'in the purchase year' : display === 'monthly' ? '/ month equivalent' : '/ year'}</span>
      </div>
      <p>{isPurchase ? 'First-year cash-cost comparison; this is not a recurring saving.' : `${result.monthlyEquivalent?.displayPounds} / month equivalent · ${result.difference.displayPounds} / year`}</p>
    </div>
    <div class="basis-note"><strong>{result.mode === 'annualised-ownership' ? `Annualised over ${result.ownershipYears} years` : isPurchase ? 'Purchase-year comparison' : 'Ongoing-owner comparison'}</strong><br />{result.mode === 'annualised-ownership' ? 'Council Tax + one-off Stamp Duty spread evenly over ownership.' : isPurchase ? 'Annual Council Tax + one-off Stamp Duty in the current system.' : 'Annual Council Tax compared with the illustrative annual property tax.'}</div>
    <figure class="comparison-chart" aria-label="Current and illustrative tax cost comparison">
      <figcaption>{isPurchase ? 'First-year tax cost' : 'Annual tax cost'} <span>GBP</span></figcaption>
      <div class="bar-label"><span>Current system</span><strong>{result.current.total.displayPounds}</strong></div>
      <div class="bar-track current-stack" aria-hidden="true">
        <div class="bar council-tax" style:width={`${chartPence(result.current.councilTax) / maximum * 100}%`}></div>
        {#if result.mode !== 'ongoing-owner'}<div class="bar stamp-duty" style:width={`${chartPence(result.current.sdltIncluded) / maximum * 100}%`}></div>{/if}
      </div>
      <dl class="current-components" aria-label="Current system breakdown">
        <div><dt><span class="component-swatch council-tax" aria-hidden="true"></span>Council Tax</dt><dd title={result.current.councilTax.displayPrecise}>{result.current.councilTax.displayPounds}</dd></div>
        {#if result.mode !== 'ongoing-owner'}
          <div><dt><span class="component-swatch stamp-duty" aria-hidden="true"></span>{isPurchase ? 'Stamp Duty · paid once' : `Stamp Duty ÷ ${result.ownershipYears} years`}</dt><dd title={result.current.sdltIncluded.displayPrecise}>{result.current.sdltIncluded.displayPounds}</dd></div>
        {/if}
      </dl>
      {#if result.mode === 'annualised-ownership'}<p class="chart-note">{result.current.sdltUpfront.displayPounds} one-off Stamp Duty, spread over {result.ownershipYears} years.</p>{/if}
      <div class="bar-label"><span>0.48% scenario</span><strong>{result.scenario.total.displayPounds}</strong></div>
      <div class="bar-track" aria-hidden="true"><div class="bar scenario" style:width={`${chartPence(result.scenario.total) / maximum * 100}%`}></div></div>
    </figure>
    <dl class="input-summary">
      <div><dt>{result.provenance.valueSource === 'personal-input' ? 'Your property value' : 'Typical property value'}</dt><dd>{result.propertyValue.displayPounds}</dd></div>
      <div><dt>{result.provenance.councilTaxSource === 'personal-input' ? 'Your annual Council Tax' : 'Estimated annual Council Tax'}</dt><dd>{result.current.councilTax.displayPounds}</dd></div>
      {#if result.mode !== 'ongoing-owner'}<div><dt>Stamp Duty, paid once</dt><dd>{result.current.sdltUpfront.displayPounds}</dd></div>{/if}
      <div><dt>Illustrative annual property tax</dt><dd>{result.scenario.propertyTax.displayPounds}</dd></div>
    </dl>
    <details class="breakdown"><summary>Calculation & precise figures</summary>
      <p>Property value × 0.0048 = {result.scenario.propertyTax.displayPrecise} per year.</p>
      <p>Current comparison cost: {result.current.total.displayPrecise}. {result.mode === 'annualised-ownership' ? `Includes ${result.current.sdltIncluded.displayPrecise} in annualised Stamp Duty.` : ''}</p>
      <p>Scenario − current = {result.difference.displayPrecise}{isPurchase ? ' in year one' : ' per year'}.</p>
      {#if result.monthlyEquivalent}<p>Monthly equivalent: {result.monthlyEquivalent.displayPrecise}. Calculated before rounding, not a billing schedule.</p>{/if}
      <p>Map class: {style.label}. A neutral colour means within £100 of current cost; it is not a confidence interval.</p>
      {#each result.assumptions as assumption}<p>{assumption}</p>{/each}
    </details>
  {:else}
    <div class="unavailable-panel" role="status"><h3>{result.status === 'invalid-input' ? 'Check the comparison inputs' : 'Area estimate unavailable'}</h3>
      {#each result.issues as issue}<p>{quality[issue.code] ?? issue.message}</p>{/each}
      {#each result.reasons.filter(reason => !result.issues.some(issue => issue.code === reason)) as reason}<p>{quality[reason] ?? reason.replaceAll('-', ' ')}</p>{/each}
      <p>Missing data is never treated as zero. A council estimate is not substituted.</p>
      {#each result.guidanceUrls as url}<a href={url} target="_blank" rel="noreferrer">Read official SDLT guidance ↗</a>{/each}
    </div>
  {/if}
  <div class="source-note"><strong>Owner-occupied primary residence only.</strong> Illustrative, uncapped replacement of Council Tax and supported purchase SDLT. This does not estimate a tenant’s personal costs.</div>
  <details class="breakdown"><summary>Source dates & estimate quality</summary>
    <dl class="source-dates"><div><dt>Sale prices</dt><dd>Year ending September 2025</dd></div><div><dt>Housing stock</dt><dd>31 March 2025</dd></div><div><dt>Council Tax</dt><dd>2026–27</dd></div><div><dt>Postcode directory</dt><dd>May 2025</dd></div></dl>
    {#each [...new Set([...area.qualityFlags, ...area.unavailableReasons])] as flag}<p>{quality[flag] ?? flag.replaceAll('-', ' ')}</p>{/each}
    <p>The median sale value and stock-weighted gross bill describe different populations. Neither identifies the Council Tax band of a particular home.</p>
    <p>Data: {result.provenance?.dataVersion ?? 'sample-2026-09-26-v1'}<br />Policy: {result.requestedPolicyVersion}<br />{result.status === 'available' && result.sdltRuleVersion ? `SDLT: ${result.sdltRuleVersion}` : ''}</p>
    <details><summary>Area source references</summary><pre>{JSON.stringify(area.sourceRefs, null, 2)}</pre></details>
    <a href="/methodology/">Read the methodology →</a>
  </details>
</section>

<style>
  .bar-track { height: 14px; }
  .current-stack { display: flex; }
  .current-stack .bar { flex: 0 0 auto; border-radius: 0; }
  .council-tax { background: #8b9786; }
  .stamp-duty { background: #bc965a; }
  .current-components { margin: 9px 0 0; font-size: .66rem; }
  .current-components > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; margin-top: 5px; }
  .current-components dt { display: flex; align-items: baseline; gap: 6px; color: var(--muted); }
  .current-components dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .component-swatch { display: inline-block; width: 9px; height: 9px; flex-shrink: 0; border-radius: 2px; }
  .chart-note { margin: 8px 0 0; font-size: .62rem; line-height: 1.5; color: var(--muted); }
</style>
