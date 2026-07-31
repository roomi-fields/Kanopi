import { test, expect } from '@playwright/test';
import { setupAudioCapture, expectNoConsoleErrors } from '../../helpers';

// SEEK DAW — preuve de non-régression PERMANENTE (archi [739], chantier seek-daw qui traverse 5
// dépôts : Kronos playFrom + M3 émission, runtime-ui règle/câblage, runtime-codevoices horloges,
// bpx/Kanopi). Codifie le banc écran prouvé à la main : cliquer la RÈGLE de la timeline fait
// REPARTIR la lecture depuis ce point (position + audio), et les voix de code se recalent au seek.
//
// GESTE DE SEEK (runtime-ui timeline.js:1442-1447, canvas vendoré — pas TimelinePanel.svelte, qui
// n'a jamais dépassé 411 lignes) : un mousedown dans la BANDE RÈGLE du canvas (`my < RULER_H=22`,
// `mx > HEADER_W=80`) appelle `onSeek(ms) → transport.playFrom(ms/1000)`.
// En vue « fit » (scrollX=0, zoom pleine scène), `sec ≈ (mx-80)/(largeur-80) * durationSec`.
//
// DÉTERMINISME (leçons du chantier captures visuelles) : on FIT d'abord (mapping x→temps linéaire),
// on mesure le RMS sur une FENÊTRE (pas un instantané), et on lit l'horloge Hydra JUSTE APRÈS le
// seek (elle avance ensuite avec le transport). Pas de dépendance à la position au pixel exact —
// on assERTe le SAUT (grand écart avant/après) et le SUIVI (hydraClock ≈ position), robustes au jitter.

const RULER_Y = 10; // < RULER_H (22) — dans la bande règle
const HEADER_W = 80; // colonne d'en-tête inerte à gauche

// Charge une scène inline dans l'espace de travail (même voie que loadStarter du visual.spec :
// le handle __kanopi de main.ts), l'ouvre et l'active, attend que l'éditeur soit monté.
async function loadScene(page: import('@playwright/test').Page, path: string, contents: string) {
  await page.evaluate(
    ({ path, contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      w.__kanopi.workspace.openBundle([{ path, contents }], path);
      const f = w.__kanopi.workspace.files.find((x) => x.path === path);
      if (f) {
        w.__kanopi.workspace.openFile(f.id);
        w.__kanopi.workspace.setActive(f.id);
      }
    },
    { path, contents }
  );
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

// Active un onglet du bas (Structure = la timeline cliquable ; Console = le journal des voix).
async function bottomTab(page: import('@playwright/test').Page, re: RegExp) {
  await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const t = Array.from(document.querySelectorAll('.bp-tab')).find((el) =>
      rx.test(el.textContent || '')
    );
    (t as HTMLElement | undefined)?.click();
  }, re.source);
  await page.waitForTimeout(150);
}

// « fit » : remet la timeline en vue pleine scène → mapping x→temps linéaire et déterministe.
async function fitTimeline(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    (document.querySelector('.zoombtn[title="Ajuster à la vue"]') as HTMLElement | null)?.click();
  });
  await page.waitForTimeout(150);
}

// Clic RÈGLE à une fraction de la largeur utile → playFrom(sec). Renvoie le temps cible attendu.
async function seekRuler(
  page: import('@playwright/test').Page,
  frac: number,
  durationSec: number
): Promise<number> {
  await page.evaluate(
    ({ frac, rulerY, headerW }) => {
      const c = document.querySelector('.timeline-panel canvas') as HTMLCanvasElement | null;
      if (!c) throw new Error('timeline canvas absent');
      const r = c.getBoundingClientRect();
      const clientX = r.left + headerW + frac * (r.width - headerW);
      const clientY = r.top + rulerY;
      for (const type of ['mousedown', 'mouseup']) {
        c.dispatchEvent(
          new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true, view: window })
        );
      }
    },
    { frac, rulerY: RULER_Y, headerW: HEADER_W }
  );
  return frac * durationSec;
}

const evalWholeSession = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { kanopi: { eval(): Promise<void> } }).kanopi.eval());
const cmd = (page: import('@playwright/test').Page, fn: string) =>
  page.evaluate(
    (src) =>
      (new Function('k', src) as (k: unknown) => unknown)(
        (window as unknown as { kanopi: unknown }).kanopi
      ),
    fn
  );

