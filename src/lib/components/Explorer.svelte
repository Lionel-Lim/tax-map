<script lang="ts">
  import { getContext, onMount, tick } from 'svelte';
  import { beforeNavigate, pushState, replaceState } from '$app/navigation';
  import { COMPARISON_SESSION, type ComparisonDraft, type ComparisonSession } from '$lib/comparison-session.js';
  import { parsePoundsInput, formatPoundsInput } from '$lib/data/currency-input.js';
  import type { AreaComparisonOptions, ComparisonResult } from '$lib/domain/tax/index.js';
  import { compareArea, isPropertyTaxRatePercent } from '$lib/domain/tax/index.js';
  import { loadRelease, createPostcodeLookup, parseSharedState, serializeSharedState, DEFAULT_STATE, stateToComparisonOptions } from '$lib/data/index.js';
  import type { SharedState } from '$lib/data/index.js';
  import TaxMap from '$lib/map/TaxMap.svelte';
  import MapLegend from '$lib/map/MapLegend.svelte';
  import { resultPresentation, geographyLabel } from '$lib/map/presentation.js';
  import ImpactPanel from './ImpactPanel.svelte';
  import HelpPopover from './HelpPopover.svelte';
  import OverlayDialog from './OverlayDialog.svelte';
  import ComparisonHelp from './ComparisonHelp.svelte';

  let scenario = $state<SharedState>({ ...DEFAULT_STATE });
  const session = getContext<ComparisonSession>(COMPARISON_SESSION);
  let isExample = $state(true);
  let settingsOpen = $state(true);
  let release = $state<Awaited<ReturnType<typeof loadRelease>> | null>(null);
  let lookup: ReturnType<typeof createPostcodeLookup> | null = null;
  let loading = $state(true);
  let loadError = $state('');
  let linkError = $state('');
  let settingsError = $state('');
  let postcodeInput = $state('');
  let postcodeMessage = $state('');
  let postcodeStatus = $state('');
  let postcodeBusy = $state(false);
  let postcodeLocation = $state<[number, number] | null>(null);
  let matchedPostcode = $state<string | null>(null);
  let search = $state('');
  let listLimit = $state(12);
  let valueInput = $state('');
  let billInput = $state('');
  let personalErrors = $state({ value: '', bill: '' });
  let personalOpen = $state(false);
  let shareOpen = $state(false);
  let overrides = $state<AreaComparisonOptions['overrides']>({});
  let hasPersonalFigures = $derived(overrides?.propertyValuePence !== undefined || overrides?.annualCouncilTaxPence !== undefined);
  let shareUrl = $state('');
  let shareMessage = $state('');
  let includePostcode = $state(false);
  let detailParent = $state<string | null>(null);
  let detailLoading = $state(false);
  let detailError = $state('');
  let areaLoading = $state(false);
  let areaError = $state('');
  let failedDetailParent: string | null = null;
  let lookupGeneration = 0;
  let detailGeneration = 0;

  let options = $derived(stateToComparisonOptions(scenario));
  let rateValid = $derived(isPropertyTaxRatePercent(scenario.propertyTaxRatePercent));
  let yearsValid = $derived(Number.isSafeInteger(scenario.ownershipYears) && scenario.ownershipYears > 0);
  let areaResults = $derived.by(() => {
    const result: Record<string, ComparisonResult> = {};
    if (!linkError) for (const area of release?.areas ?? []) result[area.code] = compareArea(area, options);
    return result;
  });
  let selected = $derived(release?.areas.find(area => area.code === scenario.areaCode));
  let selectedResult = $derived(selected && !linkError ? compareArea(selected, { ...options, overrides }) : null);
  let parentCouncil = $derived(selected?.parentCode ? release?.areaByCode.get(selected.parentCode) : undefined);
  // These are input gaps that compareArea permits personal figures to replace.
  const replaceableReasons = new Set(['price-unavailable', 'stock-marker-unverified', 'stock-suppressed',
    'stock-unavailable', 'stock-total-unavailable', 'stock-denominator-zero', 'stock-total-nonpositive',
    'charge-unavailable', 'council-tax-unavailable', 'geography-needs-review', 'source-value-unrecognised']);
  let canUsePersonalFigures = $derived(Boolean(selected?.unavailableReasons.every(reason => replaceableReasons.has(reason))));
  let filteredAreas = $derived.by(() => {
    const query = search.toLowerCase().trim();
    const matches = new Set((release?.search ?? []).filter(item => item.terms.some(term => term.toLowerCase().includes(query))).map(item => item.code));
    return (release?.search ?? []).filter(area => (query || area.geography === scenario.geography)
      && (!query || matches.has(area.code) || `${area.name} ${area.code}`.toLowerCase().includes(query))
      && (query || scenario.geography !== 'MSOA' || !detailParent || area.parentCode === detailParent))
      .sort((a,b) => {
        const rank = (area: typeof a) => area.name.toLowerCase() === query || area.code.toLowerCase() === query ? 0
          : area.name.toLowerCase().startsWith(query) ? 1 : 2;
        return (query ? rank(a) - rank(b) : 0) || a.name.localeCompare(b.name);
      });
  });
  let isEngland = $derived(release?.manifest.scope === 'england');
  function syncAreas(current: NonNullable<typeof release>) {
    if (release?.manifest.releaseId === current.manifest.releaseId) release = { ...current, areas: [...current.areaByCode.values()] };
  }
  async function requestDistrict(code: string) {
    if (!release || release.manifest.scope !== 'england') return;
    const current = release, generation = ++detailGeneration;
    detailLoading = true; detailError = ''; failedDetailParent = code;
    try {
      await current.loadDistrict(code);
      if (generation !== detailGeneration || current.manifest.releaseId !== release?.manifest.releaseId) return;
      syncAreas(current); detailParent = code; failedDetailParent = null;
    } catch (error) { if (generation === detailGeneration) detailError = error instanceof Error ? error.message : 'Neighbourhood data could not be loaded.'; }
    finally { if (generation === detailGeneration) detailLoading = false; }
  }
  function changeGeography() {
    listLimit = 12; remember();
    if (scenario.geography === 'MSOA' && selected) void requestDistrict(selected.parentCode ?? selected.code);
  }

  function resetPersonal() { overrides = {}; valueInput = ''; billInput = ''; personalErrors = { value: '', bill: '' }; personalOpen = false; }
  function openPersonal() {
    valueInput = formatPoundsInput(overrides?.propertyValuePence);
    billInput = formatPoundsInput(overrides?.annualCouncilTaxPence);
    personalErrors = { value: '', bill: '' };
    personalOpen = true;
  }
  function clearShared() { shareUrl = ''; shareMessage = ''; shareOpen = false; }
  function remember() {
    clearShared();
    try {
      const query = serializeSharedState(scenario);
      settingsError = '';
      pushState(`${window.location.pathname}?${query}`, {});
    } catch (error) { settingsError = (error as Error).message; }
  }
  function changeSetting() {
    if (scenario.mode !== 'annualised-ownership' && !yearsValid) scenario.ownershipYears = DEFAULT_STATE.ownershipYears;
    if (scenario.mode === 'purchase-year' && scenario.display === 'monthly') scenario.display = 'annual';
    remember();
  }
  async function revealSelection() {
    await tick();
    const mobile = window.matchMedia('(max-width: 960px)').matches;
    const target = document.getElementById(mobile ? 'explore-map' : 'impact-heading');
    target?.focus({ preventScroll: true });
    if (mobile) target?.scrollIntoView({ block: 'start' });
  }
  async function selectArea(code: string) {
    if (!release) return;
    const current = release, generation = ++lookupGeneration;
    loading = false; loadError = '';
    areaLoading = true; areaError = ''; postcodeBusy = false; postcodeLocation = null; matchedPostcode = null; postcodeMessage = ''; postcodeStatus = ''; includePostcode = false;
    resetPersonal(); clearShared();
    try {
      const area = await current.ensureArea(code);
      if (generation !== lookupGeneration || current.manifest.releaseId !== release?.manifest.releaseId) return;
      if (!area) throw new Error('This area is not in the selected data release.');
      syncAreas(current);
      scenario = { ...scenario, areaCode: code, geography: area.geography, postcode: null };
      isExample = false;
      search = '';
      if (area.geography === 'MSOA') { detailParent = area.parentCode; detailGeneration++; detailLoading = false; detailError = ''; }
      remember();
      void revealSelection();
    } catch (error) { if (generation === lookupGeneration) areaError = error instanceof Error ? error.message : 'Area data could not be loaded. Select the area to retry.'; }
    finally { if (generation === lookupGeneration) areaLoading = false; }
  }
  async function findPostcode(input = postcodeInput, saveHistory = true) {
    if (!lookup) return;
    clearShared();
    const generation = ++lookupGeneration, current = release;
    loading = false; loadError = '';
    areaLoading = false; areaError = '';
    postcodeBusy = true; postcodeMessage = ''; postcodeStatus = ''; matchedPostcode = null; postcodeLocation = null; includePostcode = false;
    const response = await lookup.lookup(input);
    if (generation !== lookupGeneration) return;
    if (current) syncAreas(current);
    postcodeBusy = false;
    postcodeStatus = response.status;
    postcodeMessage = response.message;
    if ((response.status === 'found' || response.status === 'unavailable-area') && response.record && response.area) {
      const record = response.record;
      matchedPostcode = record.postcode;
      postcodeInput = record.postcode;
      scenario = { ...scenario, areaCode: response.area.code, geography: 'MSOA', postcode: null };
      isExample = false;
      search = '';
      detailParent = response.area.parentCode; detailGeneration++; detailLoading = false; detailError = '';
      resetPersonal();
      if (record.longitude !== null && record.latitude !== null) postcodeLocation = [record.longitude, record.latitude];
      } else {
      scenario = { ...scenario, areaCode: null, postcode: null };
      resetPersonal();
    }
    if (saveHistory) { remember(); if (response.area) void revealSelection(); }
  }
  function applyPersonal() {
    personalErrors = { value: '', bill: '' };
    let value: number | undefined, bill: number | undefined;
    try { value = parsePoundsInput(valueInput); } catch (error) { personalErrors.value = (error as Error).message; }
    try { bill = parsePoundsInput(billInput); } catch (error) { personalErrors.bill = (error as Error).message; }
    if (personalErrors.value || personalErrors.bill) return;
    overrides = { ...(value !== undefined ? { propertyValuePence: value } : {}), ...(bill !== undefined ? { annualCouncilTaxPence: bill } : {}) };
    clearShared(); personalOpen = false;
  }
  function createShare() {
    try {
      const query = serializeSharedState(scenario, { includePostcode, postcode: matchedPostcode ?? undefined });
      shareUrl = `${window.location.origin}/map/?${query}`;
      shareMessage = 'Link ready. Your entered figures are excluded.'; shareOpen = true;
    } catch (error) { shareMessage = (error as Error).message; }
  }
  async function copyShare() {
    try { await navigator.clipboard.writeText(shareUrl); shareMessage = 'Link copied. Your entered figures are excluded.'; }
    catch { shareMessage = 'Copy this link manually.'; }
  }
  async function readLocation(draft?: ComparisonDraft) {
    const generation = ++lookupGeneration;
    detailGeneration++; detailParent = null; detailLoading = false; detailError = ''; areaLoading = false; areaError = '';
    postcodeBusy = false; postcodeMessage = ''; postcodeStatus = ''; postcodeLocation = null; matchedPostcode = null;
    resetPersonal(); clearShared(); includePostcode = false;
    const parsed = draft ? { ok: true as const, state: draft.scenario } : parseSharedState(window.location.search);
    if (!parsed.ok) { linkError = parsed.errors.join(' '); return; }
    settingsError = '';
    postcodeInput = '';
    search = ''; listLimit = 12;
    linkError = '';
    if (!release || release.manifest.releaseId !== parsed.state.dataVersion) {
      loading = true;
      release = null; lookup = null;
      const loaded = await loadRelease({ dataVersion: parsed.state.dataVersion });
      if (generation !== lookupGeneration) return;
      release = loaded; lookup = createPostcodeLookup(loaded);
    }
    scenario = { ...parsed.state };
    isExample = draft?.isExample ?? !new URLSearchParams(window.location.search).has('area');
    if (scenario.areaCode) {
      if (!release.searchByCode.has(scenario.areaCode)) { linkError = 'This shared area is not part of the requested data release.'; loading = false; return; }
      const current = release, area = await current.ensureArea(scenario.areaCode);
      if (generation !== lookupGeneration) return;
      syncAreas(current);
      if (area?.geography === 'MSOA') detailParent = area.parentCode;
      else if (scenario.geography === 'MSOA' && area) await requestDistrict(area.code);
    }
    if (generation !== lookupGeneration) return;
    loading = false;
    if (draft) {
      overrides = { ...draft.overrides };
      postcodeInput = draft.postcodeInput; matchedPostcode = draft.matchedPostcode;
      postcodeLocation = draft.postcodeLocation; postcodeMessage = draft.postcodeMessage;
      postcodeStatus = draft.postcodeStatus; search = draft.search; settingsError = draft.settingsError;
      if (settingsError) settingsOpen = true;
      replaceState(`${window.location.pathname}${draft.query}`, {});
    } else if (scenario.postcode) { postcodeInput = scenario.postcode; await findPostcode(scenario.postcode, false); }
  }
  async function initialise(draft?: ComparisonDraft) {
    const generation = lookupGeneration + 1;
    loading = true; loadError = '';
    try {
      await readLocation(draft);
    } catch (error) {
      if (generation === lookupGeneration) loadError = error instanceof Error ? error.message : 'The data could not be loaded.';
    }
    if (generation === lookupGeneration) loading = false;
  }
  function useCurrentData() {
    pushState(window.location.pathname, {});
    linkError = ''; void initialise();
  }
  beforeNavigate(({ to, willUnload }) => {
    if (willUnload || !to || !/^\/(methodology|data-sources)\/?$/.test(to.url.pathname) || !release || linkError || loading) return;
    session.saved = {
      query: window.location.search, scenario: { ...scenario }, overrides: { ...overrides },
      postcodeInput, matchedPostcode, postcodeLocation, postcodeMessage, postcodeStatus,
      search, isExample, settingsError,
    };
  });
  onMount(() => {
    const draft = session.resume ? session.saved ?? undefined : undefined;
    session.resume = false;
    const narrow = window.matchMedia('(max-width: 960px)');
    settingsOpen = !narrow.matches;
    const resizeSettings = () => { if (!narrow.matches) settingsOpen = true; };
    narrow.addEventListener('change', resizeSettings);
    void initialise(draft);
    const onBack = () => { void initialise(); };
    window.addEventListener('popstate', onBack);
    return () => { lookupGeneration++; detailGeneration++; window.removeEventListener('popstate', onBack); narrow.removeEventListener('change', resizeSettings); };
  });
