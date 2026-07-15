import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt } from '../helpers';

// Chantier latence [791]/[795] — MERCURY SUBSET. `new Mercury()` charge, EN EAGER, la
// bibliothèque de samples ENTIÈRE (~200 entrées .wav, mesuré ~428 requêtes réseau) au
// CONSTRUCTEUR — indépendamment de la scène (même une scène de synthèse pure, 0 sample, payait
// le coût entier). Fix cross-repo : patch mercury-engine (patches/mercury-engine+1.7.0.patch,
// filtre `this.samples` sur une allowlist globale) + `assetsForScene` (bpx-adapter.ts) énumère
// les samples RÉFÉRENCÉS (`mercurySamplesInPatch`, syntaxe `new sample <nom>`) par les backticks
// mercury de la scène, posés en allowlist AVANT le warmup mercury via
// `preload(interps, { mercury: { samples } })`.
//
// PREUVE : compte les réponses réseau dont l'URL pointe un sample mercury (`mercury-samples/…
// .wav`, VPS auto-hébergé store.roomi-fields.com) pendant le warmup d'ouverture de scène.
//
// MÉTHODE : le listener `page.on('response')` est attaché AVANT `page.goto('')`, donc avant que
// `installPreloadOnOpen` ne déclenche le warmup de fond au focus du fichier — aucune requête
// n'est manquée par une course d'attachement tardif. On déclenche ENSUITE, explicitement, le
// MÊME `warmUp(interps, assets)` que l'ouverture appelle en fond (dev hatch `window.__kanopi`,
// même pattern que `latency-proof.spec.ts`) et on l'ATTEND : `warmUp` dédup par interprète (une
// 2e demande pour 'mercury' réutilise la promesse déjà en vol de l'ouverture, jamais un second
// fetch) — l'attente donne un point déterministe, pas un délai deviné. Une marge de settle après
// résolution laisse les requêtes déclenchées à la construction `new Mercury()` (fire-and-forget,
// non attendues par `ensure()`) atterrir avant le comptage.

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

/** Read `assetsForScene(contents)` verbatim from the page, for the report (not an assertion
 *  target on its own — the network count is the proof). */
async function readAssets(
  page: import('@playwright/test').Page,
  contents: string
): Promise<unknown> {
  return page.evaluate((c) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    return w.__kanopi.codeVoicePreload.assetsForScene(c);
  }, contents);
}

const SETTLE_MS = 1500;

const libraryMercuryDir = fileURLToPath(
  new URL('../../../library/scenes/mercury', import.meta.url)
);
const synthScene = readFileSync(join(libraryMercuryDir, '01-synth-saw.bps'), 'utf8');
const sampleScene = readFileSync(join(libraryMercuryDir, '05-sample-basic-leak.bps'), 'utf8');

function isSampleResponse(url: string): boolean {
  return /mercury-samples\//.test(url) && /\.wav(\?|$)/i.test(url);
}

