<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  let { children } = $props();
</script>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Tax Map home"><img class="brand-mark" src="/favicon.svg" alt="" width="38" height="38" /><span>Tax <strong>Map</strong></span></a>
  <nav aria-label="Main navigation">
    <a href="/map/" aria-current={page.url.pathname === '/' || page.url.pathname.startsWith('/map') ? 'page' : undefined}>Explore the map</a>
    <a href="/methodology/" aria-current={page.url.pathname.startsWith('/methodology') ? 'page' : undefined}>How it works</a>
    <a href="/data-sources/" aria-current={page.url.pathname.startsWith('/data-sources') ? 'page' : undefined}>Data & coverage</a>
  </nav>
  <span class="sample-tag">ENGLAND · EXPLORER</span>
</header>
<main id="main" tabindex="-1">{@render children()}</main>
<footer class="site-footer"><span><strong>Tax Map</strong> · An illustration of change, grounded in open data.</span><span>Data preview · 26 September 2026</span></footer>