</script>

{#snippet areaList()}
      <ul class="area-list">{#each filteredAreas.slice(0, listLimit) as area}{@const result = areaResults[area.code]}{@const presentation = result || area.availability === 'unavailable' ? resultPresentation(result) : {kind: 'unloaded', colour: '#bcc8be', label: 'Select to calculate'}}<li><button data-area-code={area.code} data-kind={presentation.kind} class:selected={scenario.areaCode === area.code} aria-pressed={scenario.areaCode === area.code} onclick={() => selectArea(area.code)}><span class="list-dot" style:background={presentation.colour}></span><span class="area-name">{area.name}<small>{geographyLabel(area.geography)} · {area.code}</small></span><span class="area-impact">{result?.status === 'available' ? scenario.display === 'percentage' ? result.percentageDifference?.display ?? 'Not defined' : scenario.display === 'monthly' && result.monthlyEquivalent ? result.monthlyEquivalent.displayPounds : result.difference.displayPounds : !result && area.availability === 'available' ? 'View estimate' : 'Unavailable'}<small>{presentation.label}</small></span><span aria-hidden="true">↗</span></button></li>{/each}</ul>
      {#if !filteredAreas.length}<p role="status">No matching areas. Try a different name, an area code or a full postcode.</p>{/if}
      {#if filteredAreas.length > listLimit}<button class="show-more" onclick={() => listLimit += 24}>Show more areas</button>{/if}
{/snippet}

{#snippet buyerHelp()}
  <p>This model assumes UK-resident individuals buying one main home as a freehold purchase.</p>
  <p>It excludes additional-property surcharges, shared ownership, linked transactions and new lease rent.</p>
  <p>For the first-time-buyer option, every purchaser must meet HMRC’s eligibility rules.</p>
  <a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates" target="_blank" rel="noreferrer">Check official Stamp Duty guidance ↗</a>
{/snippet}

<section class="explorer-heading">
  <div>
    <h1>See how property tax could change</h1>
    <div class="lead">Compare Council Tax with an illustrative <strong>annual property tax.</strong> Find your area, choose a rate, or use your own figures.
      <HelpPopover title="About this scenario" label="About the property tax scenario" fallback="/methodology/#scenario">
        <p>The annual tax is the property value multiplied by your chosen rate. The default rate is 0.48%.</p>
        <p>This illustration assumes it replaces Council Tax and, for the purchase comparisons, Stamp Duty. It has no transition cap.</p>
        <p>It is not an enacted tax. The estimate covers an owner-occupied main home.</p>
        <a href="/methodology/#scenario">Read how the estimate works →</a>
      </HelpPopover>
    </div>
  </div>
  <div class="coverage-stamp"><strong>{release?.manifest.coverage.LAD.available ?? 293}</strong><span>{isEngland || !release ? 'English council estimates' : 'sample council estimates'}<br />{(release?.manifest.coverage.MSOA.available ?? 2961).toLocaleString('en-GB')} neighbourhood estimates</span></div>
</section>

{#if release && !isEngland}<p class="archive-notice">This shared link uses the original five-council release. <a href="/map/" onclick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); useCurrentData(); } }}>Explore the new England-wide data →</a></p>{/if}
<noscript><p class="notice">Enable JavaScript to search and calculate. The <a href="/methodology/">methodology</a> and <a href="/data-sources/">source pages</a> remain available.</p></noscript>
{#if loading}<div class="loading-state" role="status">Loading the verified data…</div>{/if}
{#if loadError}<section class="error-state" role="alert"><h2>Data could not be loaded</h2><p>{loadError}</p><button onclick={() => initialise()}>Retry loading data</button></section>{/if}
{#if linkError}<section class="error-state" role="alert"><h2>This shared comparison cannot be opened</h2><p>{linkError}</p><p>No result has been recalculated with different versions.</p><button onclick={useCurrentData}>Open current England data</button></section>{/if}

{#if release && !linkError}
  <div class="sr-only" role="status" aria-live="polite">{selected ? `${selected.name}, ${geographyLabel(selected.geography)}. ${selectedResult?.status === 'available' ? `${selectedResult.difference.displayPounds} ${scenario.mode === 'purchase-year' ? 'in the purchase year' : 'per year'}.` : 'Estimate unavailable.'}` : 'Choose an area to compare.'}</div>
  <div class="explorer-grid">
    <div class="postcode-search">
      <div class="search-toolbar" id="find-area">
        <form onsubmit={(event) => { event.preventDefault(); void findPostcode(); }}>
          <div class="field-label"><label for="postcode">Find your area</label><HelpPopover title="About postcode search" fallback="/data-sources/#postcodes">
            <p>Search uses the May 2025 postcode directory. Newer postcodes may be missing.</p>
            <p>The first part of your postcode selects a data file to download. Your browser then matches the full postcode locally.</p>
            <p>Search finds a neighbourhood estimate, not a bill for your address. Some neighbourhoods have no estimate.</p>
          </HelpPopover></div>
          <div class="input-button"><input id="postcode" aria-label="Postcode" autocomplete="postal-code" placeholder="Enter a postcode" bind:value={postcodeInput} /><button class="primary" disabled={postcodeBusy} type="submit">{postcodeBusy ? 'Finding…' : 'Find area'}<span aria-hidden="true">→</span></button></div>
        </form>
      </div>
      {#if postcodeMessage}<p class="postcode-status" class:warning={postcodeStatus !== 'found'} role="status" data-testid="postcode-status">{postcodeMessage}</p>{/if}
      {#if areaLoading}<p class="postcode-status" role="status">Loading the selected area…</p>{/if}
      {#if areaError}<p class="postcode-status warning" role="alert">{areaError} Select the area to retry.</p>{/if}
    </div>
    <section class="map-column" id="explore-map" tabindex="-1" aria-label="Explore areas">
      <div class="map-toolbar"><div class="control-field geography-control">
          <div class="field-label"><label for="map-geography">Map areas</label><HelpPopover title="Council or neighbourhood?" fallback="/methodology/#area-estimates">
            <p>Council estimates cover a local authority. Neighbourhood estimates cover a smaller statistical area, called an MSOA.</p>
            <p>Each uses its own price and Council Tax data. A council estimate does not replace a missing neighbourhood estimate.</p>
            <p>Zooming can change the map layer. Your selected result changes when you choose another area.</p>
          </HelpPopover></div>
          <select id="map-geography" bind:value={scenario.geography} onchange={changeGeography}><option value="LAD">Council areas</option><option value="MSOA">Neighbourhoods</option></select>
        </div><a href="#find-area">Change area ↑</a></div>
      <TaxMap scope={release.manifest.scope === 'england' ? 'england' : 'five-authority-sample'} {detailParent} {detailLoading} ondetailrequest={requestDistrict} areas={release.areas} results={areaResults} selectedCode={scenario.areaCode} geography={scenario.geography} onselect={selectArea} ongeographychange={(geography) => { scenario.geography = geography; listLimit = 12; clearShared(); try { replaceState(`${window.location.pathname}?${serializeSharedState(scenario)}`, {}); } catch { /* Invalid draft inputs do not enter history. */ } }} {postcodeLocation} releaseBase={release.basePath} />
      {#if detailLoading}<p class="postcode-status" role="status">Loading neighbourhood estimates…</p>{/if}
      {#if detailError}<div class="postcode-status warning" role="alert"><p>{detailError}</p><button onclick={() => { if (failedDetailParent) void requestDistrict(failedDetailParent); }}>Retry neighbourhood data</button></div>{/if}
      <MapLegend mode={scenario.mode} />
      {#if selected}<div class="mobile-explorer-links"><a href="#impact-heading">View selected result ↓</a><a href={search.trim() ? '#search-count' : '#area-browser-title'}>{search.trim() ? 'Search results ↓' : 'Browse areas ↓'}</a></div>{/if}

    </section>
  <details class="scenario-settings" bind:open={settingsOpen}>
    <summary><strong>Comparison settings</strong><span>{rateValid ? `${scenario.propertyTaxRatePercent}% property tax` : 'Check tax rate'} · {scenario.mode === 'ongoing-owner' ? 'Council Tax only' : scenario.mode === 'purchase-year' ? 'Purchase year' : `Stamp Duty over ${scenario.ownershipYears} years`}</span></summary>
  <section class="scenario-controls" aria-label="Comparison settings">
    {#if settingsError}<p id="settings-error" class="error-text" role="alert">{settingsError}</p>{/if}
    <div class="control-field rate-control">
      <div class="field-label"><label for="property-tax-rate">Annual property tax (%)</label><HelpPopover title="Choose a property tax rate" fallback="/methodology/#scenario">
        <p>The annual property tax is your chosen percentage of the property value. For example, 0.48% of £300,000 is £1,440 per year.</p>
        <p>The default is 0.48%. Enter a rate from 0% to 100%, with up to four decimal places.</p>
        <p>Changing the rate updates all area estimates and your selected comparison.</p>
      </HelpPopover></div>
      <input id="property-tax-rate" type="number" min="0" max="100" step="0.0001" bind:value={() => scenario.propertyTaxRatePercent, value => scenario.propertyTaxRatePercent = value ?? NaN} onchange={changeSetting} aria-invalid={!rateValid} aria-describedby={!rateValid && settingsError ? 'settings-error' : undefined} />
    </div>
    <div class="control-field basis-control">
      <div class="field-label"><label for="comparison-mode">Compare costs</label><HelpPopover title="Choose a comparison" fallback="/methodology/#comparisons"><ComparisonHelp /></HelpPopover></div>
      <select id="comparison-mode" bind:value={scenario.mode} onchange={changeSetting}><option value="ongoing-owner">Council Tax only</option><option value="annualised-ownership">Include Stamp Duty · spread over years</option><option value="purchase-year">Include Stamp Duty · purchase year</option></select>
    </div>
    {#if scenario.mode !== 'ongoing-owner'}
      <div class="control-field buyer-control">
        <div class="field-label"><label for="buyer-type">Buyer type</label><HelpPopover title="Buyer assumptions" fallback="/methodology/#buyers">{@render buyerHelp()}</HelpPopover></div>
        <select id="buyer-type" bind:value={scenario.buyer} onchange={changeSetting}><option value="standard">Standard main-home buyer</option><option value="first-time-buyer">Eligible first-time buyer</option></select>
      </div>
      {#if scenario.mode === 'annualised-ownership'}
        <div class="control-field years-control">
          <div class="field-label"><label for="ownership-years">Years of ownership</label><HelpPopover title="Why the number of years matters" fallback="/methodology/#comparisons">
            <p>Stamp Duty is normally paid once when buying.</p>
            <p>Here, its cost is divided by <strong>{scenario.ownershipYears} years</strong> to show a yearly comparison. Changing the number changes this comparison; it does not change how Stamp Duty is paid.</p>
            <p>The illustration assumes no price growth and does not discount future costs.</p>
          </HelpPopover></div>
          <input id="ownership-years" type="number" min="1" step="1" bind:value={() => scenario.ownershipYears, value => scenario.ownershipYears = value ?? NaN} onchange={changeSetting} aria-invalid={!yearsValid} aria-describedby={!yearsValid && settingsError ? 'settings-error' : undefined} />
        </div>
      {/if}
    {/if}
    <div class="control-field display-control">
      <div class="field-label"><label for="display-result">Show change as</label><HelpPopover title="Result units" fallback="/methodology/#comparisons">
        {#if scenario.mode === 'purchase-year'}<p><strong>Pounds in purchase year:</strong> the difference in first-year costs, including the one-off purchase tax. There is no monthly equivalent in this mode.</p>
        {:else}<p><strong>Pounds per year:</strong> the estimated yearly difference.</p><p><strong>Monthly equivalent:</strong> the yearly difference divided by 12, not a monthly bill.</p>{/if}
        <p><strong>Percentage:</strong> the difference compared with current costs. It is unavailable when current costs are zero.</p>
      </HelpPopover></div>
      <select id="display-result" bind:value={scenario.display} onchange={changeSetting}><option value="annual">{scenario.mode === 'purchase-year' ? 'Pounds in purchase year' : 'Pounds per year'}</option>{#if scenario.mode !== 'purchase-year'}<option value="monthly">Monthly equivalent</option>{/if}<option value="percentage">Percentage</option></select>
    </div>
    <p class="control-note">All property types combined. {scenario.mode === 'ongoing-owner' ? 'Stamp Duty is excluded. Choose “Include Stamp Duty” to add purchase costs.' : scenario.mode === 'annualised-ownership' ? 'Stamp Duty is paid once; its cost is divided by your chosen years of ownership.' : 'Includes the full one-off Stamp Duty payment in the purchase year.'}</p>
    {#if scenario.mode !== 'ongoing-owner' && scenario.buyer === 'first-time-buyer'}
      <div class="buyer-eligibility">All buyers must qualify. Supported up to <strong>£500,000</strong>. <HelpPopover title="Buyer assumptions" label="About first-time-buyer eligibility" fallback="/methodology/#buyers">{@render buyerHelp()}</HelpPopover></div>
    {/if}
  </section>
  </details>
    <aside class="result-column" aria-label="Selected home comparison">
      {#if isExample && selected && !hasPersonalFigures}<div class="example-notice"><strong>Example: {selected.name}</strong><a href="#find-area">Find your area ↑</a></div>{/if}
      <div class="mobile-result-links"><a href="#explore-map">Back to map ↑</a><a href="#find-area">Change area ↑</a></div>
      {#if selected && selectedResult}<ImpactPanel area={selected} result={selectedResult} display={scenario.display} {hasPersonalFigures} personalInputsBusy={postcodeBusy || areaLoading} oneditfigures={openPersonal} onresetfigures={resetPersonal} {parentCouncil} {canUsePersonalFigures} onselectcouncil={selectArea} />{:else}<div class="impact-panel"><h2>Select an area</h2><p>Search a postcode, choose an area from the list, or select a map shape.</p></div>{/if}
      {#if selected}
        <OverlayDialog bind:open={personalOpen} title={hasPersonalFigures ? 'Edit your figures' : 'Use your own figures'}>
          <p>Enter pounds. Leave a field blank to keep the area value. Your entries update this comparison only and are excluded from shared links.</p>
          {#if selected.availability === 'unavailable'}
            <p>{canUsePersonalFigures ? 'Enter the missing figures below to calculate your personal comparison.' : 'This area has a boundary or source limitation that personal figures cannot resolve.'}</p>
          {/if}
          <form class="overlay-form" onsubmit={(event) => { event.preventDefault(); applyPersonal(); }}>
            <label for="personal-value">Property value (£)</label><input id="personal-value" inputmode="decimal" placeholder={selected.pricePence === null ? 'Required: property value' : 'Use area value'} bind:value={valueInput} aria-invalid={Boolean(personalErrors.value)} aria-describedby={personalErrors.value ? 'personal-value-error' : undefined} />
            {#if personalErrors.value}<p id="personal-value-error" role="alert" class="error-text">{personalErrors.value}</p>{/if}
            <label for="personal-bill">Annual Council Tax bill (£)</label><input id="personal-bill" inputmode="decimal" placeholder={selected.councilTaxExactPence === null ? 'Required: annual bill' : 'Use area bill'} bind:value={billInput} aria-invalid={Boolean(personalErrors.bill)} aria-describedby={personalErrors.bill ? 'personal-bill-error' : undefined} />
            {#if personalErrors.bill}<p id="personal-bill-error" role="alert" class="error-text">{personalErrors.bill}</p>{/if}
            <div class="button-row"><button class="primary" type="submit" disabled={postcodeBusy || areaLoading}>Update comparison</button><button type="button" onclick={() => personalOpen = false}>Cancel</button></div>
          </form>
        </OverlayDialog>
        <section class="share-box">
          <div class="section-heading"><h3>Share this comparison</h3><HelpPopover title="What the link includes" fallback="/data-sources/#postcodes">
            <p>The link includes the area, comparison settings and data version.</p>
            <p>Your entered property value and Council Tax bill are excluded. A full postcode is included only if you choose to add it.</p>
            <p>Shared URLs and requests for website files may be logged by the hosting service. Anyone with a link containing a postcode can read that postcode.</p>
          </HelpPopover></div>
          <p>Shares the area estimate and settings. Your entered figures are excluded.</p>
          {#if matchedPostcode}<label class="checkbox-label"><input type="checkbox" bind:checked={includePostcode} onchange={clearShared} />Include full postcode in link</label>{/if}
          <button onclick={(event) => { event.currentTarget.focus({ preventScroll: true }); createShare(); }} aria-haspopup="dialog">Create link</button>
          {#if shareMessage && !shareUrl}<p role="status">{shareMessage}</p>{/if}
        </section>
        <OverlayDialog bind:open={shareOpen} title="Share this comparison">
          <p>Shares the area estimate and settings. Your entered figures are excluded.</p>
          <div class="overlay-form"><label for="share-link">Share link</label><input id="share-link" value={shareUrl} readonly onclick={(event) => event.currentTarget.select()} /><button class="primary" onclick={copyShare}>Copy link</button><p role="status">{shareMessage}</p></div>
        </OverlayDialog>
      {/if}
    </aside>
        <div class="control-field name-search">
          <div class="field-label"><label for="area-search">Or search by area name</label></div>
          <input id="area-search" aria-label="Area name or code" placeholder="Enter a council or neighbourhood" bind:value={search} oninput={() => listLimit = 12} aria-describedby={search ? 'search-count' : undefined} />
        </div>
      {#if search.trim()}
        <section class="search-matches" aria-label="Matching areas">
          <div class="section-heading"><h2 id="search-count" role="status">{filteredAreas.length} matching areas</h2><button class="text-action" onclick={() => { search = ''; document.getElementById('area-search')?.focus(); }}>Clear search</button></div>
          {@render areaList()}
        </section>
      {/if}
    {#if !search.trim()}
    <section class="area-browser" aria-labelledby="area-browser-title"><div class="section-heading"><h2 id="area-browser-title" tabindex="-1">Search by area name</h2><span>{filteredAreas.length} {scenario.geography === 'LAD' ? 'councils' : 'neighbourhoods'}</span></div><p class="area-search-note"><a href="#area-search">Search all councils and neighbourhoods by name ↑</a></p>
      {#if isEngland && scenario.geography === 'MSOA'}<p class="area-search-note">{#if detailParent && !search}Browsing <strong>{release.searchByCode.get(detailParent)?.name ?? 'this council'}</strong>. {/if}Search any neighbourhood in England.</p>{/if}
      {@render areaList()}

    </section>
    {/if}
<div class="scope-strip">
  <span class="status-dot"></span><strong>{isEngland || !release ? 'England' : 'Archived sample'} · estimates for {release?.manifest.coverage.LAD.available ?? 293} councils and {(release?.manifest.coverage.MSOA.available ?? 2961).toLocaleString('en-GB')} neighbourhoods</strong>
  <HelpPopover title="Where estimates are available" fallback="/data-sources/#coverage">
    <p>Council estimates: <strong>{release?.manifest.coverage.LAD.available ?? 293} of {release?.manifest.coverage.LAD.total ?? 296}</strong>.</p>
    <p>Neighbourhood estimates: <strong>{(release?.manifest.coverage.MSOA.available ?? 2961).toLocaleString('en-GB')} of {(release?.manifest.coverage.MSOA.total ?? 6856).toLocaleString('en-GB')}</strong>.</p>
    <p>Some areas lack the data or valid boundaries needed for an estimate. Missing data is never counted as zero.</p>
    <a href="/data-sources/#coverage">See coverage and sources →</a>
  </HelpPopover>
  <a href="/data-sources/">Data & coverage →</a>
</div>
  </div>
{/if}
