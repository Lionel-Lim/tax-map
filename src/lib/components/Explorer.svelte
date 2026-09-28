<script lang="ts">
  import { onMount } from 'svelte';
  import type { AreaComparisonOptions, ComparisonResult } from '$lib/domain/tax/index.js';
  import { compareArea } from '$lib/domain/tax/index.js';
  import { loadRelease, createPostcodeLookup, parseSharedState, serializeSharedState, DEFAULT_STATE, stateToComparisonOptions } from '$lib/data/index.js';
  import type { SharedState } from '$lib/data/index.js';
  import TaxMap from '$lib/map/TaxMap.svelte';
  import MapLegend from '$lib/map/MapLegend.svelte';
  import { resultPresentation, geographyLabel } from '$lib/map/presentation.js';
  import ImpactPanel from './ImpactPanel.svelte';

  let scenario = $state<SharedState>({ ...DEFAULT_STATE });
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
  let personalError = $state('');
  let overrides = $state<AreaComparisonOptions['overrides']>({});
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
  let areaResults = $derived.by(() => {
    const result: Record<string, ComparisonResult> = {};
    if (!linkError) for (const area of release?.areas ?? []) result[area.code] = compareArea(area, options);
    return result;
  });
  let selected = $derived(release?.areas.find(area => area.code === scenario.areaCode));
  let selectedResult = $derived(selected && !linkError ? compareArea(selected, { ...options, overrides }) : null);
  let filteredAreas = $derived.by(() => {
    const query = search.toLowerCase().trim();
    const matches = new Set((release?.search ?? []).filter(item => item.terms.some(term => term.toLowerCase().includes(query))).map(item => item.code));
    return (release?.search ?? []).filter(area => area.geography === scenario.geography
      && (!query || matches.has(area.code) || `${area.name} ${area.code}`.toLowerCase().includes(query))
      && (query || scenario.geography !== 'MSOA' || !detailParent || area.parentCode === detailParent))
      .sort((a,b) => a.name.localeCompare(b.name));
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

  function resetPersonal() { overrides = {}; valueInput = ''; billInput = ''; personalError = ''; }
  function clearShared() { shareUrl = ''; shareMessage = ''; }
  function remember() {
    clearShared();
    try {
      const query = serializeSharedState(scenario);
      settingsError = '';
      window.history.pushState({}, '', `${window.location.pathname}?${query}`);
    } catch (error) { settingsError = (error as Error).message; }
  }
  function changeSetting() {
    if (scenario.mode !== 'annualised-ownership' && (!Number.isSafeInteger(scenario.ownershipYears) || scenario.ownershipYears < 1)) scenario.ownershipYears = 20;
    if (scenario.mode === 'purchase-year' && scenario.display === 'monthly') scenario.display = 'annual';
    remember();
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
      if (area.geography === 'MSOA') { detailParent = area.parentCode; detailGeneration++; detailLoading = false; detailError = ''; }
      remember();
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
      detailParent = response.area.parentCode; detailGeneration++; detailLoading = false; detailError = '';
      resetPersonal();
      if (record.longitude !== null && record.latitude !== null) postcodeLocation = [record.longitude, record.latitude];
      } else {
      scenario = { ...scenario, areaCode: null, postcode: null };
      resetPersonal();
    }
    if (saveHistory) remember();
  }
  function moneyInput(value: string): number | undefined {
    if (!value.trim()) return undefined;
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter pounds as a non-negative number with at most two decimal places.');
    const [pounds, pennies = ''] = value.trim().split('.');
    const amount = Number(pounds) * 100 + Number(pennies.padEnd(2, '0'));
    if (!Number.isSafeInteger(amount)) throw new Error('This amount is too large. Enter a smaller value.');
    return amount;
  }
  function applyPersonal() {
    try {
      const value = moneyInput(valueInput), bill = moneyInput(billInput);
      overrides = { ...(value !== undefined ? { propertyValuePence: value } : {}), ...(bill !== undefined ? { annualCouncilTaxPence: bill } : {}) };
      personalError = ''; clearShared();
    } catch (error) { personalError = (error as Error).message; }
  }
  function createShare() {
    try {
      const query = serializeSharedState(scenario, { includePostcode, postcode: matchedPostcode ?? undefined });
      shareUrl = `${window.location.origin}/map/?${query}`;
      shareMessage = 'Area-estimate link ready. Personal amounts are excluded.';
    } catch (error) { shareMessage = (error as Error).message; }
  }
  async function copyShare() {
    try { await navigator.clipboard.writeText(shareUrl); shareMessage = 'Link copied. Personal amounts are excluded.'; }
    catch { shareMessage = 'Select and copy the link below.'; }
  }
  async function readLocation() {
    const generation = ++lookupGeneration;
    detailGeneration++; detailParent = null; detailLoading = false; detailError = ''; areaLoading = false; areaError = '';
    postcodeBusy = false; postcodeMessage = ''; postcodeStatus = ''; postcodeLocation = null; matchedPostcode = null;
    resetPersonal(); clearShared(); includePostcode = false;
    const parsed = parseSharedState(window.location.search);
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
    if (scenario.postcode) { postcodeInput = scenario.postcode; await findPostcode(scenario.postcode, false); }
  }
  async function initialise() {
    const generation = lookupGeneration + 1;
    loading = true; loadError = '';
    try {
      await readLocation();
    } catch (error) {
      if (generation === lookupGeneration) loadError = error instanceof Error ? error.message : 'The data could not be loaded.';
    }
    if (generation === lookupGeneration) loading = false;
  }
  function useCurrentData() {
    window.history.pushState({}, '', window.location.pathname);
    linkError = ''; void initialise();
  }
  onMount(() => {
    void initialise();
    const onBack = () => { void initialise(); };
    window.addEventListener('popstate', onBack);
    return () => { lookupGeneration++; detailGeneration++; window.removeEventListener('popstate', onBack); };
  });
</script>

<section class="explorer-heading">
  <div><p class="eyebrow">A DIFFERENT WAY TO TAX PROPERTY</p><h1>What would change<br class="mobile-break" /> for a typical home?</h1><p class="lead">Explore an illustrative <strong>0.48% annual property tax</strong>, compared with Council Tax and Stamp Duty.</p></div>
  <div class="coverage-stamp"><strong>{release?.manifest.coverage.LAD.total ?? 296}</strong><span>{isEngland || !release ? 'English councils' : 'sample councils'}<br />{(release?.manifest.coverage.MSOA.total ?? 6856).toLocaleString('en-GB')} neighbourhoods</span></div>
</section>
<div class="scope-strip"><span class="status-dot"></span><strong>{isEngland || !release ? 'Explore England' : 'Archived five-council sample'}</strong><span>{release ? `${release.manifest.coverage.LAD.available} council estimates · ${release.manifest.coverage.MSOA.available.toLocaleString('en-GB')} neighbourhood estimates · data gaps stay visible` : 'Council and neighbourhood estimates from pinned official data'}</span><a href="/data-sources/">Coverage & limitations ↗</a></div>
{#if release && !isEngland}<p class="archive-notice">This shared link uses the original five-council release. <a href="/map/" onclick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); useCurrentData(); } }}>Explore the new England-wide data →</a></p>{/if}
<noscript><p class="notice">Enable JavaScript to search and calculate. The <a href="/methodology/">methodology</a> and <a href="/data-sources/">source pages</a> remain available.</p></noscript>
{#if loading}<div class="loading-state" role="status">Loading the verified data…</div>{/if}
{#if loadError}<section class="error-state" role="alert"><h2>Data could not be loaded</h2><p>{loadError}</p><button onclick={initialise}>Retry loading data</button></section>{/if}
{#if linkError}<section class="error-state" role="alert"><h2>This shared comparison cannot be opened</h2><p>{linkError}</p><p>No result has been recalculated with different versions.</p><button onclick={useCurrentData}>Open current England data</button></section>{/if}

{#if release && !linkError}
  <section class="scenario-controls" aria-label="Comparison settings">
    {#if settingsError}<p class="error-text" role="alert">{settingsError}</p>{/if}
    <label class="basis-control">Comparison basis<select aria-label="Comparison basis" bind:value={scenario.mode} onchange={changeSetting}><option value="annualised-ownership">Annualised ownership</option><option value="ongoing-owner">Ongoing owner</option><option value="purchase-year">Purchase year</option></select></label>
    {#if scenario.mode !== 'ongoing-owner'}
      <label>Buyer profile<select aria-label="Buyer profile" bind:value={scenario.buyer} onchange={changeSetting}><option value="standard">Standard single-home buyer</option><option value="first-time-buyer">Eligible first-time buyer</option></select></label>
      {#if scenario.mode === 'annualised-ownership'}<label class="years-control">Ownership years<input aria-label="Ownership years" type="number" min="1" step="1" bind:value={scenario.ownershipYears} onchange={changeSetting} /></label>{/if}
    {/if}
    <label>Display result<select aria-label="Display result" bind:value={scenario.display} onchange={changeSetting}><option value="annual">{scenario.mode === 'purchase-year' ? 'Purchase-year £' : 'Annual £'}</option>{#if scenario.mode !== 'purchase-year'}<option value="monthly">Monthly £ equivalent</option>{/if}<option value="percentage">Percentage change</option></select></label>
    <label>Property type<select aria-label="Property type" disabled><option>All properties</option></select></label>
    <p class="control-note">Only all-property inputs are supported by this release. {scenario.mode === 'annualised-ownership' ? `One-off Stamp Duty is spread over ${scenario.ownershipYears} years, with no price growth or discounting.` : ''}</p>
    {#if scenario.mode !== 'ongoing-owner'}<details class="buyer-scope"><summary>Buyer assumptions & unsupported cases</summary><p>UK-resident individuals buying a single primary residence; no additional-property surcharge, shared ownership, linked transaction or new lease rent. The model assumes a freehold purchase. {scenario.buyer === 'first-time-buyer' ? 'All purchasers are assumed eligible first-time buyers under HMRC’s worldwide ownership definition. Above £500,000 the first-time-buyer model is unavailable; it does not silently switch profiles.' : ''} <a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates" target="_blank" rel="noreferrer">Check official SDLT guidance ↗</a></p></details>{/if}
  </section>
  <div class="sr-only" role="status" aria-live="polite">{selected ? `${selected.name}, ${geographyLabel(selected.geography)}. ${selectedResult?.status === 'available' ? `${selectedResult.difference.displayPounds} ${scenario.mode === 'purchase-year' ? 'in the purchase year' : 'per year'}.` : 'Estimate unavailable.'}` : 'Choose an area to compare.'}</div>
  <div class="explorer-grid">
    <section class="map-column" aria-label="Explore areas">
      <div class="search-toolbar"><form onsubmit={(event) => { event.preventDefault(); void findPostcode(); }}><label for="postcode">Find your neighbourhood</label><div class="input-button"><input id="postcode" aria-label="Postcode" autocomplete="postal-code" placeholder="Enter a postcode" bind:value={postcodeInput} /><button class="primary" disabled={postcodeBusy} type="submit">{postcodeBusy ? 'Finding…' : 'Find postcode'}<span aria-hidden="true"> →</span></button></div></form><label class="geography-control">Map geography<select aria-label="Map geography" bind:value={scenario.geography} onchange={changeGeography}><option value="LAD">Council areas</option><option value="MSOA">Neighbourhoods</option></select></label></div>
      <p class="lookup-privacy">Lookup uses the May 2025 directory. Only an outward-code file is requested; full postcodes are matched in your browser.</p>
      {#if postcodeMessage}<p class="postcode-status" class:warning={postcodeStatus !== 'found'} role="status" data-testid="postcode-status">{postcodeMessage}</p>{/if}
      <TaxMap scope={release.manifest.scope === 'england' ? 'england' : 'five-authority-sample'} {detailParent} {detailLoading} ondetailrequest={requestDistrict} areas={release.areas} results={areaResults} selectedCode={scenario.areaCode} geography={scenario.geography} onselect={selectArea} ongeographychange={(geography) => { scenario.geography = geography; listLimit = 12; clearShared(); try { window.history.replaceState({}, '', `${window.location.pathname}?${serializeSharedState(scenario)}`); } catch { /* Invalid draft inputs do not enter history. */ } }} {postcodeLocation} releaseBase={release.basePath} />
      {#if detailLoading}<p class="postcode-status" role="status">Loading neighbourhood estimates…</p>{/if}
      {#if detailError}<div class="postcode-status warning" role="alert"><p>{detailError}</p><button onclick={() => { if (failedDetailParent) void requestDistrict(failedDetailParent); }}>Retry neighbourhood data</button></div>{/if}
      <MapLegend mode={scenario.mode} />
      {#if selected}<a class="selected-jump" href="#impact-heading">View selected home result ↓</a>{/if}
      <p class="map-note">Showing {scenario.geography === 'LAD' ? 'independent council' : 'neighbourhood (MSOA 2021)'} estimates. {selected ? `Selected result: ${geographyLabel(selected.geography)}.` : ''} Zooming changes the map layer, not the selected estimate. Colours always use {scenario.mode === 'purchase-year' ? 'first-year' : 'annual'} pounds.</p>
      {#if areaLoading}<p class="postcode-status" role="status">Loading the selected area…</p>{/if}
      {#if areaError}<p class="postcode-status warning" role="alert">{areaError} Select the area to retry.</p>{/if}
      <section class="area-browser" aria-labelledby="area-browser-title"><div class="section-heading"><h2 id="area-browser-title">Explore by area</h2><span>{filteredAreas.length} {scenario.geography === 'LAD' ? 'councils' : 'neighbourhoods'}</span></div><label class="sr-only" for="area-search">Area name or code</label><input id="area-search" placeholder="Search area name or code…" bind:value={search} oninput={() => listLimit = 12} />
        {#if isEngland && scenario.geography === 'MSOA'}<p class="area-search-note">{detailParent && !search ? `Browsing ${release.searchByCode.get(detailParent)?.name ?? 'this council'}. ` : ''}Search any neighbourhood name or code across England. Select an area to load its estimate.</p>{/if}
        <ul class="area-list">{#each filteredAreas.slice(0, listLimit) as area}{@const result = areaResults[area.code]}{@const presentation = result || area.availability === 'unavailable' ? resultPresentation(result) : {kind: 'unloaded', colour: '#bcc8be', label: 'Select to calculate'}}<li><button data-area-code={area.code} data-kind={presentation.kind} class:selected={scenario.areaCode === area.code} aria-pressed={scenario.areaCode === area.code} onclick={() => selectArea(area.code)}><span class="list-dot" style:background={presentation.colour}></span><span class="area-name">{area.name}<small>{geographyLabel(area.geography)} · {area.code}</small></span><span class="area-impact">{result?.status === 'available' ? scenario.display === 'percentage' ? result.percentageDifference?.display ?? 'Not defined' : scenario.display === 'monthly' && result.monthlyEquivalent ? result.monthlyEquivalent.displayPounds : result.difference.displayPounds : !result && area.availability === 'available' ? 'View estimate' : 'Unavailable'}<small>{presentation.label}</small></span><span aria-hidden="true">↗</span></button></li>{/each}</ul>
        {#if !filteredAreas.length}<p role="status">No matching areas in this map layer. Try switching map geography or searching a postcode.</p>{/if}
        {#if filteredAreas.length > listLimit}<button class="show-more" onclick={() => listLimit += 24}>Show more areas</button>{/if}
      </section>
    </section>
    <aside class="result-column" aria-label="Selected home comparison">
      {#if selected && selectedResult}<ImpactPanel area={selected} result={selectedResult} display={scenario.display} />{:else}<div class="impact-panel"><h2>Select an area</h2><p>Search a postcode, choose an area from the list, or select a map shape.</p></div>{/if}
      {#if selected}
        <section class="personal-inputs"><details><summary>Use your own property value or bill</summary><p>Optional, in pounds. Blank fields retain the area input. Missing dependencies must each be replaced; the original unavailable estimate stays on the map.</p><form onsubmit={(event) => { event.preventDefault(); applyPersonal(); }}><label>Property value (£)<input aria-label="Property value (£)" inputmode="decimal" placeholder="Keep area value" bind:value={valueInput} /></label><label>Annual Council Tax bill (£)<input aria-label="Annual Council Tax bill (£)" inputmode="decimal" placeholder="Keep area estimate" bind:value={billInput} /></label>{#if personalError}<p role="alert" class="error-text">{personalError}</p>{/if}<div class="button-row"><button class="primary" type="submit" disabled={postcodeBusy || areaLoading}>Apply personal inputs</button><button type="button" onclick={resetPersonal}>Reset to area estimate</button></div></form></details></section>
        <section class="share-box"><div class="section-heading"><h3>Share this comparison</h3><span aria-hidden="true">↗</span></div><p>Share the area estimate and assumptions. Personal amounts are excluded.</p>{#if matchedPostcode}<label class="checkbox-label"><input type="checkbox" bind:checked={includePostcode} onchange={clearShared} />Include full postcode in link</label>{/if}<p class="small">Shared URLs and static-host requests may be logged.</p><button onclick={createShare}>Create share link</button>{#if shareUrl}<label>Share link<input aria-label="Share link" value={shareUrl} readonly onclick={(event) => event.currentTarget.select()} /></label><button onclick={copyShare}>Copy link</button>{/if}<p role="status">{shareMessage}</p></section>
      {/if}
    </aside>
  </div>
{/if}
