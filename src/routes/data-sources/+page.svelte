<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const formatCount = (value: number) => value.toLocaleString('en-GB');
  const formatPercent = (part: number, total: number) => (part / total * 100).toFixed(1);
</script>
<svelte:head>
  <title>Data &amp; coverage · Tax Map</title>
  <meta name="description" content="Where Tax Map estimates are available, why some areas have gaps, and the official sources behind the comparison." />
</svelte:head>

<article class="prose">
  <p class="eyebrow">Evidence behind the map</p>
  <h1>Data &amp; coverage</h1>
  <p class="lead">Official data supports estimates for most English councils and some neighbourhoods. Coverage is incomplete.</p>
  <p class="reading-actions"><a class="reading-action" href="/map">Find your area →</a><a href="/methodology">How the estimate works</a></p>

  <h2 id="coverage">Where estimates are available</h2>
  <dl class="coverage-totals">
    <div><dt>Councils</dt><dd><strong>{formatCount(data.coverage.LAD.available)}</strong> of {formatCount(data.coverage.LAD.total)}<span>{formatCount(data.coverage.LAD.unavailable)} unavailable</span></dd></div>
    <div><dt>Neighbourhoods</dt><dd><strong>{formatCount(data.coverage.MSOA.available)}</strong> of {formatCount(data.coverage.MSOA.total)}<span>{formatCount(data.coverage.MSOA.unavailable)} unavailable</span></dd></div>
  </dl>
  <p>These are counts of areas with a supported estimate. They do not show how many households would benefit.</p>

  <h2>Why some areas have no estimate</h2>
  <p>Most gaps come from housing-stock counts that cannot be verified. Missing prices or charges, incompatible geography and invalid boundaries can also prevent an estimate.</p>
  <p><strong>Missing data is never counted as zero.</strong> A council result is never substituted for an unavailable neighbourhood. <a href="/methodology/#your-figures">Your own figures</a> can replace missing prices or bills, but cannot fix an invalid boundary.</p>

  <h2 id="postcodes">Postcodes and sharing</h2>
  <ul>
    <li><strong>A postcode finds an area</strong> — it does not identify your home's value or Council Tax bill.</li>
    <li><strong>The directory is from May 2025.</strong> Newer postcodes may be missing; estimates cover England only.</li>
    <li><strong>Sharing a full postcode is optional.</strong> Personal home values and Council Tax bills are never included in shared links.</li>
  </ul>

  <h2>Sources and details</h2>
  <details>
    <summary>Official sources and dates</summary>
    <p>The price period, stock date and tax year differ. Together they provide an area estimate, not a current valuation of an individual home.</p>
    <dl>
      <dt>Sale prices · Office for National Statistics</dt>
      <dd><a href="https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesbymiddlelayersuperoutputarea">Neighbourhood medians</a> and <a href="https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesforadministrativegeographies">council medians</a> for all property types, covering <strong>1 October 2024–30 September 2025</strong>. Released 26 March 2026; sheets 1a and 2a, column DT.</dd>
      <dt>Council Tax property stock · VOA / HMRC</dt>
      <dd><a href="https://www.gov.uk/government/statistics/council-tax-stock-of-properties-2025">Stock of properties, 2025</a>: counts in bands A–H at <strong>31 March 2025</strong>, from CTSOP1.1 in the May 2026 update. Source rounding and markers are preserved.</dd>
      <dt>Council Tax charges · MHCLG</dt>
      <dd><a href="https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027">Council Tax levels, England 2026–27</a>: authority-average Band D charges, including local and major precepts, for <strong>1 April 2026–31 March 2027</strong>. Table 10, Data_Billing column AL.</dd>
      <dt>Boundaries and postcodes · ONS</dt>
      <dd><a href="https://geoportal.statistics.gov.uk/datasets/61ff711e89ba4c24ae5dc8a487e422a8/about">MSOA 2021 neighbourhood boundaries, BSC V3</a>; <a href="https://www.data.gov.uk/dataset/cd5eb88d-305b-43f6-933f-61874773f245/local-authority-districts-may-2025-boundaries-uk-bsc-v2">May 2025 council boundaries, BSC V2</a>; and the <a href="https://www.data.gov.uk/dataset/009c5c9c-3187-4d78-ab23-330dd265002d/msoa-2021-to-ward-2025-to-lad-2025-best-fit-lookup-in-ew-v3">MSOA-to-council lookup, V3</a>. Joins use official geographic codes. <a href="https://geoportal.statistics.gov.uk/datasets/3be72478d8454b59bb86ba97b4ee325b/about">ONS Postcode Directory, May 2025 V2</a> includes the 17 June 2025 coordinate correction.</dd>
      <dt>Stamp Duty rules · HMRC</dt>
      <dd><a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates">Residential SDLT rates and first-time-buyer relief</a>, effective <strong>1 April 2025</strong> and reviewed 26 September 2026. See <a href="/methodology/#buyers">supported buyer scenarios</a>.</dd>
    </dl>
  </details>
  <details>
    <summary>Council coverage and boundary exclusions</summary>
    <p>Barnsley and Sheffield have no compatible stock totals for their current boundaries. City of London's stock contains an unverified marker. These three council estimates are unavailable.</p>
    <p>Available neighbourhoods contain {formatCount(data.dwellingCoverage.reportedDwellingsInAvailableAreas)} of {formatCount(data.dwellingCoverage.totalReportedDwellings)} dwellings in the rounded published totals ({formatPercent(data.dwellingCoverage.reportedDwellingsInAvailableAreas, data.dwellingCoverage.totalReportedDwellings)}%). This measures coverage, not households benefiting.</p>
    <h3>Boundaries awaiting review</h3>
    <p>These {data.boundaryExclusions.length} source shapes fail polygon or shared-edge checks. Their records remain searchable, but their shapes and comparisons are withheld, even with personal figures. No automatic repairs are applied.</p>
    <dl>{#each data.boundaryExclusions as area}<dt>{area.name}</dt><dd>{area.code}</dd>{/each}</dl>
    <h3>Neighbourhood coverage by council</h3>
    <p>Select a council name to open it on the map.</p>
    <p class="table-hint">Scroll sideways to see all columns →</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard focus lets users scroll the table with arrow keys.) -->
    <div class="table-wrap" role="region" aria-label="Neighbourhood coverage for every council" tabindex="0">
      <table><thead><tr><th scope="col">Council</th><th scope="col">Council estimate</th><th scope="col">Available neighbourhoods</th><th scope="col">Total neighbourhoods</th></tr></thead><tbody>
        {#each data.councils as council}<tr><th scope="row"><a href={`/map/?data=${data.releaseId}&area=${council.code}&geography=LAD`}>{council.name}</a></th><td>{council.availability}</td><td>{council.available}</td><td>{council.total}</td></tr>{/each}
      </tbody></table>
    </div>
  </details>
  <details>
    <summary>Postcode lookup details and privacy</summary>
    <p>{formatCount(data.postcodeCoverage.withAvailableMsoa)} of {formatCount(data.postcodeCoverage.currentEnglishPostcodes)} current English postcodes in this edition lead to an available neighbourhood estimate ({formatPercent(data.postcodeCoverage.withAvailableMsoa, data.postcodeCoverage.currentEnglishPostcodes)}%). Other matches show the relevant data limitation.</p>
    <p>The lookup contains {formatCount(data.publicPostcodes.postcodeRecords)} current and terminated records in {formatCount(data.publicPostcodes.postcodeShards)} outward-code files, excluding Northern Ireland. Country and status fields distinguish unsupported or terminated postcodes from unknown records. BT postcodes are outside the lookup; their existence is not checked.</p>
    <p>The browser loads the relevant outward-code file, then matches the full postcode locally. Network failures are shown separately from unknown postcodes. Source coordinates may be approximate or missing; official assignments, rather than map shapes, determine an area's council.</p>
    <p>Static-host requests and shared URLs may be logged by the services handling them. A full postcode appears in a shared link only if you choose to include it. Your personal home value and Council Tax bill are always excluded.</p>
  </details>
  <details>
    <summary>Attribution and reuse</summary>
    <p>Source: Office for National Statistics licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v.3.0</a>. Price statistics are adapted by ONS from HM Land Registry data licensed under OGL v3.0. Council Tax stock data: VOA/HMRC, licensed under OGL v3.0. Council Tax charge data: MHCLG, licensed under OGL v3.0. Logos are excluded from these reuse permissions.</p>
    <ul>
      <li>MSOA boundaries: Contains OS data © Crown copyright and database right 2021.</li>
      <li>LAD boundaries and postcode data: Contains OS data © Crown copyright and database right 2025.</li>
      <li>Postcode data: Contains Royal Mail data © Royal Mail copyright and database right 2025.</li>
    </ul>
    <p>See <a href="https://www.ons.gov.uk/methodology/geography/licences">ONS geographical licensing guidance</a>. Northern Ireland postcode data has separate LPS terms and is excluded from this website, including its downloadable data files.</p>
  </details>
  <details>
    <summary>Release files and the earlier sample</summary>
    <p>Data release <code>{data.releaseId}</code> records source editions, dates, SHA-256 checksums, file sizes and calculation versions. Area records retain their source workbook cells or CSV rows. Original workbooks and archives are kept outside the browser bundle.</p>
    <p>Inspect the <a href={`/data/public-v1/${data.releaseId}/manifest.json`}>release manifest</a> and <a href={`/data/public-v1/${data.releaseId}/sources.json`}>source register</a>. The purchase-rule version is <code>sdlt-england-2025-04-01-v1</code>.</p>
    <p>The original <a href="/map/?data=sample-2026-09-26-v1">five-council sample</a> remains available for existing shared links. It contains 198 neighbourhoods: 91 available and 107 unavailable estimates.</p>
  </details>
  <p class="reading-actions"><a class="reading-action" href="/map">Find your area →</a></p>
</article>
