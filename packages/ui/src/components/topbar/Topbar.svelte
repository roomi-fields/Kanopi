<script lang="ts">
  import TransportCluster from './TransportCluster.svelte';
  import { ui } from '../../stores/ui.svelte';
</script>

<header class="topbar">
  <div class="brand">
    <svg class="sigil" viewBox="0 0 24 24" fill="none">
      <path d="M12 22 L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M3 5 Q12 2 21 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />
      <path d="M5 9 Q12 6 19 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8" />
      <path d="M7 13 Q12 10 17 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.6" />
      <circle cx="12" cy="22" r="1" fill="currentColor" />
    </svg>
    <span class="brand-name">KANOPI</span>
    <span class="brand-sep">·</span>
    <span class="workspace-name">myset</span>
  </div>

  <div class="topbar-center">
    <TransportCluster />
  </div>

  <div class="topbar-right">
    <button class="cmdk-pill" type="button" onclick={() => ui.togglePalette()}>
      <kbd>⌘</kbd><kbd>K</kbd>
      <span>command</span>
    </button>
    <button class="icon-btn" type="button" title="Settings">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
        <circle cx="7" cy="7" r="2" />
        <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.4 1.4M9.6 9.6L11 11M3 11l1.4-1.4M9.6 4.4L11 3" />
      </svg>
    </button>
  </div>
</header>

<style>
  .topbar {
    display: grid;
    grid-template-columns: 240px 1fr auto;
    align-items: center;
    background: linear-gradient(to bottom, #171a1f, #13161a);
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

  .brand-sep {
    color: var(--text-faint);
    margin: 0 2px;
  }

  .workspace-name {
    font-family: var(--font-mono);
    font-weight: 400;
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 0.06em;
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
