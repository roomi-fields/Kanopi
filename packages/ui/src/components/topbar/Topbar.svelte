<script lang="ts">
  import TransportCluster from './TransportCluster.svelte';
  import StrudelStatusPill from './StrudelStatusPill.svelte';
  import { ui } from '../../stores/ui.svelte';
</script>

<header class="topbar">
  <div class="brand">
    <svg class="sigil" viewBox="0 0 24 24" fill="none">
      <path d="M12 22 L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path
        d="M3 5 Q12 2 21 5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M5 9 Q12 6 19 9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M7 13 Q12 10 17 13"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
        opacity="0.6"
      />
      <circle cx="12" cy="22" r="1" fill="currentColor" />
    </svg>
    <span class="brand-name">KANOPI</span>
  </div>

  <div class="topbar-center">
    <TransportCluster />
  </div>

  <div class="topbar-right">
    <StrudelStatusPill />
    <button class="cmdk-pill" type="button" onclick={() => ui.togglePalette()}>
      <kbd>⌘</kbd><kbd>K</kbd>
      <span>command</span>
    </button>
    <button
      class="icon-btn"
      type="button"
      title={ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onclick={() => ui.toggleTheme()}
    >
      {#if ui.theme === 'dark'}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <circle cx="7" cy="7" r="3" />
          <path
            d="M7 0.5v2M7 11.5v2M0.5 7h2M11.5 7h2M2.3 2.3l1.4 1.4M10.3 10.3l1.4 1.4M2.3 11.7l1.4-1.4M10.3 3.7l1.4-1.4"
          />
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none">
          <path d="M6.5 1a5.5 5.5 0 1 0 6 9.3A6.2 6.2 0 0 1 6.5 1Z" />
        </svg>
      {/if}
    </button>
  </div>
</header>

<style>
  .topbar {
    display: grid;
    grid-template-columns: 240px 1fr auto;
    align-items: center;
    background: linear-gradient(to bottom, var(--bar-gradient-a), var(--bar-gradient-b));
    border-bottom: 1px solid var(--border);
    padding: 0 16px 0 14px;
    position: relative;
  }

  .topbar::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--amber-glow), transparent);
    opacity: 0.4;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sigil {
    width: 22px;
    height: 22px;
    color: var(--amber);
    filter: drop-shadow(0 0 4px var(--amber-glow));
  }

  .brand-name {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--text);
  }

  .topbar-center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cmdk-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px 5px 7px;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    transition: all 0.15s;
  }

  .cmdk-pill:hover {
    color: var(--text-muted);
    border-color: var(--elevated);
    background: rgba(255, 255, 255, 0.02);
  }

  .cmdk-pill kbd {
    display: inline-block;
    padding: 1px 4px;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-size: 9px;
    color: var(--text-muted);
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    border-radius: 3px;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    color: var(--text-muted);
    background: var(--elevated);
  }
</style>
