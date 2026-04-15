<script lang="ts">
  type Props = {
    /** 'right' = drag pulls width to the right (left sidebar). 'left' = drag pulls width to the left (right panel). */
    side: 'right' | 'left';
    width: number;
    onResize: (w: number) => void;
  };
  const { side, width, onResize }: Props = $props();

  let dragging = $state(false);

  function onDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    const startX = e.clientX;
    const startW = width;
    const target = e.currentTarget as HTMLDivElement;
    target.setPointerCapture(e.pointerId);

    const move = (mv: PointerEvent) => {
      const delta = mv.clientX - startX;
      const next = side === 'right' ? startW + delta : startW - delta;
      onResize(next);
    };
    const up = (uv: PointerEvent) => {
      dragging = false;
      try { target.releasePointerCapture(uv.pointerId); } catch { /* */ }
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
  role="separator"
  aria-orientation="vertical"
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
  .resizer:hover,
  .resizer.dragging {
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber-glow);
  }
</style>