// GAP CROSS-REPO CONNU (mesuré, pas supposé) — laissé en `test.fail()` pour tracer honnêtement,
// PAS en vert fabriqué. Root cause : `assetsForScene` (bpx-adapter.ts) omet `mercury` du retour
// quand `mercurySamplesInPatch` ne trouve AUCUN `new sample` (directive : "ajoute … si non vide")
// — correct côté hôte. Mais MÊME en forçant `mercury: { samples: [] }`, `setMercurySampleAllowlist`
// (runtime-codevoices/src/voices/mercury.ts:30-31 : `names && names.length > 0 ? [...names] :
// undefined`) collapse un tableau VIDE sur le même `undefined` qu'une absence de déclaration — le
// global `__RCV_MERCURY_SAMPLE_ALLOWLIST` n'est alors JAMAIS posé (mercury.ts:69 `if
// (sampleAllowlist)`), donc le filtre du patch mercury-engine (`Array.isArray(...) && …length`)
// ne s'active jamais non plus. Résultat mesuré : une scène de synthèse pure (0 sample) reste sur
// le chargement EAGER de la bibliothèque entière (~428 requêtes, IDENTIQUE à l'état AVANT ce
// chantier) — seul le cas « scène qui référence AU MOINS un sample » est couvert (cf test
// suivant : 428→4, confirmé). Fix hors périmètre Kanopi : `setMercurySampleAllowlist` vit dans
// runtime-codevoices (cross-repo) — il faudrait y distinguer "déclaré vide" de "non déclaré"
// (ex. accepter `[]` comme "charge rien" au lieu de le collapse sur `undefined`). Escaladé au PM,
// pas bricolé côté hôte (aucun sentinel/valeur inventée pour contourner leur contrat).
test('mercury subset — scène synthèse pure (0 sample) ne déclenche (quasi) aucune requête de sample', async ({
  page
}, testInfo) => {
  // Annotation SCOPÉE à ce test seul (pas au fichier) : Playwright exige que ce test échoue
  // réellement ; s'il se met à passer, le run signale l'incohérence au lieu de rester silencieux.
  test.fail(
    true,
    '[791/795] gap cross-repo confirmé : setMercurySampleAllowlist collapse [] sur undefined, ' +
      'scène synthèse pure reste eager (~428 req) — fix hors périmètre Kanopi (runtime-codevoices)'
  );

  const sampleUrls: string[] = [];
  page.on('response', (res) => {
    if (isSampleResponse(res.url())) sampleUrls.push(res.url());
  });

  await setupAudioCapture(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(page, '01-synth-saw.bps', synthScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  const assets = await readAssets(page, synthScene);

  await page.evaluate(async (contents) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const { interpsForScene, assetsForScene, warmUp } = w.__kanopi.codeVoicePreload;
    const interps = interpsForScene(contents);
    const sceneAssets = assetsForScene(contents);
    await warmUp(interps, sceneAssets);
  }, synthScene);

  await page.waitForTimeout(SETTLE_MS);

  testInfo.attach('mercury-subset-synth', {
    body: JSON.stringify({ assets, sampleRequestCount: sampleUrls.length, sampleUrls }, null, 2),
    contentType: 'application/json'
  });
  console.log(
    `[791/795] mercury subset — scène SYNTH: assets=${JSON.stringify(assets)} requêtes-sample=${sampleUrls.length}`
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);

  // Preuve du chantier : la scène ne référence AUCUN `new sample`, la bibliothèque entière
  // (mesurée ~428 requêtes AVANT ce chantier) ne doit plus être eagerly chargée.
  expect(sampleUrls.length).toBeLessThan(10);
});

test('mercury subset — scène à samples ne charge que le sous-ensemble utilisé et sonne toujours', async ({
  page
}, testInfo) => {
  const sampleUrls: string[] = [];
  page.on('response', (res) => {
    if (isSampleResponse(res.url())) sampleUrls.push(res.url());
  });

  const audio = await setupAudioCapture(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(page, '05-sample-basic-leak.bps', sampleScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  const assets = await readAssets(page, sampleScene);

  await page.evaluate(async (contents) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const { interpsForScene, assetsForScene, warmUp } = w.__kanopi.codeVoicePreload;
    const interps = interpsForScene(contents);
    const sceneAssets = assetsForScene(contents);
    await warmUp(interps, sceneAssets);
  }, sampleScene);

  await page.waitForTimeout(SETTLE_MS);

  testInfo.attach('mercury-subset-sample', {
    body: JSON.stringify({ assets, sampleRequestCount: sampleUrls.length, sampleUrls }, null, 2),
    contentType: 'application/json'
  });
  console.log(
    `[791/795] mercury subset — scène SAMPLE: assets=${JSON.stringify(assets)} requêtes-sample=${sampleUrls.length}`
  );

  // Le sous-ensemble (kick_909 + hat_909) doit rester TRÈS en-dessous du jeu entier (~200
  // entrées / ~428 requêtes) — quelques requêtes attendues, pas des centaines.
  expect(sampleUrls.length).toBeGreaterThan(0);
  expect(sampleUrls.length).toBeLessThan(20);

  // Le son sort toujours (le filtre ne casse pas le sample réellement utilisé).
  await evalBlockAt(page, 1);
  const rms = await audio.getMaxRMS(2500);
  console.log(`[791/795] mercury subset — scène SAMPLE RMS=${rms}`);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
});
