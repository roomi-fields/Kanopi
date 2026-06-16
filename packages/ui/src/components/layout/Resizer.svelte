<script lang="ts">
  type Props = {
    /**
     * 'right' = drag pulls width to the right (left sidebar).
     * 'left' = drag pulls width to the left (right panel).
     * 'top' = drag pulls height upward (bottom panel) — vertical resizer.
     */
    side: 'right' | 'left' | 'top';
    /** Current width (horizontal sides) or height ('top') being resized. */
    width: number;
    onResize: (w: number) => void;
  };
  const { side, width, onResize }: Props = $props();

  const vertical = $derived(side === 'top');

  let dragging = $state(false);

  function onDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    const start = vertical ? e.clientY : e.clientX;
    const startSize = width;
    const target = e.currentTarget as HTMLDivElement;
    target.setPointerCapture(e.pointerId);

    const move = (mv: PointerEvent) => {
      if (vertical) {
        // Dragging the top edge upward grows the bottom panel.
        const delta = mv.clientY - start;
        onResize(startSize - delta);
      } else {
        const delta = mv.clientX - start;
        onResize(side === 'right' ? startSize + delta : startSize - delta);
      }
    };
    const up = (uv: PointerEvent) => {
      dragging = false;
      try {
        target.releasePointerCapture(uv.pointerId);
      } catch {
        /* */
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
</script>

<div
  class="resizer"
  class:dragging
  class:vertical
  role="separator"
  aria-orientation={vertical ? 'horizontal' : 'vertical'}
  tabindex="-1"
  onpointerdown={onDown}
></div>

<style>
  .resizer {
    width: 4px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .resizer.vertical {
    width: auto;
    height: 4px;
    cursor: row-resize;
  }
  .resizer:hover,
  .resizer.dragging {
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber-glow);
  }
</style>
