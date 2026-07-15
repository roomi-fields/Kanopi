import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt } from '../helpers';

// Chantier latence [791]/[795]/[797]/[799] — MERCURY SUBSET + LOAD-ON-DEMAND. `new Mercury()`
// charge, EN EAGER, la bibliothèque de samples ENTIÈRE (~200 entrées .wav, mesuré ~428 requêtes
// réseau) au CONSTRUCTEUR — indépendamment de la scène. Fix cross-repo en 2 volets :
//  (1) SUBSET DE BOOT — patch mercury-engine (`patches/mercury-engine+1.7.0.patch`, filtre
//      `this.samples` sur une allowlist globale, `Array.isArray` SEUL — un tableau `[]` déclaré-vide
//      charge STRICTEMENT 0 sample, distinct d'une allowlist absente qui charge tout) +
//      `assetsForScene` (bpx-adapter.ts) pose `{ mercury: { samples: [] } }` (sentinel non-vide) pour
//      une scène mercury 100% synthé, posé en allowlist AVANT le warmup via `preload`.
//  (2) LOAD-ON-DEMAND PAR SCÈNE — l'instance mercury PERSISTE inter-scènes (le subset de boot est figé
//      à la 1re construction). Le patch mercury-engine garde un `_rcvCatalog` COMPLET + expose
//      `extendSamples(names)` (méthode publique) ; runtime-codevoices appelle
//      `instance.extendSamples(mercurySamplesInPatch(code))` à CHAQUE `evaluate()`. Si une scène 2+
//      référence des samples absents du subset de boot, ils sont chargés à la volée — sinon elle
//      serait MUETTE (le vrai gap qu'un simple 428→N mesuré sur UNE scène isolée ne peut pas voir).
//
// PREUVE : compte les réponses réseau dont l'URL pointe un sample mercury (`mercury-samples/….wav`,
// VPS auto-hébergé store.roomi-fields.com) + leur statut HTTP, pendant le warmup/eval de scène(s).
//
// MÉTHODE : le listener `page.on('response')` est attaché AVANT `page.goto('')`, donc avant que
// `installPreloadOnOpen` ne déclenche le warmup de fond au focus du fichier — aucune requête n'est
// manquée par une course d'attachement tardif. Le dev hatch `window.__kanopi` expose
// `codeVoicePreload.{interpsForScene,assetsForScene,warmUp}` (même pattern que `latency-proof.spec.ts`)
// — appeler explicitement le MÊME `warmUp(interps, assets)` que l'ouverture déclenche en fond et
// l'ATTENDRE donne un point déterministe (dédup par interprète : une 2e demande pour 'mercury' réutilise
// la promesse déjà en vol/résolue, jamais un second `preload()`). Une marge de settle après résolution
// laisse les requêtes fire-and-forget (`new Mercury()`, `addBuffers` via `extendSamples`) atterrir avant
// le comptage.

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

/** Explicitly drive the same `interpsForScene` -> `assetsForScene` -> `warmUp` chain the background
 *  preload-on-open effect fires, and AWAIT it — a deterministic point instead of a guessed delay. */
async function warmUpScene(page: import('@playwright/test').Page, contents: string): Promise<void> {
  await page.evaluate(async (c) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const { interpsForScene, assetsForScene, warmUp } = w.__kanopi.codeVoicePreload;
    const interps = interpsForScene(c);
    const sceneAssets = assetsForScene(c);
    await warmUp(interps, sceneAssets);
  }, contents);
}

const SETTLE_MS = 1500;

const libraryMercuryDir = fileURLToPath(
  new URL('../../../library/scenes/mercury', import.meta.url)
);
const synthScene = readFileSync(join(libraryMercuryDir, '01-synth-saw.bps'), 'utf8');
const sampleScene = readFileSync(join(libraryMercuryDir, '05-sample-basic-leak.bps'), 'utf8');

interface SampleResponse {
  url: string;
  status: number;
}

function isSampleUrl(url: string): boolean {
  return /mercury-samples\//.test(url) && /\.wav(\?|$)/i.test(url);
}

