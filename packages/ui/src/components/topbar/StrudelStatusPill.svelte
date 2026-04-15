<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { onStrudelStatus, type StrudelStatus } from '../../lib/runtimes/strudel';

  let status = $state<StrudelStatus>('idle');
  let unsub: (() => void) | undefined;

  onMount(() => {
    unsub = onStrudelStatus((s) => (status = s));
  });
  onDestroy(() => unsub?.());

  const labels: Record<StrudelStatus, string> = {
    idle: 'idle',
    loading: 'loading…',
    ready: 'ready',
    error: 'error'
  };
</script>

<div class="pill" data-status={status} title="Strudel runtime status">
  <span class="dot"></span>
  <span class="label">strudel</span>
  <span class="state">{labels[status]}</span>
</div>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: all 0.2s;
  }
  .label { color: var(--text-muted); }
  .state { color: var(--text-dim); }

  .pill[data-status='loading'] .dot {
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber-glow);
    animation: blink 0.7s ease-in-out infinite;
  }
  .pill[data-status='ready'] .dot {
    background: var(--green);
    box-shadow: 0 0 5px var(--green-glow);
  }
  .pill[data-status='ready'] .state { color: var(--green); }
  .pill[data-status='error'] .dot {
    background: var(--red);
    box-shadow: 0 0 5px var(--red-glow);
  }
  .pill[data-status='error'] .state { color: var(--red); }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
