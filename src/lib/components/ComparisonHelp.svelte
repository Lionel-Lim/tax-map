<script lang="ts">
  import type { ComparisonMode } from '$lib/domain/tax/types.js';
  let { mode }: { mode?: ComparisonMode } = $props();
</script>

{#if mode === 'annualised-ownership'}
  <p><strong>Spread purchase costs over time:</strong> compare Council Tax plus Stamp Duty divided by your chosen number of years with the annual scenario tax.</p>
{:else if mode === 'ongoing-owner'}
  <p><strong>Yearly costs without a purchase:</strong> compare Council Tax with the annual scenario tax. Stamp Duty is excluded.</p>
{:else if mode === 'purchase-year'}
  <p><strong>Costs in the purchase year:</strong> compare Council Tax plus the full Stamp Duty payment with one year of the scenario tax. This is a first-year comparison.</p>
{:else}
  <ol>
    <li><strong>Spread purchase costs over time:</strong> compare Council Tax plus Stamp Duty divided by your chosen number of years with the annual scenario tax.</li>
    <li><strong>Yearly costs without a purchase:</strong> compare Council Tax with the annual scenario tax. Stamp Duty is excluded.</li>
    <li><strong>Costs in the purchase year:</strong> compare Council Tax plus the full Stamp Duty payment with one year of the scenario tax. This is a first-year comparison.</li>
  </ol>
{/if}
