<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>
<svelte:head>
  <title>Data sources &amp; coverage · Property Tax Map</title>
  <meta name="description" content="Pinned official data, England coverage, source periods and reuse credits for the Property Tax Map." />
</svelte:head>

<article class="prose">
  <p class="eyebrow">Evidence behind the map</p>
  <h1>Data sources &amp; coverage</h1>
  <p class="lead">
    The map accounts for all {data.coverage.LAD.total} councils and {data.coverage.MSOA.total.toLocaleString('en-GB')} neighbourhoods in the pinned England inventory.
    An area is shown as unavailable when its inputs or boundaries cannot support a consistent estimate.
    This remains an internal data preview, with no missing input treated as zero.
  </p>

  <h2>England coverage</h2>
  <div class="table-wrap"><table><caption>Coverage of area estimates</caption><thead><tr><th scope="col">Geography</th><th scope="col">Available</th><th scope="col">Unavailable</th><th scope="col">Total</th></tr></thead><tbody>
    <tr><th scope="row">Councils</th><td>{data.coverage.LAD.available}</td><td>{data.coverage.LAD.unavailable}</td><td>{data.coverage.LAD.total}</td></tr>
    <tr><th scope="row">Neighbourhoods</th><td>{data.coverage.MSOA.available.toLocaleString('en-GB')}</td><td>{data.coverage.MSOA.unavailable.toLocaleString('en-GB')}</td><td>{data.coverage.MSOA.total.toLocaleString('en-GB')}</td></tr>
  </tbody></table></div>
  <p>Most neighbourhood gaps come from unverified markers in VOA housing-stock counts. Other gaps reflect incompatible geography or invalid source boundaries. Barnsley and Sheffield have no compatible stock totals for their current boundaries; City of London's stock contains an unverified marker. Their council estimates remain unavailable.</p>
  <p>These counts measure area-record coverage. They do not measure the number of households that benefit or provide an individual home's tax bill. Council estimates use independent council inputs and are never substituted for an unavailable neighbourhood.</p>
  <p>Available neighbourhoods contain {data.dwellingCoverage.reportedDwellingsInAvailableAreas.toLocaleString('en-GB')} of {data.dwellingCoverage.totalReportedDwellings.toLocaleString('en-GB')} dwellings in the rounded published stock totals (about 43.9%). This describes where estimates are supported, not how many households benefit.</p>
  <details><summary>Neighbourhood coverage for every council</summary><div class="table-wrap"><table><thead><tr><th scope="col">Council</th><th scope="col">Council estimate</th><th scope="col">Available neighbourhoods</th><th scope="col">Total neighbourhoods</th></tr></thead><tbody>
    {#each data.councils as council}<tr><th scope="row"><a href={`/map/?data=${data.releaseId}&area=${council.code}&geography=LAD`}>{council.name}</a></th><td>{council.availability}</td><td>{council.available}</td><td>{council.total}</td></tr>{/each}
  </tbody></table></div></details>
  <details><summary>Boundaries withheld pending source review</summary><p>These source shapes fail polygon or shared-edge validation. No automatic repairs are applied. Their area records remain searchable, but their shapes and estimates are withheld.</p><ul>{#each data.boundaryExclusions as area}<li>{area.name} · {area.code}</li>{/each}</ul></details>
  <p>The original <a href="/map/?data=sample-2026-09-26-v1">five-council sample</a> remains available for existing shared links. It contains 198 neighbourhoods, including 91 available and 107 unavailable estimates.</p>

  <h2>Official inputs</h2>
  <dl>
    <dt><strong>Median sale prices · Office for National Statistics</strong></dt>
    <dd>
      <a href="https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesbymiddlelayersuperoutputarea">Neighbourhood prices</a>
      and <a href="https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/medianhousepricesforadministrativegeographies">independent council prices</a>,
      year ending September 2025, released 26 March 2026. All-property medians cover 1 October
      2024–30 September 2025. The imported fields are sheets 1a and 2a, column DT.
    </dd>
    <dt><strong>Council Tax property stock · VOA / HMRC</strong></dt>
    <dd>
      <a href="https://www.gov.uk/government/statistics/council-tax-stock-of-properties-2025">Council Tax: stock of properties, 2025</a>,
      CTSOP1.1, stock at 31 March 2025 in the May 2026 update. Band A–H counts supply the weights.
      Published rounding and source markers are retained. Property-type calculations remain deferred.
    </dd>
    <dt><strong>Annual Council Tax charge · MHCLG</strong></dt>
    <dd>
      <a href="https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027">Council Tax levels, England 2026–27</a>,
      Table 10, Data_Billing column AL. This is the full authority-average Band D charge with local
      and major precepts for 1 April 2026–31 March 2027.
    </dd>
    <dt><strong>Boundaries and parent lookup · ONS</strong></dt>
    <dd>
      <a href="https://geoportal.statistics.gov.uk/datasets/61ff711e89ba4c24ae5dc8a487e422a8/about">MSOA 2021 boundaries, BSC V3</a>,
      <a href="https://www.data.gov.uk/dataset/cd5eb88d-305b-43f6-933f-61874773f245/local-authority-districts-may-2025-boundaries-uk-bsc-v2">LAD May 2025 boundaries, BSC V2</a>,
      and the <a href="https://www.data.gov.uk/dataset/009c5c9c-3187-4d78-ab23-330dd265002d/msoa-2021-to-ward-2025-to-lad-2025-best-fit-lookup-in-ew-v3">MSOA 2021 to LAD 2025 best-fit lookup, V3</a>.
      Joins use official GSS codes. The MSOA polygons were converted from British National
      Grid to WGS84 and checked for topology and island preservation. Invalid source shapes are explicitly withheld.
    </dd>
    <dt><strong>Postcode lookup · ONS</strong></dt>
    <dd>
      <a href="https://geoportal.statistics.gov.uk/datasets/3be72478d8454b59bb86ba97b4ee325b/about">ONS Postcode Directory, May 2025 V2</a>,
      including the 17 June 2025 coordinate correction. The lookup preserves source country,
      current/terminated status, coordinates and geography assignments.
    </dd>
    <dt><strong>Purchase-tax rules · HMRC</strong></dt>
    <dd>
      <a href="https://www.gov.uk/stamp-duty-land-tax/residential-property-rates">Residential SDLT rates and first-time-buyer relief</a>,
      effective 1 April 2025 and reviewed 26 September 2026. A separately versioned rule set supplies
      supported purchase scenarios; see the <a href="/methodology">methodology</a> for their limits.
    </dd>
  </dl>
  <p>
    The price period, stock date and tax year differ. They remain visible separately and do not imply
    a current valuation or a single common observation date.
  </p>

  <h2>Postcode coverage and privacy</h2>
  <p>
    The lookup contains 2,714,963 current and terminated postcode records across 3,121 outward-code
    files. Its country and status fields distinguish unsupported or terminated postcodes from unknown records. A match only establishes presence in the May 2025 edition; newer postcodes may be absent.
    Source coordinates can be approximate or unavailable.
  </p>
  <p>{data.postcodeCoverage.withAvailableMsoa.toLocaleString('en-GB')} of {data.postcodeCoverage.currentEnglishPostcodes.toLocaleString('en-GB')} current English postcodes in that edition lead to an available neighbourhood estimate (about 49.1%). Other matched postcodes show the relevant data limitation instead.</p>
  <p>
    After the appropriate outward-code file is loaded, the full postcode is matched locally in the
    browser. A network failure is shown separately from an unknown postcode. Full-postcode sharing
    is an explicit choice; personal value and bill inputs are excluded from sharing by default.
    Static-host requests and shared URLs may be logged by the services handling them.
  </p>

  <h2>Attribution and reuse</h2>
  <p>
    Source: Office for National Statistics licensed under the
    <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v.3.0</a>.
    Price statistics are adapted by ONS from HM Land Registry data licensed under OGL v3.0.
    Council Tax stock data: VOA/HMRC, licensed under OGL v3.0. Council Tax charge data: MHCLG,
    licensed under OGL v3.0. Logos are excluded from these reuse permissions.
  </p>
  <ul>
    <li>MSOA boundaries: Contains OS data © Crown copyright and database right 2021.</li>
    <li>LAD boundaries and postcode data: Contains OS data © Crown copyright and database right 2025.</li>
    <li>Postcode data: Contains Royal Mail data © Royal Mail copyright and database right 2025.</li>
  </ul>
  <p>
    See <a href="https://www.ons.gov.uk/methodology/geography/licences">ONS geographical licensing guidance</a>.
    Northern Ireland postcode data has separate LPS terms, including restrictions on public
    redistribution and commercial use. The manifest declares <strong>public release ready:
    false</strong>. Postcode reuse clearance and a review of usable coverage are required before
    publication.
  </p>

  <details>
    <summary>Inspect the pinned release and provenance</summary>
    <p>
      Data release <code>{data.releaseId}</code> preserves exact source editions and records SHA-256
      checksums, sizes, input periods, geography vintages, methodology and policy versions. Area
      records retain the source workbook cells or CSV rows used for their inputs. The original
      workbooks and source archives are kept outside the browser data bundle.
    </p>
    <p>
      Inspect the <a href="/data/england-2026-09-26-v1/manifest.json">release manifest</a>
      and <a href="/data/england-2026-09-26-v1/sources.json">source register</a>.
      The application combines these pinned statistics with
      rule version <code>sdlt-england-2025-04-01-v1</code>.
    </p>
  </details>
  <p><a href="/methodology">Read the methodology</a> or <a href="/map">explore the England map</a>.</p>
</article>
