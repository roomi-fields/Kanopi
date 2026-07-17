import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// Preuve mesurée [777] (décision architecte [112] : bug bundle-dépendant → la preuve DOIT
// vivre dans l'e2e Kanopi, un banc autonome runtime-codevoices donnerait une preuve fausse).
// Valide les fixes fa46874 (réenregistrement GM/xen dans l'instance @strudel/web + remontée
// des erreurs d'exécution getTrigger → emitError). Quatre preuves mesurées :
//   (a) gm sonne — RMS > 0 mesuré sur le master.
//   (c) xen sonne — RMS > 0 mesuré sur le master.
//   (b1) un son inexistant → l'erreur getTrigger remonte via `onStrudelError` (BUG 2, le fix
//       lui-même : errorLogger → isStrudelErrorLog → emitError).
//   (b2) une erreur JS SYNCHRONE dans un acteur eval.strudel (typo/fonction indéfinie) fait
//       passer le chip `.compile-chip` au rouge "runtime error" — preuve du fix hôte apporté
//       ICI MÊME (voir plus bas) au mismatch de clé entre le dispatcher BPx et `openBlocks`.
//
// setupAudioCapture (tests/helpers.ts) tape TOUT AudioContext qui se connecte à
// ctx.destination — couvre le contexte propre de Strudel/superdough, pas seulement le
// contexte natif de Kanopi.
//
// Chargement/éval : même hatch dev `__kanopi.workspace` que strudel.spec.ts / health-chip.spec.ts
// (API pilote, jamais d'import de store dans la page). Un Ctrl+Enter sur un `.bps` monobloc
// (evalBlockAt) calcule le même `qualifiedName`/actorId que `openBlocks.blocksForFile` pour un
// fichier code-voice AUTONOME — mais PAS pour un `.bps` structuré en `@actor … eval.strudel`
// (voir le fix `runtimeErrorsForFile` dans stores/blocks.svelte.ts, expliqué dans le rapport).