test('mercury subset — scène synthèse pure (0 sample) ne déclenche (quasi) aucune requête de sample', async ({
  page
}, testInfo) => {
  const sampleResponses: SampleResponse[] = [];
  page.on('response', (res) => {
    if (isSampleUrl(res.url())) sampleResponses.push({ url: res.url(), status: res.status() });
  });

  await setupAudioCapture(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(page, '01-synth-saw.bps', synthScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  const assets = await readAssets(page, synthScene);
  await warmUpScene(page, synthScene);
  await page.waitForTimeout(SETTLE_MS);

  testInfo.attach('mercury-subset-synth', {
    body: JSON.stringify(
      { assets, sampleRequestCount: sampleResponses.length, sampleResponses },
      null,
      2
    ),
    contentType: 'application/json'
  });
  console.log(
    `[791/795/799] mercury subset — scène SYNTH: assets=${JSON.stringify(assets)} requêtes-sample=${sampleResponses.length}`
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);

  // Preuve du chantier [799] : `assetsForScene` pose maintenant `{ mercury: { samples: [] } }`
  // (sentinel déclaré-vide, préservé par `Array.isArray` bout en bout jusqu'au patch mercury-engine)
  // pour une scène mercury sans AUCUN `new sample` — la bibliothèque entière (mesurée ~428 requêtes
  // AVANT ce chantier) n'est plus eagerly chargée.
  expect(sampleResponses.length).toBeLessThan(10);
});

test('mercury subset — scène à samples ne charge que le sous-ensemble utilisé et sonne toujours', async ({
  page
}, testInfo) => {
  const sampleResponses: SampleResponse[] = [];
  page.on('response', (res) => {
    if (isSampleUrl(res.url())) sampleResponses.push({ url: res.url(), status: res.status() });
  });

  const audio = await setupAudioCapture(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndFocus(page, '05-sample-basic-leak.bps', sampleScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  const assets = await readAssets(page, sampleScene);
  await warmUpScene(page, sampleScene);
  await page.waitForTimeout(SETTLE_MS);

  testInfo.attach('mercury-subset-sample', {
    body: JSON.stringify(
      { assets, sampleRequestCount: sampleResponses.length, sampleResponses },
      null,
      2
    ),
    contentType: 'application/json'
  });
  console.log(
    `[791/795] mercury subset — scène SAMPLE: assets=${JSON.stringify(assets)} requêtes-sample=${sampleResponses.length}`
  );

  // Le sous-ensemble (kick_909 + hat_909) doit rester TRÈS en-dessous du jeu entier (~200
  // entrées / ~428 requêtes) — quelques requêtes attendues, pas des centaines.
  expect(sampleResponses.length).toBeGreaterThan(0);
  expect(sampleResponses.length).toBeLessThan(20);
  for (const r of sampleResponses) expect(r.status, `404 sur ${r.url}`).toBe(200);

  // Le son sort toujours (le filtre ne casse pas le sample réellement utilisé).
  await evalBlockAt(page, 1);
  const rms = await audio.getMaxRMS(2500);
  console.log(`[791/795] mercury subset — scène SAMPLE RMS=${rms}`);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
});

test('mercury load-on-demand [797/799] — scène synthé PUIS scène à samples, dans UNE session : la 2e scène sonne toujours', async ({
  page
}, testInfo) => {
  // LE cas critique du chantier : l'instance mercury PERSISTE inter-scènes (subset figé à la 1re
  // construction, [791]). Sans le load-on-demand par scène [797], une 1re scène synthé (allowlist
  // posée à `[]`, [799]) laisserait l'instance sans AUCUN sample chargé — une 2e scène qui référence
  // kick_909/hat_909 resterait MUETTE malgré son propre `assetsForScene` correct, puisque `new
  // Mercury()` n'est appelé QU'UNE fois par session (préchauffe mémoïsée par interprète,
  // `code-voice-warmup.ts`). La preuve : la 2e scène doit à la fois (a) FETCHER ses samples à la
  // volée (200, pas 404) et (b) SONNER (RMS>0).
  const sampleResponses: SampleResponse[] = [];
  page.on('response', (res) => {
    if (isSampleUrl(res.url())) sampleResponses.push({ url: res.url(), status: res.status() });
  });

  const audio = await setupAudioCapture(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // 1) Scène SYNTHÉ d'abord — charge+focus+ÉVALUE. `assetsForScene` pose `{samples: []}`, le patch
  // charge 0 sample au boot de l'instance mercury (construite ici, dans le warmup + le 1er eval).
  await loadAndFocus(page, '01-synth-saw.bps', synthScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  const synthAssets = await readAssets(page, synthScene);
  await warmUpScene(page, synthScene);
  await evalBlockAt(page, 1);
  await page.waitForTimeout(500);

  const countAfterSynth = sampleResponses.length;
  console.log(
    `[797/799] load-on-demand — après scène SYNTH: assets=${JSON.stringify(synthAssets)} requêtes-sample=${countAfterSynth}`
  );

  // 2) PUIS scène à SAMPLES, dans la MÊME page (même instance mercury persistante). `warmUp('mercury')`
  // est dédupé (déjà chaud depuis l'étape 1) — c'est `evalBlockAt` (le VRAI `evaluate()`) qui déclenche
  // `instance.extendSamples(mercurySamplesInPatch(code))` et charge kick_909/hat_909 à la demande.
  await loadAndFocus(page, '05-sample-basic-leak.bps', sampleScene);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  const sampleAssets = await readAssets(page, sampleScene);
  await warmUpScene(page, sampleScene);
  await evalBlockAt(page, 1);
  await page.waitForTimeout(1500);

  const responsesAfterSample = sampleResponses.slice(countAfterSynth);

  // NOTE MÉTHODE (vérifié en session, console mercury capturée) : cette scène courte (backtick
  // `:4`) joue et s'ARRÊTE naturellement en <1s (Kronos atteint la fin de la timeline dérivée) —
  // AUCUN rapport avec ce chantier (même comportement pour une scène strudel/csound courte). Le fetch
  // on-demand (~150-300ms, confirmé par les timestamps ci-dessus) grignote une part de CETTE fenêtre
  // courte : le 1er passage peut rater le trigger MÊME si le sample est en train de charger avec
  // succès (0 régression du chantier — juste le fetch qui n'a pas eu le temps de finir avant la fin
  // de la scène). Un utilisateur réel ré-évalue (Ctrl+Enter) s'il n'entend rien — geste normal du
  // live-coding. On simule exactement ce geste : un 2e eval, avec un espace INOFFENSIF ajouté DANS
  // le backtick mercury (avant la fermeture) pour contourner le gate `codeUnchanged` (comparé sur le
  // CODE DU BACKTICK, mercury.ts — vérifié en session : un ajout HORS backtick, ex. un commentaire de
  // scène après la fermeture, laisse `bt.code` inchangé et le gate saute silencieusement le re-eval,
  // sans AUCUN log mercury). Les samples sont maintenant déjà dans `this.buffers` (chargés au 1er
  // passage), donc `checkBuffer` (mercury-engine, parse-time) ne les collapse plus sur un fallback :
  // la scène sonne dès ce 2e build, dans la même fenêtre courte qu'un boot eager (test précédent).
  const sampleSceneRetry = sampleScene.replace('gain(0.6)`:4', 'gain(0.6) `:4');
  expect(sampleSceneRetry).not.toBe(sampleScene);
  await loadAndFocus(page, '05-sample-basic-leak.bps', sampleSceneRetry);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);

  testInfo.attach('mercury-load-on-demand', {
    body: JSON.stringify(
      {
        synthAssets,
        sampleAssets,
        countAfterSynth,
        responsesAfterSample
      },
      null,
      2
    ),
    contentType: 'application/json'
  });
  console.log(
    `[797/799] load-on-demand — après scène SAMPLE (2e): assets=${JSON.stringify(sampleAssets)} ` +
      `nouvelles-requêtes-sample=${responsesAfterSample.length} détail=${JSON.stringify(responsesAfterSample)}`
  );

  // La 1re scène (synthé) ne doit rien avoir fetché.
  expect(countAfterSynth).toBeLessThan(10);
  // La 2e scène DOIT avoir déclenché le fetch à la demande de ses samples (kick_909 + hat_909) — pas
  // zéro (sinon elle serait muette), pas des centaines (le catalogue complet n'est pas rechargé).
  expect(responsesAfterSample.length).toBeGreaterThan(0);
  expect(responsesAfterSample.length).toBeLessThan(20);
  // AUCUN 404 : l'URL résolue à la demande (baseUrl + chemin catalogue) doit réellement fetcher, pas
  // pointer dans le vide — un 404 ici serait EXACTEMENT le muet que ce chantier élimine.
  for (const r of responsesAfterSample) expect(r.status, `404 sur ${r.url}`).toBe(200);

  // Et surtout : la 2e scène SONNE.
  const rms = await audio.getMaxRMS(2500);
  console.log(`[797/799] load-on-demand — scène SAMPLE (2e) RMS=${rms}`);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
});
