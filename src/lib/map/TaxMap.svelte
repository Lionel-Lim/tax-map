<script lang="ts">
  import { onMount } from 'svelte';
  import type { Feature, FeatureCollection, Geometry } from 'geojson';
  import type { GeoJSONSource, Map as LibreMap, Marker, LngLatBoundsLike } from 'maplibre-gl';
  import type { AreaRecord } from '../domain/tax/area.js';
  import type { ComparisonResult } from '../domain/tax/types.js';
  import { colourByKind, geographyLabel, resultPresentation, type Geography } from './presentation.js';

  interface Props {
    areas: AreaRecord[];
    results: Record<string, ComparisonResult>;
    selectedCode: string | null;
    geography: Geography;
    onselect: (code: string) => void;
    ongeographychange: (geography: Geography) => void;
    postcodeLocation?: [number, number] | null;
    releaseBase: string;
    scope?: 'five-authority-sample' | 'england';
    detailParent?: string | null;
    detailLoading?: boolean;
    ondetailrequest?: (ladCode: string) => Promise<void>;
  }

  let { areas, results, selectedCode, geography, onselect, ongeographychange,
    postcodeLocation = null, releaseBase, scope = 'five-authority-sample', detailParent = null,
    detailLoading = false, ondetailrequest }: Props = $props();
  let container: HTMLDivElement;
  let map: LibreMap | undefined;
  let ready = $state(false);
  let mapError = $state('');
  let hoverName = $state('');
  let hoverResult = $state('');
  let loading = $state(true);
  let londonView = $state(false);
  let informationOpen = $state(true);
  let allFeatures: Feature<Geometry>[] = [];
  let ladFeatures: Feature<Geometry>[] = [];
  let MarkerClass: typeof import('maplibre-gl').Marker;
  const detailCache = new Map<string, FeatureCollection<Geometry>>();
  let boundaryParent: string | null = null;
  let boundaryLoading = $state(false);
  let boundaryError = $state('');
  let featureRevision = $state(0);
  let requestedParent: string | null = null;
  let boundaryGeneration = 0;
  let detailViewNeedsFocus = true;
  let activeDetail = $state<string | null>(null);
  let renderingParent: string | null = null;
  let detailPending = $derived(scope === 'england' && geography === 'MSOA'
    && (detailLoading || boundaryLoading || activeDetail !== detailParent || detailParent === null));
  let detailName = $derived(areas.find(area => area.code === detailParent)?.name ?? 'the map centre');
  let selectedArea = $derived(areas.find(area => area.code === selectedCode));
  let selectedInLondon = $derived(Boolean((selectedArea?.parentCode ?? selectedArea?.code)?.startsWith('E09')));
  let selectedResult = $derived(selectedCode ? results[selectedCode] : undefined);
  let selectedPresentation = $derived(resultPresentation(selectedResult));
  let labels: { code: string; marker: Marker; button: HTMLButtonElement }[] = [];
  let locationMarker: Marker | undefined;
  let previousSelected: string | null = null;
  let teardown = false;
  let aborter: AbortController;
  const overviewBounds = $derived<LngLatBoundsLike>(scope === 'england'
    ? [[-6.5, 49.8], [1.95, 55.85]] : [[-5.7, 50.1], [1.95, 55.85]]);
  const detailZoom = 8.3;
  const scaleMaxWidth = 90;

  function syncGeographyToScale() {
    if (!map || !ready) return;
    let showDetail = map.getZoom() >= detailZoom;
    if (londonView) {
      // Match ScaleControl's centre-of-screen measurement. Its metric rounding
      // displays 2 km (or less) once this distance drops below 3,000 metres.
      const x = container.clientWidth / 2, y = container.clientHeight / 2;
      const left = map.unproject([x - scaleMaxWidth / 2, y]);
      const right = map.unproject([x + scaleMaxWidth / 2, y]);
      showDetail = left.distanceTo(right) < 3000;
    }
    const next: Geography = showDetail ? 'MSOA' : 'LAD';
    if (next !== geography) ongeographychange(next);
    queueMicrotask(requestCentreDetail);
  }

  function featureBounds(feature: Feature<Geometry>): [[number, number], [number, number]] {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    function visit(value: unknown) {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        west = Math.min(west, value[0]); east = Math.max(east, value[0]);
        south = Math.min(south, value[1]); north = Math.max(north, value[1]);
      } else value.forEach(visit);
    }
    if ('coordinates' in feature.geometry) visit(feature.geometry.coordinates);
    return [[west, south], [east, north]];
  }

  function updateColours() {
    if (!map || !ready) return;
    for (const area of areas) {
      map.setFeatureState({ source: area.geography, id: area.code }, {
        colour: resultPresentation(results[area.code]).colour,
        unavailable: Boolean(results[area.code] && results[area.code].status !== 'available'),
      });
    }
    for (const { code, button } of labels) {
      const presentation = resultPresentation(results[code]);
      button.style.setProperty('--area-colour', presentation.colour);
      button.setAttribute('aria-label', `${areas.find(area => area.code === code)?.name ?? code}: ${presentation.label}. Select council area.`);
      button.classList.toggle('is-selected', selectedCode === code);
    }
  }

  function updateVisibility() {
    if (!map || !ready) return;
    for (const level of ['LAD', 'MSOA']) {
      for (const layer of ['fill', 'unavailable', 'outline']) {
        const visible = level === geography && !(level === 'MSOA' && (detailPending || boundaryError
          || (londonView && !detailParent?.startsWith('E09'))));
        map.setFilter(`${level}-${layer}`, londonView && level === 'LAD'
          ? ['in', ['get', 'code'], ['literal', ladFeatures.filter(feature => String(feature.properties?.code).startsWith('E09')).map(feature => feature.properties!.code)]]
          : null);
        map.setLayoutProperty(`${level}-${layer}`, 'visibility', visible ? 'visible' : 'none');
      }
    }
    if (scope === 'england') {
      const londonFilter: import('maplibre-gl').FilterSpecification | null = londonView
        ? ['in', ['get', 'code'], ['literal', ladFeatures.filter(feature => String(feature.properties?.code).startsWith('E09')).map(feature => feature.properties!.code)]] : null;
      map.setFilter('LAD-context', londonFilter);
      map.setFilter('LAD-hit', londonFilter);
      map.setLayoutProperty('LAD-context', 'visibility', geography === 'MSOA' ? 'visible' : 'none');
    }
    for (const { button } of labels) button.hidden = geography !== 'LAD';
    hoverName = '';
  }

  function updateSelection() {
    if (!map || !ready) return;
    const feature = allFeatures.find(item => item.properties?.code === selectedCode);
    (map.getSource('selection') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feature ? [feature] : [] });
    for (const { code, button } of labels) button.classList.toggle('is-selected', selectedCode === code);
    if (feature && selectedCode !== previousSelected) {
      const area = areas.find(item => item.code === selectedCode);
      if (!(area?.parentCode ?? area?.code)?.startsWith('E09')) londonView = false;
      // Keep the borough comparison view in place when selecting a London council.
      if (!(londonView && area?.geography === 'LAD' && area.code.startsWith('E09'))) {
        map.fitBounds(featureBounds(feature), {
        padding: { top: 85, right: 65, bottom: 75, left: 65 },
        maxZoom: area?.geography === 'LAD' ? 8.1 : 12.3,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
        });
      }
    }
    if (!feature && selectedCode !== previousSelected && scope === 'england') {
      const area = areas.find(item => item.code === selectedCode);
      if (area?.unavailableReasons.includes('boundary-invalid') && area.parentCode) {
        const parent = ladFeatures.find(item => item.properties?.code === area.parentCode);
        if (parent) {
          const [[west,south],[east,north]] = featureBounds(parent);
          map.easeTo({ center: [(west+east)/2,(south+north)/2], zoom: 9, duration: 600 });
        }
        previousSelected = selectedCode;
      }
    }
    if (feature || !selectedCode) previousSelected = selectedCode;
    if (scope === 'england') refreshLabels();
  }

  function refreshLabels() {
    if (!map || !MarkerClass) return;
    let candidates = ladFeatures;
    if (scope === 'england') {
      const bounds = map.getBounds();
      const width = container.clientWidth, height = container.clientHeight;
      const positions: { x: number; y: number }[] = [];
      candidates = ladFeatures.filter(feature => !londonView || String(feature.properties?.code).startsWith('E09')).sort((a, b) => {
        if (a.properties?.code === selectedCode) return -1;
        if (b.properties?.code === selectedCode) return 1;
        const size = (f: Feature<Geometry>) => { const [[w,s],[e,n]] = featureBounds(f); return (e-w)*(n-s); };
        return size(b) - size(a);
      }).filter(feature => {
        const [[w,s],[e,n]] = featureBounds(feature);
        const centre: [number,number] = [(w+e)/2,(s+n)/2];
        if (!bounds.contains(centre)) return false;
        const p = map!.project(centre);
        if (p.x < 55 || p.x > width-55 || p.y < 85 || p.y > height-100
          || positions.length >= 7 || positions.some(q => Math.abs(q.x-p.x) < 135 && Math.abs(q.y-p.y) < 52)) return false;
        positions.push(p); return true;
      });
    }
    const codes = new Set(candidates.map(feature => String(feature.properties?.code)));
    labels = labels.filter(label => { if (codes.has(label.code)) return true; label.marker.remove(); return false; });
    for (const feature of candidates) {
      const code = String(feature.properties?.code);
      if (labels.some(label => label.code === code)) continue;
      const [[west,south],[east,north]] = featureBounds(feature);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'area-map-label';
      button.textContent = areas.find(area => area.code === code)?.name ?? String(feature.properties?.name);
      button.addEventListener('click', event => { event.stopPropagation(); onselect(code); });
      const marker = new MarkerClass({ element: button, anchor: 'center' }).setLngLat([(west+east)/2,(south+north)/2]).addTo(map);
      labels.push({ code, marker, button });
    }
    for (const { button } of labels) button.hidden = geography !== 'LAD';
    updateColours();
  }

  async function loadDetailBoundary(parent: string) {
    if (boundaryParent === parent) return;
    boundaryParent = parent;
    const generation = ++boundaryGeneration;
    boundaryLoading = true; boundaryError = ''; activeDetail = null;
    try {
      if (!detailCache.has(parent)) {
        const loaded = await fetch(`${releaseBase}/boundaries/msoa/${parent}.geojson`, { signal: aborter.signal }).then(readBoundaries);
        detailCache.set(parent, loaded);
      }
      if (generation !== boundaryGeneration || teardown) return;
      allFeatures = [...ladFeatures, ...[...detailCache.values()].flatMap(collection => collection.features)];
      boundaryLoading = false;
      featureRevision++;
    } catch {
      if (generation !== boundaryGeneration || teardown) return;
      boundaryLoading = false;
      boundaryError = 'Neighbourhood boundaries could not load. Search and the selected comparison remain available.';
    }
  }

  function showReadyDetail() {
    if (!map || !ready || scope !== 'england' || !detailParent || detailLoading || boundaryLoading) return;
    const data = detailCache.get(detailParent);
    // Never paint not-yet-loaded statistics with the unavailable classification.
    if (!data || !data.features.every(feature => results[String(feature.properties?.code)])) return;
    const parent = detailParent;
    if (activeDetail !== parent && renderingParent !== parent) {
      renderingParent = parent;
      void (map.getSource('MSOA') as GeoJSONSource).setData(data).then(() => {
        if (renderingParent === parent) renderingParent = null;
        if (teardown || detailParent !== parent || boundaryParent !== parent) return;
        updateColours(); activeDetail = parent;
      }).catch(() => {
        if (renderingParent === parent) renderingParent = null;
        if (!teardown && detailParent === parent) boundaryError = 'Neighbourhood boundaries could not render. Use search or the area list, or retry the boundaries.';
      });
    }
  }

  function requestCentreDetail() {
    if (!map || !ready || scope !== 'england' || geography !== 'MSOA' || !ondetailrequest) return;
    const selected = areas.find(area => area.code === selectedCode);
    if (selected?.geography === 'MSOA' && previousSelected !== selectedCode) return;
    const centre = map.project(map.getCenter());
    let nearby = map.queryRenderedFeatures(centre, { layers: ['LAD-hit'] });
    // The Thames and other gaps can sit exactly under the camera centre.
    // Load a nearby visible borough without changing the selected estimate.
    if (!nearby.length) nearby = map.queryRenderedFeatures([
      [centre.x - 24, centre.y - 24], [centre.x + 24, centre.y + 24],
    ], { layers: ['LAD-hit'] });
    const code = nearby[0]?.properties?.code;
    if (typeof code === 'string' && code !== detailParent && code !== requestedParent) {
      requestedParent = code;
      void ondetailrequest(code).finally(() => { if (requestedParent === code) requestedParent = null; });
    }
  }

  function prepareDetailView() {
    if (!map || !ready || scope !== 'england') return;
    if (geography !== 'MSOA') { detailViewNeedsFocus = true; return; }
    if (detailLoading) return;
    if (!detailParent) {
      if (detailViewNeedsFocus) { detailViewNeedsFocus = false; requestCentreDetail(); }
      return;
    }
    if (!detailViewNeedsFocus) return;
    const selected = areas.find(area => area.code === selectedCode);
    const feature = ladFeatures.find(item => item.properties?.code === detailParent);
    if (feature && selected?.geography !== 'MSOA' && map.getZoom() < detailZoom) {
      const camera = map.cameraForBounds(featureBounds(feature), {
        padding: { top: 95, right: 55, bottom: 80, left: 55 }, maxZoom: 11.3,
      });
      if (camera) map.easeTo({ ...camera, zoom: Math.max(detailZoom + .3, camera.zoom ?? detailZoom), duration: 600 });
    }
    detailViewNeedsFocus = false;
  }

  function showOverview() {
    if (!map || !ready) return;
    londonView = false;
    ongeographychange('LAD');
    map.fitBounds(overviewBounds, { padding: 28, duration: 500 });
  }

  function showLondon() {
    if (!map || !ready || scope !== 'england') return;
    const boroughs = ladFeatures.filter(feature => String(feature.properties?.code).startsWith('E09'));
    if (!boroughs.length) return;
    const bounds = boroughs.map(featureBounds);
    const londonBounds: LngLatBoundsLike = [
      [Math.min(...bounds.map(b => b[0][0])), Math.min(...bounds.map(b => b[0][1]))],
      [Math.max(...bounds.map(b => b[1][0])), Math.max(...bounds.map(b => b[1][1]))],
    ];
    londonView = true;
    if (container.clientWidth <= 600) informationOpen = false;
    ongeographychange('LAD');
    map.fitBounds(londonBounds, {
      padding: container.clientWidth > 600
        ? { top: 75, right: 35, bottom: 55, left: 285 }
        : { top: 150, right: 25, bottom: 65, left: 25 },
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
    });
    refreshLabels();
  }

  $effect(() => { if (ready) { results; areas; updateColours(); } });
  $effect(() => { if (ready) { geography; londonView; detailPending; boundaryError; updateVisibility(); } });
  $effect(() => { if (ready) { selectedCode; featureRevision; updateSelection(); } });
  $effect(() => {
    if (ready && scope === 'england' && geography === 'MSOA' && detailParent) void loadDetailBoundary(detailParent);
  });
  $effect(() => { if (ready) { results; detailParent; detailLoading; boundaryLoading; featureRevision; showReadyDetail(); } });
  $effect(() => { if (ready) { geography; detailParent; detailLoading; prepareDetailView(); } });
  $effect(() => {
    if (ready && locationMarker) {
      if (postcodeLocation) locationMarker.setLngLat(postcodeLocation).addTo(map!);
      else locationMarker.remove();
    }
  });

  onMount(() => {
    aborter = new AbortController();
    const start = async () => {
      try {
        // The map module, its styles and all geographic data are browser-only.
        const [maplibre, , worker, land, lad, msoa] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl.css'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
          import('./data/land.json'),
          fetch(`${releaseBase}/boundaries/lad.geojson`, { signal: aborter.signal }).then(readBoundaries),
          scope === 'england' ? Promise.resolve({ type: 'FeatureCollection', features: [] } as FeatureCollection<Geometry>)
            : fetch(`${releaseBase}/boundaries/msoa.geojson`, { signal: aborter.signal }).then(readBoundaries),
        ]);
        if (teardown) return;
        // MapLibre 6 resolves the worker separately. Vite must bundle its imports.
        maplibre.setWorkerUrl(worker.default);
        MarkerClass = maplibre.Marker;
        ladFeatures = lad.features;
        allFeatures = [...lad.features, ...msoa.features];
        // Council landing views keep the geographic overview; neighbourhood links focus.
        if (areas.find(area => area.code === selectedCode)?.geography === 'LAD') previousSelected = selectedCode;
        map = new maplibre.Map({
          container,
          style: {
            version: 8,
            sources: { land: { type: 'geojson', data: land.default as FeatureCollection,
              attribution: 'Contains OS & National Statistics data © Crown copyright and database right 2025' } },
            layers: [
              { id: 'water', type: 'background', paint: { 'background-color': '#e4ece9' } },
              { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f2f1e9' } },
              { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#c1cbc4', 'line-width': 1 } },
            ],
          },
          bounds: overviewBounds,
          fitBoundsOptions: { padding: 28 },
          minZoom: 4.4,
          maxZoom: 14.5,
          maxBounds: [[-10, 48.5], [5.5, 59.8]],
          attributionControl: false,
          canvasContextAttributes: { antialias: true },
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new maplibre.ScaleControl({ unit: 'metric', maxWidth: scaleMaxWidth }), 'bottom-left');
        map.getCanvas().setAttribute('aria-label', `Interactive ${scope === 'england' ? 'England' : 'sample'} property tax map. Use the area list to choose a council or neighbourhood without the map.`);
        map.on('error', (event) => {
          // The separate search/list and panel stay mounted if graphics fail.
          if (!ready) { mapError = 'The map could not load. You can still search for a postcode or choose an area from the list.'; loading = false; }
          console.warn('Map display error:', event.error.message);
        });
        map.getCanvas().addEventListener('webglcontextlost', () => {
          ready = false;
          mapError = 'Your browser lost its map graphics connection. Continue using postcode search or the area list.';
        }, { signal: aborter.signal });
        map.on('load', () => {
          if (!map || teardown) return;
          const hatch = new Uint8Array(8 * 8 * 4);
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const pos = (y * 8 + x) * 4;
            const stripe = (x + y) % 8 < 2;
            hatch.set(stripe ? [255, 255, 255, 190] : [137, 134, 148, 0], pos);
          }
          map.addImage('unavailable-hatch', { width: 8, height: 8, data: hatch });
          for (const [level, data] of [['LAD', lad], ['MSOA', msoa]] as const) {
            map.addSource(level, { type: 'geojson', data, promoteId: 'code' });
            map.addLayer({ id: `${level}-fill`, type: 'fill', source: level, paint: {
              'fill-color': ['coalesce', ['feature-state', 'colour'], colourByKind.unavailable],
              'fill-opacity': 0.87,
            } });
            map.addLayer({ id: `${level}-unavailable`, type: 'fill', source: level, paint: {
              'fill-pattern': 'unavailable-hatch',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'unavailable'], false], 1, 0],
            } });
            map.addLayer({ id: `${level}-outline`, type: 'line', source: level, paint: {
              'line-color': '#ffffff', 'line-opacity': 0.78, 'line-width': level === 'LAD' ? 1.25 : 0.7,
            } });
            map.on('click', `${level}-fill`, (event) => {
              const code = event.features?.[0]?.properties?.code;
              if (typeof code === 'string') onselect(code);
            });
            map.on('mousemove', `${level}-fill`, (event) => {
              if (!map) return;
              map.getCanvas().style.cursor = 'pointer';
              const code = event.features?.[0]?.properties?.code;
              const area = areas.find(item => item.code === code);
              hoverName = area?.name ?? '';
              hoverResult = resultPresentation(results[code]).label;
            });
            map.on('mouseleave', `${level}-fill`, () => {
              if (map) map.getCanvas().style.cursor = '';
              hoverName = '';
            });
          }
          if (scope === 'england') {
            map.addLayer({ id: 'LAD-hit', type: 'fill', source: 'LAD', paint: { 'fill-opacity': 0 } });
            map.addLayer({ id: 'LAD-context', type: 'line', source: 'LAD', paint: { 'line-color': '#b6c3b8', 'line-width': .8 } });
            map.on('click', (event) => {
              if (!map || geography !== 'MSOA' || !ondetailrequest) return;
              if (map.queryRenderedFeatures(event.point, { layers: ['MSOA-fill'] }).length) return;
              const code = map.queryRenderedFeatures(event.point, { layers: ['LAD-hit'] })[0]?.properties?.code;
              if (typeof code === 'string') void ondetailrequest(code);
            });
          }
          map.addSource('selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'selection-halo', type: 'line', source: 'selection', paint: { 'line-color': '#ffffff', 'line-width': 5.5 } });
          map.addLayer({ id: 'selection-border', type: 'line', source: 'selection', paint: { 'line-color': '#203f39', 'line-width': 2.5 } });
          refreshLabels();
          const pin = document.createElement('span');
          pin.className = 'postcode-map-pin';
          pin.setAttribute('role', 'img');
          pin.setAttribute('aria-label', 'Approximate postcode location');
          locationMarker = new maplibre.Marker({ element: pin });
          map.on('zoomend', syncGeographyToScale);
          map.on('moveend', () => {
            refreshLabels();
            if (londonView) syncGeographyToScale();
            else requestCentreDetail();
          });
          loading = false;
          mapError = '';
          ready = true;
        });
      } catch (error) {
        if (teardown) return;
        console.warn('Map unavailable:', error);
        mapError = 'The map is unavailable in this browser or could not load. Postcode search, the area list and all comparisons still work.';
        loading = false;
      }
    };
    void start();
    const resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(container);
    return () => {
      teardown = true;
      ready = false;
      aborter.abort();
      resizeObserver.disconnect();
      labels.forEach(({ marker }) => marker.remove());
      locationMarker?.remove();
      map?.remove();
    };
  });

  async function readBoundaries(response: Response): Promise<FeatureCollection<Geometry>> {
    if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
    const data = await response.json();
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid boundary data');
    return data;
  }
