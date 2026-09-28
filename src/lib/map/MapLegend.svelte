<script lang="ts">
  import type { ComparisonMode } from '../domain/tax/types.js';
  import { colourByKind } from './presentation.js';

  let { mode = 'ongoing-owner' }: { mode?: ComparisonMode } = $props();
</script>

<div class="map-legend" aria-label="Map colour legend">
  <div class="legend-heading">Change in cost <span>{mode === 'purchase-year' ? '· purchase year' : '· per year'}</span></div>
  <ul>
    <li><i style:background={colourByKind.lower}></i>Lower <span>over £100</span></li>
    <li><i style:background={colourByKind['near-zero']}></i>Within £100 <span>either way</span></li>
    <li><i style:background={colourByKind.higher}></i>Higher <span>over £100</span></li>
    <li><i class="unavailable" style:background-color={colourByKind.unavailable}></i>Unavailable</li>
  </ul>
  <p>The neutral band includes −£100 to +£100. It is a display threshold, not a confidence interval. Colours keep this basis in every display mode.</p>
</div>

<style>
  .map-legend { color: #354943; font-size: .74rem; line-height: 1.45; }
  .legend-heading { font-weight: 700; font-size: .78rem; margin-bottom: .55rem; }
  .legend-heading span { font-weight: 400; color: #65756f; }
  ul { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem 1rem; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; column-gap: .35rem; white-space: nowrap; }
  li span { color: #65756f; }
  i { width: .75rem; height: .75rem; flex: 0 0 auto; display: inline-block; border: 1px solid #243b3420; border-radius: 2px; }
  i.unavailable { background-image: repeating-linear-gradient(135deg, transparent, transparent 3px, #ffffff90 3px, #ffffff90 4px); }
  p { margin: .7rem 0 0; max-width: 70ch; color: #697872; font-size: .68rem; }
  @media (max-width: 600px) { li span { display: none; } ul { gap: .55rem .7rem; } }
</style>
