<script lang="ts">
  // [921] Indicateur VISIBLE OBLIGATOIRE du mode test. Sans lui, la confusion inverse est garantie
  // (« pourquoi ça produit toujours pareil ? ») — le symétrique exact de la question du jour vivant.
  // Rien à l'écran hors mode test (option jamais un défaut). La graine est stable par onglet.
  import { testSeed } from '../../lib/mode-test';
  const seed = testSeed();
</script>

{#if seed !== undefined}
  <span
    class="test-badge"
    title="Mode test — graine figée {seed}. Chaque produce redonne la MÊME suite (reproduction du comparateur). Fermez l'onglet ou retirez ?seed= de l'URL pour revenir au tirage vivant."
  >
    <span class="dot"></span>
    mode test · graine {seed}
  </span>
{/if}

<style>
  .test-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border: 1px solid var(--amber);
    border-radius: 3px;
    background: rgba(255, 176, 0, 0.08);
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber-glow);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