</script>

<div class="map-shell" data-testid="tax-map">
  <div class="map-canvas" bind:this={container}></div>
  <div class="map-information">
    <details class="map-context" bind:open={informationOpen}>
      <summary aria-label="Map information and selected area">
        <span class="context-heading"><span class="context-dot"></span><strong>{londonView ? geography === 'MSOA' ? 'London neighbourhood estimates' : 'London borough estimates' : `${geographyLabel(geography)} estimates`}</strong><svg class="context-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        {#if selectedArea}
          <span class="context-selection" aria-live="polite" data-testid="map-selection-summary">
            <strong class="selected-name">{selectedArea.name}</strong>
            {#if selectedResult?.status === 'available'}
              <span class="selected-amount" style:color={selectedPresentation.colour}>{selectedResult.scenario.total.displayPounds} <span>({selectedResult.difference.displayPounds})</span></span>
              <span class="selected-basis">Scenario cost (change) · {selectedResult.mode === 'purchase-year' ? 'purchase year' : 'per year'}</span>
            {:else}
              <span class="selected-basis">{selectedResult?.status === 'invalid-input' ? 'Check comparison inputs' : 'Estimate unavailable'}</span>
            {/if}
            {#if selectedArea.geography !== geography}<span class="selected-basis">Selected: {geographyLabel(selectedArea.geography).toLowerCase()} estimate</span>{/if}
            {#if londonView && !selectedInLondon}<span class="selected-basis">This selection is outside London. Choose an area on the map to compare.</span>{/if}
          </span>
        {/if}
      </summary>
      <div class="context-guidance">
        <p>{londonView && geography === 'LAD' ? 'London borough comparisons' : geography === 'LAD' ? 'Zoom in for neighbourhood estimates' : scope === 'england' ? `Neighbourhoods for ${detailName}` : 'Neighbourhoods use their own price and tax inputs'}</p>
        {#if londonView}<p class="london-guidance">Zoom to the 2 km scale for neighbourhood estimates. Zoom back out to compare boroughs.</p>{/if}
        <span>{scope === 'england' ? geography === 'MSOA' ? 'Pan or click another council to load its neighbourhoods.' : 'Blue is lower cost · orange is higher · hatched is unavailable.' : 'Uncoloured land is outside the sample.'}</span>
      </div>
    </details>
    {#if ready && geography === 'MSOA' && (detailPending || boundaryError)}
      <div class="detail-status" role="status">
        {#if boundaryError}
          <span>{boundaryError}</span>
          <button type="button" onclick={() => { boundaryParent = null; if (detailParent) void loadDetailBoundary(detailParent); }}>Retry boundaries</button>
        {:else}
          <span>Loading neighbourhoods for {detailName}…</span>
        {/if}
      </div>
    {/if}
  </div>
  {#if ready}
    <div class="overview-controls" aria-label="Map views">
      <button type="button" class="overview-button" onclick={showOverview} aria-label={scope === 'england' ? 'Show all England councils' : 'Show all sample councils'}>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4M7 7h6v6H7z" stroke="currentColor" stroke-width="1.5"/></svg>
      {scope === 'england' ? 'All England' : 'All sample areas'}
      </button>
      {#if scope === 'england'}<button type="button" class="overview-button" class:active={londonView} aria-pressed={londonView} onclick={showLondon} aria-label="Show all London boroughs">All London</button>{/if}
    </div>
  {/if}
  {#if loading}
    <div class="map-message" role="status"><span class="loading-ring"></span><strong>Loading the {scope === 'england' ? 'England' : 'sample'} map</strong><span>You can already explore the area list.</span></div>
  {:else if mapError}
    <div class="map-message map-fallback" role="status">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m5 12 12-5 14 5 12-5v29l-12 5-14-5-12 5V12Z" stroke="currentColor" stroke-width="2"/><path d="M17 7v29m14-24v29" stroke="currentColor" stroke-width="2"/></svg>
      <strong>Explore using search or the area list</strong><span>{mapError}</span>
    </div>
  {/if}
  {#if hoverName && ready}
    <div class="map-hover" aria-hidden="true"><strong>{hoverName}</strong><span>{hoverResult}</span></div>
  {/if}
</div>

<style>
  .map-shell { position: relative; height: 100%; min-height: 550px; overflow: hidden; background: #e4ece9; border-radius: inherit; isolation: isolate; }
  .map-canvas { position: absolute; inset: 0; }
  .map-information { position: absolute; top: 20px; left: 20px; width: min(260px, calc(100% - 80px)); color: #233c34; }
  .map-context { background: #fffffff2; border: 1px solid #d7ded5; border-radius: 7px; box-shadow: 0 2px 6px #263b3410; }
  .map-context summary { padding: 11px 14px; cursor: pointer; list-style: none; border-radius: 7px; }
  .map-context summary::-webkit-details-marker { display: none; }
  .map-context summary:focus-visible { outline: 3px solid #19789e; outline-offset: 2px; }
  .context-heading { display: flex; align-items: center; gap: 8px; font-size: .72rem; }
  .context-heading strong { font-weight: 650; }
  .context-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #367358; }
  .context-chevron { width: 16px; height: 16px; flex-shrink: 0; margin-left: auto; }
  .map-context[open] .context-chevron { transform: rotate(180deg); }
  .context-selection { display: block; padding-top: 9px; }
  .selected-name { display: block; font-size: .83rem; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
  .selected-amount { display: block; margin-top: 4px; font-size: .95rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .selected-amount span { font-size: .8rem; font-weight: 550; }
  .selected-basis { display: block; margin-top: 3px; color: #5e7066; font-size: .62rem; line-height: 1.4; }
  .context-guidance { border-top: 1px solid #e2e7df; padding: 9px 14px 11px; color: #5e7066; font-size: .64rem; line-height: 1.5; }
  .context-guidance p { margin: 0 0 3px; color: #385447; font-weight: 600; }
  .context-guidance .london-guidance { font-weight: 400; margin-bottom: 5px; }
  .overview-controls { position: absolute; top: 20px; right: 54px; display: flex; gap: 6px; }
  .overview-button { min-height: 34px; display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #d7ded5; border-radius: 6px; color: #344d43; padding: 6px 9px; font: inherit; font-size: .65rem; cursor: pointer; }
  .overview-button svg { width: 16px; height: 16px; }
  .overview-button:hover { background: #f4f6f2; }
  .overview-button.active { background: #e4ede3; border-color: #52745a; color: #254e3b; }
  .overview-button:focus-visible { outline: 3px solid #19789e; outline-offset: 2px; }
  .map-message { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(350px, 85%); display: flex; flex-direction: column; align-items: center; gap: .7rem; text-align: center; color: #345147; font-size: .8rem; padding: 26px; border-radius: 10px; background: #f7f9f4ed; box-shadow: 0 5px 30px #293c3610; }
  .map-message strong { font-size: .9rem; font-weight: 650; }
  .map-message span { line-height: 1.6; }
  .map-message svg { width: 42px; height: 42px; opacity: .6; }
  .detail-status { margin-top: 8px; padding: 10px 13px; border: 1px solid #ccd7cc; border-radius: 6px; background: #fffef9f5; color: #385447; font-size: .72rem; line-height: 1.5; }
  .detail-status button { display: block; margin-top: 7px; font-size: .7rem; }
  .loading-ring { width: 24px; height: 24px; border: 2px solid #d4ded6; border-top-color: #476d59; border-radius: 50%; animation: spin 1s linear infinite; }
  .map-hover { position: absolute; bottom: 40px; left: 20px; min-width: 150px; max-width: min(260px, calc(100% - 40px)); border-radius: 7px; padding: 11px 16px; color: #254033; background: #fffffff5; box-shadow: 0 3px 15px #1d3a331a; pointer-events: none; text-align: center; font-size: .75rem; overflow-wrap: anywhere; }
  .map-hover span { display: block; margin-top: 3px; color: #738078; font-size: .7rem; }
  :global(.area-map-label) { border: 1px solid #d0d9d1; border-radius: 5px; padding: 6px 9px 6px 19px; color: #283f36; background: #fffffff0; box-shadow: 0 2px 7px #29453814; font: 600 11px/1.2 system-ui, sans-serif; white-space: nowrap; cursor: pointer; }
  :global(.area-map-label::before) { content: ''; position: absolute; left: 7px; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--area-colour); }
  :global(.area-map-label:hover), :global(.area-map-label.is-selected) { border-color: #426953; box-shadow: 0 0 0 2px #42695320; }
  :global(.area-map-label:focus-visible) { outline: 3px solid #19789e; outline-offset: 3px; }
  :global(.area-map-label[hidden]) { display: none; }
  :global(.postcode-map-pin) { display: block; width: 14px; height: 14px; border: 3px solid white; border-radius: 50%; background: #163d38; box-shadow: 0 0 0 6px #173b3529, 0 2px 6px #173b3550; }
  :global(.maplibregl-ctrl-top-right) { top: 12px; right: 10px; }
  :global(.maplibregl-ctrl-group) { box-shadow: none !important; border: 1px solid #ccd7ce; }
  :global(.maplibregl-ctrl-group button) { width: 32px; height: 32px; }
  :global(.maplibregl-ctrl-attrib) { font-size: 9px !important; }
  :global(.maplibregl-ctrl-scale) { border-color: #728078 !important; color: #5e7367 !important; font-size: 9px !important; background: #ffffff70 !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .loading-ring { animation: none; } }
  @media (max-width: 700px) {
    .map-shell { min-height: 430px; }
    .map-information { top: 13px; left: 12px; width: min(240px, calc(100% - 70px)); }
    .map-context summary { padding: 9px 11px; }
    .context-guidance { padding: 8px 11px 9px; }
    .context-heading { font-size: .67rem; }
    .map-hover { left: 12px; bottom: 65px; min-width: 0; max-width: calc(100% - 140px); }
    .overview-controls { top: auto; bottom: 65px; right: 10px; flex-direction: column; align-items: stretch; }
  }
</style>
