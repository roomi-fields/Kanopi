import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture } from '../../helpers';

// Chantier latence [788] — câblage du préfetch d'ASSETS au préchauffage à l'ouverture
// (`assetsForScene` → `warmUp(interps, assets)` → `preload(interps, assets)`, banques
// `@library.strudel` + instruments `gm_*`). Preuve mesurée : le délai PLAY → 1er son de la
// scène GM (fetch+décode soundfont VPS, ~1s), AVANT/APRÈS que le préfetch d'ouverture ait
// résolu.
//
// MÉTHODE DE CONTRÔLE (honnête, décrite en détail — pas de délai deviné pour le côté APRÈS) :
//   - "immédiat" (contrôle SANS préfetch résolu) : on charge la scène puis on joue TOUT DE SUITE,
//     sans laisser de temps au préchauffage de fond lancé à l'ouverture — même geste que le test
//     `gm sonne` existant (audio-proof.spec.ts). Le fetch+décode réseau (~1s) est presque
//     certainement encore en vol au moment du play : ce chemin paie tout ou partie du coût lazy.
//   - "préfetché" (APRÈS) : on charge la scène puis on DÉCLENCHE + ATTEND explicitement
//     `codeVoicePreload.warmUp(interps, assets)` — la MÊME paire de fonctions pures que
//     `installPreloadOnOpen` appelle en interne (`codeVoicePreload`, hatch DEV ajoutée main.ts
//     pour cette preuve, aucune 2e voie : juste un point d'attente déterministe sur le MÊME
//     appel réel) — AVANT de jouer. Pas de délai deviné : on attend la promesse réelle.
// Les deux scénarios utilisent une page FRAÎCHE (le tracker de warmup mémoïse par interprète,
// module-level — un 2e essai sur la même page réutiliserait la promesse déjà résolue du 1er).
//
// MESURE : t0 = juste avant la frappe Ctrl+Enter (le geste play). t1 = 1re lecture RMS > seuil,
// polling en TIGHT LOOP côté page (performance.now(), pas d'aller-retour Playwright par
// échantillon — évite le bruit IPC). Piège headless connu (reference_headless_perf_measure) :
// les valeurs ABSOLUES en ms sont faussées par le throttle rAF/timers. On rapporte donc les deux
// chiffres BRUTS tels quels, et on vérifie la PROPRIÉTÉ DÉTERMINISTE attendue : après un préfetch
// RÉSOLU, le 1er son sort dans une fenêtre courte bornée — sans fabriquer de seuil sur le côté
// lazy (celui-ci peut, selon le cache réseau du run, être rapide ou lent : on le rapporte, on ne
// l'assert pas serré).

interface KanopiHatch {
  workspace: {
    loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
    files: { id: string; path: string }[];
    openFile: (id: string) => void;
    setActive: (id: string) => void;
  };
  codeVoicePreload: {
    interpsForScene: (text: string) => string[];
    assetsForScene: (text: string) => unknown;
    warmUp: (interps: string[], assets?: unknown) => Promise<void>;
  };
}

async function loadAndFocus(page: import('@playwright/test').Page, path: string, contents: string) {
  await page.evaluate(
    async ({ path, contents }) => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      const ws = w.__kanopi.workspace;
      ws.loadFiles([{ path, contents }], path);
      const target = ws.files.find((f) => f.path === path);
      if (!target) throw new Error(`fixture "${path}" did not land in the workspace`);
      ws.openFile(target.id);
      ws.setActive(target.id);
    },
    { path, contents }
  );
}

/** Positionne le curseur CM6 sur `line` (mêmes internes que `evalBlockAt`, sans le wrapper —
 *  ici on veut maîtriser exactement l'instant `t0` juste avant la frappe Ctrl+Enter). */
async function positionCursor(page: import('@playwright/test').Page, line: number) {
  const content = page.locator('.cm-content').first();
  await content.click();
  await page.evaluate((targetLine) => {
    const el = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { line: (n: number) => { from: number } } };
                dispatch: (tr: { selection: { anchor: number } }) => void;
              };
            };
          };
        })
      | null;
    const view = el?.cmTile?.root?.view;
    if (!view) return;
    const lineInfo = view.state.doc.line(targetLine);
    view.dispatch({ selection: { anchor: lineInfo.from } });
  }, line);
}

/**
 * Marque `t0 = performance.now()` côté page, presse Ctrl/Meta+Enter (le geste play RÉEL, piloté
 * par Playwright — pas un appel synthétique à l'API CM6), puis poll `__getKanopiRMS()` en TIGHT
 * LOOP côté page jusqu'à franchissement du seuil ou timeout. Rend le délai t0→1er son en ms, ou
 * -1 si le seuil n'a jamais été franchi dans `timeoutMs`.
 */
