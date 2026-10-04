<script lang="ts">
  import HelpPopover from './HelpPopover.svelte';
  import OverlayDialog from './OverlayDialog.svelte';
  import ComparisonHelp from './ComparisonHelp.svelte';
  import type { AreaRecord, ComparisonResult, MoneyAmount } from '$lib/domain/tax/index.js';
  import { resultPresentation } from '$lib/map/presentation.js';
  let { area, result, display = 'annual', hasPersonalFigures, personalInputsBusy = false, oneditfigures, onresetfigures }: {
    area: AreaRecord;
    result: ComparisonResult;
    display?: 'annual' | 'monthly' | 'percentage';
    hasPersonalFigures: boolean;
    personalInputsBusy?: boolean;
    oneditfigures: () => void;
    onresetfigures: () => void;
  } = $props();
  let editFiguresButton: HTMLButtonElement;
  let sourcesOpen = $state(false);
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
  <div class="panel-eyebrow"><span>ESTIMATED TAX CHANGE</span><span class="live-dot" aria-hidden="true"></span></div>
  <h2 id="impact-heading" tabindex="-1">{area.name}</h2>
  <div class="area-subtitle"><span aria-live="polite">{hasPersonalFigures ? 'Personal comparison · your figures' : `${area.geography === 'LAD' ? 'Council' : 'Neighbourhood'} estimate · area figures`}</span>
    <HelpPopover title="About this estimate" fallback="/methodology/#area-estimates">
      {#if hasPersonalFigures}<p>This comparison uses your entered figures. Any field left blank uses the area value, when available.</p>
      {:else}<p>This result uses the area’s median sale price and estimated average Council Tax bill. It is not a bill for a specific address.</p>{/if}
      <p>You can use your own property value and Council Tax bill. Your entries do not change the map’s area estimates.</p>
    </HelpPopover>
  </div>
  <div class="personal-actions">
    <button bind:this={editFiguresButton} type="button" disabled={personalInputsBusy} aria-haspopup="dialog" onclick={(event) => { event.currentTarget.focus({ preventScroll: true }); oneditfigures(); }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5M4 15 16 3a3.54 3.54 0 0 1 5 5L9 20l-6 1 1-6Z" /></svg>
      {hasPersonalFigures ? 'Edit your figures' : 'Use your own figures'}
    </button>
    {#if hasPersonalFigures}
      <button class="personal-reset" type="button" disabled={personalInputsBusy} onclick={() => { onresetfigures(); editFiguresButton.focus({ preventScroll: true }); }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" /></svg>
        Reset to area figures
      </button>
    {/if}
  </div>
  {#if hasPersonalFigures}<p class="personal-map-note">Area estimates on the map are unchanged.</p>{/if}
  {#if result.status === 'available'}
    {#if area.availability === 'unavailable'}
      <p class="notice">The area estimate is still unavailable on the map.</p>
    {/if}
    <div class="impact-number" class:lower={style.kind === 'lower'} class:higher={style.kind === 'higher'}>
      <span class="direction-label">{result.direction === 'unchanged' ? 'No estimated change' : `${result.direction === 'lower' ? '↓ Estimated decrease' : '↑ Estimated increase'}`}</span>
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
      <p>{isPurchase ? 'First-year costs only. This is not a recurring yearly change.' : `${result.monthlyEquivalent?.displayPounds} / month equivalent · ${result.difference.displayPounds} / year`}</p>
    </div>
    <div class="basis-note"><strong>{result.mode === 'annualised-ownership' ? `Purchase costs spread over ${result.ownershipYears} years` : isPurchase ? 'Costs in the purchase year' : 'Yearly costs without a purchase'}</strong>
      <HelpPopover title="About this comparison" fallback="/methodology/#comparisons"><ComparisonHelp mode={result.mode} /></HelpPopover>
    </div>
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
          <div><dt><span class="component-swatch stamp-duty" aria-hidden="true"></span>{isPurchase ? 'Stamp Duty · paid once' : `Stamp Duty ÷ ${result.ownershipYears} years`}
            {#if result.mode === 'annualised-ownership'}<HelpPopover title="Stamp Duty over time" fallback="/methodology/#comparisons"><p>{result.current.sdltUpfront.displayPounds} one-off Stamp Duty, spread over {result.ownershipYears} years.</p></HelpPopover>{/if}
          </dt><dd title={result.current.sdltIncluded.displayPrecise}>{result.current.sdltIncluded.displayPounds}</dd></div>
        {/if}
      </dl>
      <div class="bar-label"><span>Illustrative {result.propertyTaxRatePercent}% tax</span><strong>{result.scenario.total.displayPounds}</strong></div>
      <div class="bar-track" aria-hidden="true"><div class="bar scenario" style:width={`${chartPence(result.scenario.total) / maximum * 100}%`}></div></div>
    </figure>
    <dl class="input-summary">
      <div><dt>{result.provenance.valueSource === 'personal-input' ? 'Your property value' : 'Typical property value'}</dt><dd>{result.propertyValue.displayPounds}</dd></div>
      <div><dt>{result.provenance.councilTaxSource === 'personal-input' ? 'Your annual Council Tax' : 'Estimated annual Council Tax'}</dt><dd>{result.current.councilTax.displayPounds}</dd></div>
      {#if result.mode !== 'ongoing-owner'}<div><dt>Stamp Duty, paid once</dt><dd>{result.current.sdltUpfront.displayPounds}</dd></div>{/if}
      <div><dt>Illustrative annual property tax</dt><dd>{result.scenario.propertyTax.displayPounds}</dd></div>
    </dl>
    <div class="detail-action">
      <HelpPopover title="How this is calculated" text="How this is calculated" fallback="/methodology/#precision">
        <ol class="calculation-steps">
          <li><strong>Illustrative yearly tax:</strong> {result.propertyValue.displayPrecise} × {result.propertyTaxRatePercent}% = {result.scenario.propertyTax.displayPrecise}.</li>
          <li><strong>Current comparison cost:</strong> {result.current.total.displayPrecise}.
            <p>{result.mode === 'annualised-ownership' ? `Council Tax plus ${result.current.sdltIncluded.displayPrecise} in Stamp Duty per year, spread over ${result.ownershipYears} years.` : isPurchase ? 'Council Tax plus the full one-off Stamp Duty payment.' : 'Council Tax only.'}</p>
          </li>
          <li><strong>Estimated change:</strong> {result.scenario.total.displayPrecise} − {result.current.total.displayPrecise} = {result.difference.displayPrecise} {isPurchase ? 'in year one' : 'per year'}.</li>
        </ol>
        {#if result.monthlyEquivalent}<p>Monthly equivalent: {result.monthlyEquivalent.displayPrecise}. Calculated before rounding; this is not a monthly bill.</p>{/if}
        {#each result.assumptions as assumption}<p>{assumption}</p>{/each}
        <a href="/methodology/#precision">Read the full calculation method →</a>
      </HelpPopover>
    </div>
  {:else}
    <div class="unavailable-panel" role="status"><h3>{result.status === 'invalid-input' ? 'Check your inputs' : 'Area estimate unavailable'}</h3>
      {#each result.issues as issue}<p>{quality[issue.code] ?? issue.message}</p>{/each}
      {#each result.reasons.filter(reason => !result.issues.some(issue => issue.code === reason)) as reason}<p>{quality[reason] ?? reason.replaceAll('-', ' ')}</p>{/each}
      <p>Missing data is not counted as zero. We do not substitute a council estimate.</p>
      {#each result.guidanceUrls as url}<a href={url} target="_blank" rel="noreferrer">Read official SDLT guidance ↗</a>{/each}
    </div>
  {/if}
  <div class="source-note"><strong>Illustrative estimate · owner-occupied main home only.</strong>
    <HelpPopover title="Who this covers" fallback="/methodology/#scenario">
      <p>This illustration covers a main home lived in by its owner. It does not estimate a tenant’s personal costs.</p>
      <p>It assumes an uncapped property tax replacing Council Tax and, in the supported purchase comparisons, Stamp Duty.</p>
    </HelpPopover>
  </div>
  <div class="detail-action">
    <HelpPopover title="Data behind this estimate" text="Data behind this estimate" fallback="/data-sources/">
      <p><strong>Area:</strong> {area.name} · {area.code}</p>
      <dl class="source-dates"><div><dt>Sale prices</dt><dd>Year ending September 2025</dd></div><div><dt>Housing stock</dt><dd>31 March 2025</dd></div><div><dt>Council Tax</dt><dd>2026–27</dd></div><div><dt>Postcode directory</dt><dd>May 2025</dd></div></dl>
      <p>These sources cover different dates and groups of homes. They do not identify an individual home’s Council Tax band.</p>
      {#each [...new Set([...area.qualityFlags, ...area.unavailableReasons])] as flag}<p>{quality[flag] ?? flag.replaceAll('-', ' ')}</p>{/each}
      <button type="button" class="text-action" aria-haspopup="dialog" onclick={(event) => { event.currentTarget.focus({ preventScroll: true }); sourcesOpen = true; }}>View source records →</button>
    </HelpPopover>
  </div>
  <OverlayDialog bind:open={sourcesOpen} title="Source records">
    <p><strong>{area.name}</strong> · {area.code}</p>
    <p>Data: {result.provenance?.dataVersion ?? 'sample-2026-09-26-v1'}<br />Policy: {result.requestedPolicyVersion}<br />{result.status === 'available' && result.sdltRuleVersion ? `SDLT: ${result.sdltRuleVersion}` : ''}</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus allows scrolling the source records.) -->
    <pre aria-label="Area source references" tabindex="0">{JSON.stringify(area.sourceRefs, null, 2)}</pre>
    <a href="/data-sources/">Data & coverage →</a>
  </OverlayDialog>
</section>

<style>
  .bar-track { height: 14px; }
  .current-stack { display: flex; }
  .current-stack .bar { flex: 0 0 auto; border-radius: 0; }
  .council-tax { background: #8b9786; }
  .stamp-duty { background: #bc965a; }
  .current-components { margin: 9px 0 0; font-size: .78rem; }
  .current-components > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; margin-top: 5px; }
  .current-components dt { display: flex; align-items: baseline; gap: 6px; color: var(--muted); }
  .current-components dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .component-swatch { display: inline-block; width: 9px; height: 9px; flex-shrink: 0; border-radius: 2px; }
</style>
