<script lang="ts">
  import type { Snippet } from 'svelte';

  let { open = $bindable(false), title, children }: { open?: boolean; title: string; children: Snippet } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;
  let opener: HTMLElement | null = null;

  $effect(() => {
    if (open && dialog && !dialog.open) {
      const active = document.activeElement as HTMLElement | null;
      const popover = active?.closest('[popover]');
      // A modal closes native help popovers. Return to their visible trigger,
      // rather than to a source-records button inside a now-hidden popover.
      opener = popover ? document.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(popover.id)}"]`) : active;
      dialog.showModal();
      heading.focus({ preventScroll: true });
    } else if (!open && dialog?.open) dialog.close();
  });
  function closed() {
    open = false;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
</script>

<dialog bind:this={dialog} class="overlay-dialog" aria-labelledby={id} onclose={closed}>
  <div class="overlay-heading"><h2 bind:this={heading} {id} class="overlay-title" tabindex="-1">{title}</h2><button type="button" class="overlay-close" aria-label="Close" onclick={() => open = false}>×</button></div>
  <div class="overlay-body">{@render children()}</div>
</dialog>
