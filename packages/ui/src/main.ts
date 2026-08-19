import { mount } from 'svelte';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';
import App from './App.svelte';
import { restoreWorkspace } from './lib/persistence/snapshot.svelte';
import { migrateLegacyWorkspace } from './lib/persistence/workspace-db';
import { core } from './lib/core';
import { workspace } from './stores/workspace.svelte';
import { clock } from './stores/clock.svelte';
import { actors } from './stores/actors.svelte';
import { openBlocks, installSlotErrorBridge } from './stores/blocks.svelte';
import { ui } from './stores/ui.svelte';
import { production } from './stores/production.svelte';
import { transport } from './stores/transport.svelte';
import { installKanopiApi } from './lib/pilot/kanopi-api';
import { personalPitchLibSnapshot } from './stores/personal-pitch-lib.svelte';
import { setAssetBaseUrl, onStrudelError } from 'runtime-codevoices';
import { installPreloadOnOpen } from './lib/runtimes/preload-on-open.svelte';
import { interpsForScene, assetsForScene } from './lib/runtimes/bpx-adapter';
import { warmUp } from './lib/runtimes/code-voice-warmup';

const target = document.getElementById('app');
if (!target) throw new Error('#app root not found');

// BUNDLING [764]/[765] — les bibliothèques standard des moteurs invités (soundfonts GM Strudel,
// samples Mercury) sont auto-hébergées sur NOTRE VPS, servies en lazy. L'hôte POSE l'URL de base au
// démarrage (le défaut du paquet est `store.roomi-fields.com` SANS `/assets`) : l'architecte monte le
// répertoire statique sous `/assets/` (strudel-soundfonts/ + mercury-samples/ dessous, décision [765]).
// ASSET_PATHS y ajoute les sous-chemins → `…/assets/strudel-soundfonts/sound`, `…/assets/mercury-samples`.
setAssetBaseUrl('https://store.roomi-fields.com/assets');

// KAN-UX5 — le snapshot global d'avant les comptes devient l'espace du compte
// par défaut (migration une fois, rien n'est perdu), AVANT la restauration.
migrateLegacyWorkspace();
restoreWorkspace();
installSlotErrorBridge();
// PRÉCHAUFFAGE À L'OUVERTURE ([762]/#755.1) — préchauffe les moteurs voix-de-code dès qu'une scène
// qui en embarque devient le fichier actif (pas au 1er play), pour que Play sonne sans délai de
// chargement (seul l'unlock du contexte audio attend le geste).
installPreloadOnOpen();
const app = mount(App, { target });

// Generic, engine-agnostic audio tap (DEV only) — taps the FINAL destination of every
// AudioContext the page creates, whichever engine owns it (Kanopi's native runtime-audio
// OR a code voice's own context, e.g. Strudel/superdough). We do NOT read any engine's
// internal state (would mean reaching into runtime-codevoices, out of host scope) — we
// intercept the standard `AudioNode.connect(destination)` call every engine must make to
// be audible, and splice a read-only AnalyserNode in front of `context.destination`. This
// gives an empirical "is real audio actually reaching the speakers" measurement per engine,
// independent of which package produced the graph (Romain 2026-07-14, corpus A/B strudel
// regression diagnosis — no tap existed to discriminate host wiring vs engine silence).
const audioTapAnalysers = new Map<AudioContext, AnalyserNode>();
if (import.meta.env.DEV) {
  const origConnect = AudioNode.prototype.connect as (
    this: AudioNode,
    dest: AudioNode
  ) => AudioNode;
  AudioNode.prototype.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
    try {
      if (dest instanceof AudioDestinationNode) {
        const ctx = this.context as AudioContext;
        let analyser = audioTapAnalysers.get(ctx);
        if (!analyser) {
          analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          origConnect.call(analyser, dest);
          audioTapAnalysers.set(ctx, analyser);
        }
        origConnect.call(this, analyser);
        return dest;
      }
    } catch {
      /* best-effort probe — never break real audio routing on a tap failure */
    }
    // @ts-expect-error — forwarding the original overloaded call.
    return origConnect.apply(this, [dest, ...rest]);
  };
}

function measureRms(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

// Dev-only: expose raw stores on `window.__kanopi` for Playwright-based verification.
// Not used in prod code — purely a testing hatch. Kept guarded by `import.meta.env.DEV`
// so tree-shaking drops it from the production bundle.
if (import.meta.env.DEV) {
  (window as unknown as { __kanopi: unknown }).__kanopi = {
    core,
    workspace,
    clock,
    actors,
    openBlocks,
    ui,
    // The most recent derived production (PROJECTION of BPx `derive()`), re-published
    // each loop cycle when re-random re-rolls — read by the re-random e2e to compare
    // consecutive cycles. DEV-only hatch, dropped from the prod bundle.
    production,
    // Loop / re-random session toggles (default loop ON, re-random OFF). The re-random
    // e2e flips `reRandom` ON before evaluating so the Kairos re-derive arms at load.
    transport,
    // Last-built `pitchLibMine` catalog (personal pitch libraries composed from
    // `libraries/<domain>/…`). Function (not a value) so each call reads the CURRENT catalog.
    // ⚠️ NO ON-SCREEN BENCH READS THIS KEY — measured 2026-08-19 over the 57 tracked e2e specs,
    // with a positive witness proving the search reaches them. The comment that used to claim
    // otherwise is gone: a comment describing a path the code no longer takes reads as proof.
    // The key stays (KAN-64): a key with no bench reader is not a key with no use — this one
    // carries a dormant user channel, filled only by files the user puts in their own space.
    personalPitchLib: personalPitchLibSnapshot,
    // Generic per-AudioContext RMS tap (see audioTapAnalysers above) — one entry per
    // distinct AudioContext currently connected to a destination (native runtime-audio,
    // Strudel/superdough, Hydra has no audio context, …).
    audioTap: {
      contextCount: (): number => audioTapAnalysers.size,
      measureAll: (): { state: string; sampleRate: number; rms: number }[] =>
        [...audioTapAnalysers.entries()].map(([ctx, an]) => ({
          state: ctx.state,
          sampleRate: ctx.sampleRate,
          rms: measureRms(an)
        }))
    },
    // Re-exposes `runtime-codevoices`' `onStrudelError` (App.svelte already subscribes to it
    // for the CM6 red flash) so an e2e can assert a live Strudel voice's runtime error (e.g.
    // "sound not found") actually reaches the host — proof [777]/[112] of the
    // getTrigger→emitError fix (fa46874), independent of the compile chip's own signal-3
    // aggregation (`openBlocks.errored`, a separate mechanism keyed by slot id).
    onStrudelError,
    // [788] — introspection READ-ONLY sur le préchauffage à l'ouverture : mêmes fonctions PURES
    // que `installPreloadOnOpen` appelle en interne (aucune 2e voie, aucun état inventé). Un e2e
    // de latence s'en sert pour DÉCLENCHER + ATTENDRE déterministement le préfetch d'assets d'une
    // scène (au lieu de deviner un délai fixe), afin de comparer play→1er son AVANT/APRÈS préfetch.
    codeVoicePreload: { interpsForScene, assetsForScene, warmUp }
  };
}

// `window.kanopi` — PUBLIC piloting API (« second front ») : commands + inspection that
// DELEGATE to the same entry points as the UI (see lib/pilot/kanopi-api.ts). Unlike the
// `__kanopi` testing hatch above, this is a SUPPORTED, VERSIONED public surface
// (`window.kanopi.version`) installed in EVERY build — prod included (décision Romain
// 2026-07-02). It exposes no raw stores and holds no state: every method delegates.
installKanopiApi();

export default app;