async function measurePlayToFirstSound(
  page: import('@playwright/test').Page,
  thresholdRms: number,
  timeoutMs: number
): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { __t0: number }).__t0 = performance.now();
  });
  await page.keyboard.press('ControlOrMeta+Enter');
  return await page.evaluate(
    async ({ thresholdRms, timeoutMs }) => {
      const w = window as unknown as { __t0: number; __getKanopiRMS?: () => number };
      const t0 = w.__t0;
      const deadline = t0 + timeoutMs;
      while (performance.now() < deadline) {
        const rms = typeof w.__getKanopiRMS === 'function' ? w.__getKanopiRMS() : 0;
        if (rms > thresholdRms) return performance.now() - t0;
        await new Promise((r) => setTimeout(r, 5));
      }
      return -1;
    },
    { thresholdRms, timeoutMs }
  );
}

const libraryStrudelDir = fileURLToPath(
  new URL('../../../../library/scenes/strudel', import.meta.url)
);
const gmScene = readFileSync(join(libraryStrudelDir, '09-gm-piano-general-midi.bps'), 'utf8');

const THRESHOLD = 0.001;
const TIMEOUT_MS = 5000;
// Fenêtre courte pour la propriété déterministe côté préfetché : au-delà, ce n'est plus "déjà
// chaud" (headless throttle inclus — voir mémoire reference_headless_perf_measure_throttle).
const PREFETCHED_BOUND_MS = 700;

test('latence play→1er son (scène GM) — immédiat (lazy) vs préfetché (warmUp+assets résolu)', async ({
  page: pageImmediate
}, testInfo) => {
  // --- Scénario "immédiat" (contrôle, sans attendre le préfetch de fond) ---
  await setupAudioCapture(pageImmediate);
  await pageImmediate.goto('');
  await expect(pageImmediate.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(pageImmediate, '09-gm-piano-general-midi.bps', gmScene);
  await expect(pageImmediate.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await positionCursor(pageImmediate, 1);
  const immediateMs = await measurePlayToFirstSound(pageImmediate, THRESHOLD, TIMEOUT_MS);
  await pageImmediate.keyboard.press('ControlOrMeta+Period');
  await pageImmediate.waitForTimeout(300);
  await pageImmediate.close();

  // --- Scénario "préfetché" (page FRAÎCHE — le tracker warmUp mémoïse par interprète) ---
  const browser = pageImmediate.context().browser();
  if (!browser) throw new Error('no browser handle available for a fresh context');
  const ctx2 = await browser.newContext();
  const pagePrefetched = await ctx2.newPage();
  await setupAudioCapture(pagePrefetched);
  await pagePrefetched.goto('');
  await expect(pagePrefetched.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(pagePrefetched, '09-gm-piano-general-midi.bps', gmScene);
  await expect(pagePrefetched.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Déclenche + ATTEND le même warmUp(interps, assets) que l'ouverture lance en fond — pas de
  // délai deviné : on attend la promesse réelle du préchauffage + préfetch d'assets.
  await pagePrefetched.evaluate(async (contents) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const { interpsForScene, assetsForScene, warmUp } = w.__kanopi.codeVoicePreload;
    const interps = interpsForScene(contents);
    const assets = assetsForScene(contents);
    await warmUp(interps, assets);
  }, gmScene);

  await positionCursor(pagePrefetched, 1);
  const prefetchedMs = await measurePlayToFirstSound(pagePrefetched, THRESHOLD, TIMEOUT_MS);
  await pagePrefetched.keyboard.press('ControlOrMeta+Period');
  await pagePrefetched.waitForTimeout(300);
  await ctx2.close();

  testInfo.attach('latence-play-to-first-sound', {
    body: JSON.stringify({ immediateMs, prefetchedMs }, null, 2),
    contentType: 'application/json'
  });
  console.log(`[788] latence play→1er son — immédiat=${immediateMs}ms préfetché=${prefetchedMs}ms`);

  // Propriété déterministe (robuste au throttle headless) : une fois warmUp(interps, assets)
  // RÉSOLU, le 1er son de la scène GM sort dans une fenêtre courte bornée — le fetch+décode
  // (~1s) est déjà payé, pas au play.
  expect(prefetchedMs).toBeGreaterThan(0);
  expect(prefetchedMs).toBeLessThan(PREFETCHED_BOUND_MS);
});
