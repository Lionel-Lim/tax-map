<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { setContext } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { COMPARISON_SESSION, type ComparisonSession } from '$lib/comparison-session.js';
  const comparisonSession = $state<ComparisonSession>({ saved: null, resume: false });
  setContext(COMPARISON_SESSION, comparisonSession);
  beforeNavigate(({ from, to, type }) => {
    comparisonSession.resume = Boolean(comparisonSession.saved && from && to
      && /^\/(methodology|data-sources)\/?$/.test(from.url.pathname)
      && (to.url.pathname === '/' || /^\/map\/?$/.test(to.url.pathname))
      // Shallow history entries retain the route's original URL in SvelteKit.
      // The address bar identifies the actual comparison being revisited.
      && (type === 'popstate' ? window.location.search === comparisonSession.saved.query : !to.url.search));
  });
  let { children } = $props();
  const socialTitle = $derived(page.url.pathname.startsWith('/methodology') ? 'How it works — Tax Map' : page.url.pathname.startsWith('/data-sources') ? 'Data & coverage — Tax Map' : 'See how property tax could change — Tax Map');
  const socialDescription = 'Find your area in England and compare Council Tax with an illustrative annual property tax. Choose a rate or use your own figures.';
</script>

<svelte:head>
  <link rel="canonical" href={`https://taxmap.limsight.com${page.url.pathname}`} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Tax Map" />
  <meta property="og:title" content={socialTitle} />
  <meta property="og:description" content={socialDescription} />
  <meta property="og:url" content={`https://taxmap.limsight.com${page.url.pathname}`} />
  <meta property="og:image" content="https://taxmap.limsight.com/social-preview.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Tax Map: explore how an illustrative property tax could change costs for a home in England." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={socialTitle} />
  <meta name="twitter:description" content={socialDescription} />
  <meta name="twitter:image" content="https://taxmap.limsight.com/social-preview.png" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Tax Map home"><img class="brand-mark" src="/favicon.svg" alt="" width="38" height="38" /><span>Tax <strong>Map</strong></span></a>
  <nav aria-label="Main navigation">
    <a href="/map/" aria-current={page.url.pathname === '/' || page.url.pathname.startsWith('/map') ? 'page' : undefined}>Explore the map</a>
    <a href="/methodology/" aria-current={page.url.pathname.startsWith('/methodology') ? 'page' : undefined}>How it works</a>
    <a href="/data-sources/" aria-current={page.url.pathname.startsWith('/data-sources') ? 'page' : undefined}>Data & coverage</a>
  </nav>
</header>
<main id="main" tabindex="-1">
  {#if comparisonSession.saved && /^\/(methodology|data-sources)/.test(page.url.pathname)}
    <div class="return-comparison"><a href="/map/">← Return to your comparison</a><span>Your figures are kept while you read.</span></div>
  {/if}
  {@render children()}
</main>
<footer class="site-footer">
  <div class="footer-brand">
    <div class="footer-attribution">
      <strong>Tax Map</strong><span aria-hidden="true">·</span>
      <span class="footer-project">A project by <a href="https://limsight.com/" target="_blank" rel="noopener noreferrer">Limsight <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a></span>
    </div>
    <p>An illustration of change, grounded in open data.</p>
  </div>
  <div class="footer-meta">
    <span>Data preview · 26 September 2026</span>
    <a class="github-link" href="https://github.com/Lionel-Lim/tax-map" target="_blank" rel="noopener noreferrer">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <span>View source on GitHub <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></span>
    </a>
  </div>
</footer>
