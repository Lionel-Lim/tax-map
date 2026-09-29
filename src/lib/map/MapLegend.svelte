<script lang="ts">
  import HelpPopover from '../components/HelpPopover.svelte';
  import type { ComparisonMode } from '../domain/tax/types.js';
  import { colourByKind } from './presentation.js';

  let { mode = 'ongoing-owner' }: { mode?: ComparisonMode } = $props();
</script>

<div class="map-legend" aria-label="Map colour legend">
  <div class="legend-heading">Estimated change <span>{mode === 'purchase-year' ? '· purchase year' : '· per year'}</span>
    <HelpPopover title="How map colours work" fallback="/methodology/#unavailable">
      <p>“Within £100” includes changes from <strong>−£100 to +£100</strong>. It groups similar results; it does not measure the uncertainty of an estimate.</p>
      <p>Colours use annual pounds even when you display monthly equivalents or percentages. In purchase-year mode, they use purchase-year pounds.</p>
      <p>Hatched areas have no estimate.</p>
    </HelpPopover>
  </div>
  <ul>
    <li><i style:background={colourByKind.lower}></i>Lower by <span>over £100</span></li>
    <li><i style:background={colourByKind['near-zero']}></i>Within £100</li>
    <li><i style:background={colourByKind.higher}></i>Higher by <span>over £100</span></li>
    <li><i class="unavailable" style:background-color={colourByKind.unavailable}></i>No estimate</li>
  </ul>
</div>

<style>
  .map-legend { color: #354943; font-size: .78rem; line-height: 1.5; padding: 16px 18px; background: var(--paper); border: 1px solid var(--border); border-top: 0; border-radius: 0 0 10px 10px; }
  .legend-heading { font-weight: 700; font-size: .82rem; margin-bottom: .65rem; }
  .legend-heading span { font-weight: 400; color: #65756f; }
  ul { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem 1rem; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; column-gap: .35rem; white-space: nowrap; }
  li span { color: #65756f; }
  i { width: .75rem; height: .75rem; flex: 0 0 auto; display: inline-block; border: 1px solid #243b3420; border-radius: 2px; }
  i.unavailable { background-image: repeating-linear-gradient(135deg, transparent, transparent 3px, #ffffff90 3px, #ffffff90 4px); }
  @media (max-width: 600px) {
    .map-legend { padding: 16px; }
    ul { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
    li { display: grid; grid-template-columns: auto 1fr; white-space: normal; }
    li span { grid-column: 2; }
  }
</style>
