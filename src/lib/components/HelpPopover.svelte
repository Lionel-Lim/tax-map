<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { title, label = title, text = '', fallback = '/methodology/', children }: {
    title: string; label?: string; text?: string; fallback?: string; children: Snippet;
  } = $props();
  const id = $props.id();
  let available = $state(false);
  let opened = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let panel: HTMLDivElement;
  let heading: HTMLHeadingElement;

  function position() {
    if (!panel?.matches(':popover-open') || !trigger) return;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
    const gap = 10, edge = 16;
    panel.style.width = `${Math.min(380, width - edge * 2)}px`;
    panel.style.maxHeight = `${Math.max(100, height - edge * 2)}px`;
    const anchor = trigger.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const below = topEdge + height - anchor.bottom - gap - edge;
    const above = anchor.top - topEdge - gap - edge;
    const preferredTop = below >= box.height || below >= above ? anchor.bottom + gap : anchor.top - box.height - gap;
    panel.style.left = `${Math.max(leftEdge + edge, Math.min(anchor.left, leftEdge + width - box.width - edge))}px`;
    panel.style.top = `${Math.max(topEdge + edge, Math.min(preferredTop, topEdge + height - box.height - edge))}px`;
  }
  function toggled(event: ToggleEvent) {
    opened = event.newState === 'open';
    if (opened) {
      position();
      heading.focus({ preventScroll: true });
    }
  }
  function close() {
    panel.hidePopover();
    trigger?.focus({ preventScroll: true });
  }
  onMount(() => { available = 'showPopover' in HTMLElement.prototype; });
  $effect(() => {
    if (!opened) return;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      observer.disconnect();
    };
  });
</script>

{#snippet icon()}
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6" r="1" fill="currentColor"/></svg>
{/snippet}
{#if available}
  <!-- WebKit does not focus buttons on pointer activation. Focus the invoker before native popover handling so Escape returns here. -->
  <button bind:this={trigger} type="button" class="info-trigger" class:with-text={text} aria-label={label} aria-haspopup="dialog" aria-expanded={opened} aria-controls={id} popovertarget={id} onclick={(event) => event.currentTarget.focus({ preventScroll: true })}>{@render icon()}{#if text}<span>{text}</span>{/if}</button>
{:else}
  <a class="info-trigger" class:with-text={text} href={fallback} aria-label={label}>{@render icon()}{#if text}<span>{text}</span>{/if}</a>
{/if}
<div bind:this={panel} {id} class="info-popover" popover="auto" role="dialog" aria-labelledby={`${id}-title`} ontoggle={toggled}>
  <div class="overlay-heading"><h2 bind:this={heading} id={`${id}-title`} class="overlay-title" tabindex="-1">{title}</h2><button type="button" class="overlay-close" aria-label="Close" onclick={close}>×</button></div>
  <div class="overlay-body">{@render children()}</div>
</div>