test('seek notes: cliquer la règle fait REPARTIR la lecture depuis ce point (position + audio), en lecture ET depuis l’arrêt', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Scène de NOTES audibles, 8 temps = 8 s @60 bpm (assez longue pour seeker dedans).
  await loadScene(
    page,
    'seek-notes.bps',
    '@actor voice @alphabet.sargam transport.audio\nS -> sa re ga ma pa dha ni sa\n'
  );
  await evalWholeSession(page);
  await bottomTab(page, /structure/);
  await fitTimeline(page);

  // (A) SEEK PENDANT LECTURE : play, laisser avancer un peu, puis clic règle à 50% (~4 s).
  await cmd(page, 'k.play()');
  await page.waitForTimeout(700);
  const target = await seekRuler(page, 0.5, 8);
  await page.waitForTimeout(150);
  const posWarm = (await cmd(page, 'return k.inspect.position()')) as number;
  expect(posWarm).toBeGreaterThan(target - 1.5);
  expect(posWarm).toBeLessThan(target + 1.5);
  expect(await audio.getMaxRMS(900)).toBeGreaterThan(0.02);

  // (B) SEEK DEPUIS L’ARRÊT (garde de non-régression du fix 75a065a : l’audio se ré-établit sur la
  //     transition transport→running, quelle que soit la voie — playFrom compris). AVANT le fix,
  //     la position sautait mais l’audio restait MUET (RMS 0).
  await cmd(page, 'k.stop()');
  await page.waitForTimeout(500);
  expect((await cmd(page, 'return k.inspect.transportState()')) as string).toBe('stopped');
  const targetCold = await seekRuler(page, 0.5, 8);
  await page.waitForTimeout(200);
  expect((await cmd(page, 'return k.inspect.transportState()')) as string).toBe('running');
  const posCold = (await cmd(page, 'return k.inspect.position()')) as number;
  expect(posCold).toBeGreaterThan(targetCold - 1.5);
  expect(posCold).toBeLessThan(targetCold + 1.5);
  expect(await audio.getMaxRMS(1200)).toBeGreaterThan(0.02);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

test('seek Hydra: l’horloge propre de la voix (synth.time) se recale sur le point du drag, au frame près', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadScene(
    page,
    'seek-hydra.bps',
    '@actor viz eval.hydra\n' +
      'S -> viz_r viz_r viz_r viz_r viz_r viz_r viz_r viz_r\n' +
      'viz_r -> viz.`osc(10,0.1,0.8).out()`\n'
  );
  await evalWholeSession(page);
  await bottomTab(page, /structure/);
  await fitTimeline(page);

  await cmd(page, 'k.play()');
  await page.waitForTimeout(900);
  const clockBefore = (await cmd(page, "return k.inspect.hydraClock('hydra')")) as number;

  const target = await seekRuler(page, 0.75, 8); // ~6 s
  await page.waitForTimeout(60); // lire au plus tôt : synth.time avance ensuite
  // Lecture ATOMIQUE (un seul aller-retour) de l’horloge Hydra ET de la position — sinon la
  // position avance entre deux `evaluate` séparés et fausse l’écart.
  const { clockAfter, posAfter } = (await page.evaluate(() => {
    const k = (
      window as unknown as {
        kanopi: { inspect: { hydraClock(r: string): number | null; position(): number | null } };
      }
    ).kanopi;
    return { clockAfter: k.inspect.hydraClock('hydra'), posAfter: k.inspect.position() };
  })) as { clockAfter: number; posAfter: number };

  // SAUT : l’horloge Hydra a bondi du ~1 s d’avant-seek vers le point cliqué (~6 s). C’est la
  // preuve DURE du recalage (avant le fix / sans onSeek, elle resterait autour de ~1 s).
  expect(clockAfter - clockBefore).toBeGreaterThan(3);
  // RECALAGE sur la position transport (sceneTime). Tolérance 0.3 s : en headless le rAF est
  // throttlé donc `synth.time` (avancé par rAF) dérive un peu de la position (horloge audio) —
  // 0.3 s prouve le recalage/suivi sans exiger le frame exact d’un vrai navigateur (~4 ms mesuré).
  expect(Math.abs(clockAfter - posAfter)).toBeLessThan(0.3);
  // …sur le bon point (tolérance large : c’est le SAUT qu’on prouve, pas le pixel).
  expect(clockAfter).toBeGreaterThan(target - 1.5);
  expect(clockAfter).toBeLessThan(target + 1.5);

  // SUIVI : elle avance ensuite avec le transport (pas figée).
  await page.waitForTimeout(400);
  const clockLater = (await cmd(page, "return k.inspect.hydraClock('hydra')")) as number;
  expect(clockLater).toBeGreaterThan(clockAfter);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

test('seek Strudel: repli best-effort — le motif redémarre depuis le début du container, avec log d’offset', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Deux voix Strudel EN CONTAINER (calm/full, chaque container = 1 s dans une scène de 2 s) — un
  // seek DANS un container déclenche le repli (Strudel n’a pas d’horloge posable → re-eval + log).
  await loadScene(
    page,
    'seek-strudel.bps',
    '@actor drums eval.strudel\n' +
      '@actor lead eval.strudel\n' +
      'S -> calm full\n' +
      'calm -> drums_r\n' +
      'full -> { drums_r, lead_r }\n' +
      'drums_r -> drums.`note("c2*4").s("sine").gain(0.6)`\n' +
      'lead_r  -> lead.`note("e4 g4 b4 d5").s("triangle").gain(0.5)`\n'
  );
  await evalWholeSession(page);
  await bottomTab(page, /structure/);
  await fitTimeline(page);

  await cmd(page, 'k.play()');
  await page.waitForTimeout(500);
  await seekRuler(page, 0.75, 2); // ~1.5 s → dans le 2e container ('full'), offset 0.5 s / 1 s
  await page.waitForTimeout(500);

  // Le log de repli surgit dans le PANNEAU CONSOLE de l’app (pas la console navigateur). Format
  // EXACT (runtime-codevoices) : « seek fin non supporté (strudel) — motif redémarré depuis le
  // début du container (offset demandé X.XXXs/Y.YYYs) », 3 décimales.
  await bottomTab(page, /console/);
  const panelText = await page.evaluate(
    () => document.querySelector('[data-testid="console-panel"]')?.textContent || ''
  );
  expect(panelText).toMatch(
    /seek fin non supporté \(strudel\).*motif redémarré depuis le début du container.*offset demandé \d+\.\d{3}s\/\d+\.\d{3}s/
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