interface KanopiHatch {
  workspace: {
    loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
    files: { id: string; path: string }[];
    openFile: (id: string) => void;
    setActive: (id: string) => void;
  };
  onStrudelError: (cb: (err: unknown) => void) => () => void;
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

const libraryStrudelDir = fileURLToPath(
  new URL('../../../../library/scenes/strudel', import.meta.url)
);
const libraryP5Dir = fileURLToPath(new URL('../../../../library/scenes/p5', import.meta.url));

test('gm sonne : sound("gm_piano"/"gm_marimba"/"gm_flute") produit un RMS > 0 mesuré', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const program = readFileSync(join(libraryStrudelDir, '09-gm-piano-general-midi.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndFocus(page, '09-gm-piano-general-midi.bps', program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Le clic dans evalBlockAt lève l'autoplay-gate (geste utilisateur) puis Ctrl+Enter évalue
  // tout le .bps (cas monobloc bpscript).
  await evalBlockAt(page, 1);

  // Soundfonts GM LAZY (fetch VPS + decodeAudioData à la 1re note) : fenêtre large.
  const rms = await audio.getMaxRMS(3000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

// [809] point 2 — (B) dirt-samples testée d'abord (règle archi [811] : le son tranche, l'A/B
// départage) → MUETTE dans le banc (RMS=0 tous retries ; banque distante github, inapte au gate).
// Bascule sur (A) : @library.strudel "gm" + sound("gm_piano") (soundfont GM self-hosté VPS,
// garanti audible). L'objet de la démo (mélodie + gamme via .scale()) est préservé ; le timbre GM
// y est incident (vitrine GM = scène 09).
test('strudel/03 sonne : n(...).scale("C:minor").sound("gm_piano") produit un RMS > 0 mesuré [809]', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const program = readFileSync(join(libraryStrudelDir, '03-melody-scale-tonal.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndFocus(page, '03-melody-scale-tonal.bps', program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  const rms = await audio.getMaxRMS(3000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

// (d) patchbay sonne [829] — le modèle son LANG-SONS bout-en-bout DANS L'APP : une voix-câblage
// persistante `@macro lead = saw.freq: pitch >> lpf.cutoff: BT >> audio` arme un patch dont l'ARM
// (kind:'control') porte `output.runtime='audio'` (gravé par kairos DEPUIS `actionLib.runtimeParModule`
// = `sinkRuntimeMap()` du catalogue, [414]/[829]) → routé à runtime-audio → patch armé → RMS>0. Verrou
// anti-régression du bug [414] (l'arm droppé faute d'output → muet). Scène library synthesis/patchbay.bps.
const librarySynthesisDir = fileURLToPath(
  new URL('../../../../library/scenes/synthesis', import.meta.url)
);
test('patchbay sonne : un @macro saw>>lpf>>audio armé produit un RMS > 0 mesuré [829]', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const program = readFileSync(join(librarySynthesisDir, 'patchbay.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndFocus(page, 'patchbay.bps', program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  // Le patch persistant (saw→lpf→audio) rend en continu une fois armé — fenêtre large.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

// FIXME [787.2a] — NON-MESURABLE en e2e headless, EN ATTENTE d'une confirmation À L'OREILLE (Romain,
// 5173). PAS un faux vert : le diagnostic est complet (décision archi [807] : stop la chasse e2e,
// rendements décroissants). 3 couches amont corrigées (chaînabilité 7be15a2 + réveil 5dafaf0/3d80901 +
// épingle contexte f403f22) MAIS RMS reste 0 dans mon banc. Discriminé sur pièces : un oscillateur
// p5.sound créé MANUELLEMENT sonne ET est capté par setupAudioCapture (RMS 0.348) → mon banc ET l'API
// marchent ; seul l'oscillateur du SKETCH (mode INSTANCE) rend sur un contexte SÉPARÉ que le tap headless
// n'atteint pas. `tone` est dupliqué en versions INCOMPATIBLES (racine 14.9.17 pour mercury / p5.sound
// 15.1.22) → dédup impossible sans casser l'un des deux. Verdict à trancher par Romain sur 5173 : SONNE
// → limitation de mesure e2e (on garde ce fixme documenté) ; MUET → runtime-codevoices finit le fix
// instance-mode (hook debug du contexte réel du sketch). Ne PAS réactiver sans preuve audio réelle.
test.fixme('p5 sonne : new p5.Oscillator("sine") produit un RMS > 0 mesuré (220 Hz) [787.2a]', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);

  const program = readFileSync(join(libraryP5Dir, '09-sound-oscillator-audible.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndFocus(page, '09-sound-oscillator-audible.bps', program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // evalBlockAt clique (lève l'autoplay-gate) puis Ctrl+Enter : setup() construit l'oscillateur p5.sound
  // et l'.start(). NB (cf. FIXME ci-dessus) : le sketch en mode instance rend sur un contexte que le tap
  // headless n'atteint pas → RMS=0 en e2e (non-mesurable), à confirmer à l'oreille sur 5173.
  await evalBlockAt(page, 1);

  const rms = await audio.getMaxRMS(3000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
});

test('xen sonne : .tune("hexany15") (pont @strudel/xen) produit un RMS > 0 mesuré', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);

  const program = readFileSync(join(libraryStrudelDir, '07-xen-microtonal-leak.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndFocus(page, '07-xen-microtonal-leak.bps', program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  // FINDING A résolu ([781], corps corrigé par runtime-codevoices) : la scène jetait
  // "i is not defined" — `i` n'existe nulle part dans @strudel/xen (bug de SCÈNE, pas de moteur).
  // Corps corrigé : (1) déclare `@library.strudel "xen"` (sinon loadXen() ne ponte jamais `.tune()`),
  // (2) mini-notation reifiée "0 1 2 3 4 5" au lieu de i(...), (3) `.freq()` sans `.mul` (tune.note()
  // rend déjà des Hz) + `.s("sawtooth")` pour un oscillateur audible. RMS>0 prouve le pont microtonal
  // (bundle-dépendant, comme gm). NE PAS ASSOUPLIR CE SEUIL.
  const rms = await audio.getMaxRMS(3000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
});

test("son inexistant (ASYNC) → onStrudelError remonte ET le chip passe ROUGE 'runtime error' (VOYANT-N3 async)", async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Skeleton minimal validé par l'oracle BPScript (0 échec structurel) — un seul acteur
  // eval.strudel (sort en NATIF, sans transport : modèle producteur/canal [809]) qui schedule
  // un pattern jouant un nom de son inexistant. Le seul défaut de la scène est ce son.
  const broken = `@core
@tempo:120

@actor v  eval.strudel

S -> v

v -> \`sound("nawak_pas_un_son")\`:4
`;

  // Armé AVANT de charger/évaluer la scène : errorLogger('[getTrigger] error: …') part de
  // façon async au 1er scheduling du pattern (pas à l'éval elle-même), donc l'écouteur doit
  // déjà être en place.
  const gotErrorPromise = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const w = window as unknown as { __kanopi: KanopiHatch };
        const off = w.__kanopi.onStrudelError(() => {
          off();
          resolve(true);
        });
        setTimeout(() => {
          off();
          resolve(false);
        }, 6000);
      })
  );

  await loadAndFocus(page, 'bad-sound.bps', broken);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  const gotError = await gotErrorPromise;
  expect(gotError).toBe(true);

  // VOYANT-N3 async (FINDING B, runtime-codevoices 1f53746) : l'erreur ASYNC (`sound not found`
  // au 1er scheduling, HORS evaluate) est désormais imputée au dernier slot évalué via
  // `pushAsyncStrudelError` → `slotErrors.set` + `notifySlotErrors` → `getSlotErrors()` non vide →
  // `openBlocks.errored` (onSlotErrorChange) → `runtimeErrorsForFile` (fallback préfixe `${nom}::`)
  // → le chip rougit. AVANT 1f53746, l'async ne partait QUE par onStrudelError (jamais le chip).
  // Combiné au cas SYNCHRONE (test suivant), le signal 3 du voyant est clos à 100%.
  const chip = page.locator('.compile-chip').first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await expect(chip).toHaveClass(/fail/, { timeout: 6_000 });
  await expect(chip).not.toHaveClass(/ok/);
  await expect(chip.locator('.compile-label')).toHaveText('runtime error');

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});

test('une erreur JS synchrone dans un acteur eval.strudel fait passer le chip rouge "runtime error"', async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Fonction inexistante appelée dans le backtick → ReferenceError SYNCHRONE à la construction
  // du pattern, capturée par l'IIFE du composite Strudel (__kanopiSlotError → slotErrors.set →
  // notifySlotErrors), à la différence de l'erreur getTrigger (async) du test précédent.
  // Preuve du fix hôte : `openBlocks.runtimeErrorsForFile` (stores/blocks.svelte.ts) ne
  // matchait QUE les clés `qualifyBlock` (fichier SANS extension, un seul bloc `wholeFile` pour
  // un .bps) alors que le dispatcher BPx clé `getSlotErrors()` en `${fileName-AVEC-ext}::${acteur}`
  // (bpx-adapter.ts `slotForActor`) — deux conventions qui ne se recoupaient JAMAIS pour un
  // `.bps` structuré en `@actor`. Le chip restait vert malgré une voix qui erreure en continu.
  const syncThrow = `@core
@tempo:120

@actor v  eval.strudel

S -> v

v -> \`nonexistentStrudelFn("x")\`:4
`;

  await loadAndFocus(page, 'sync-throw.bps', syncThrow);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  const chip = page.locator('.compile-chip').first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await expect(chip).toHaveClass(/fail/, { timeout: 5_000 });
  await expect(chip).not.toHaveClass(/ok/);
  await expect(chip.locator('.compile-label')).toHaveText('runtime error');
  await expect(chip).toHaveAttribute('title', /nonexistentStrudelFn is not defined/);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});
