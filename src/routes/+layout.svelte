<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Property Tax Atlas home"><span class="brand-mark" aria-hidden="true">▥</span> Property Tax <strong>Atlas</strong></a>
  <nav aria-label="Main navigation">
    <a href="/map/">Explore the map</a>
    <a href="/methodology/">Methodology</a>
    <a href="/data-sources/">Data & sources</a>
  </nav>
  <span class="sample-tag">ENGLAND · EXPLORER</span>
</header>
<main id="main">{@render children()}</main>
<footer class="site-footer"><span>An illustration of change, grounded in open data.</span><span>Internal validation release · 26 September 2026</span></footer>
