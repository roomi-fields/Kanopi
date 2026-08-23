import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors } from '../helpers';

// p5 reached through a `.bps` code voice: the program declares a `sketch` actor
// whose body is a p5 setup/draw backtick. Evaluating the whole `.bps` derives
// the `sketch` terminal, the dispatcher fires its backtick sink, and the p5
// adapter mounts its instance-mode <canvas> inside the fixed <div class="p5">.
// Assertion: non-background pixels painted at the canvas centre.
test('a .bps p5 code voice evaluates and paints non-background pixels', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'p5.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ contents }) => {
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
      const ws = w.__kanopi.workspace;
      ws.openBundle([{ path: 'p5.bps', contents }], 'p5.bps');
      const target = ws.files.find((f) => f.path === 'p5.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Whole-`.bps` eval — the `sketch` backtick fires through the dispatcher sink.
  await evalBlockAt(page, 1);

  // ⛔ KAN-65 — ON ATTEND LA TOILE, PAS UNE DURÉE. Une attente écrite en dur a produit SEPT
  //   retries en une journée, tous sur `litPixels === -1` : le sélecteur ne trouvait aucune
  //   toile après la seconde impartie. Ce n'était pas un rendu pâle, c'était une COURSE — et
  //   sous la charge d'une campagne complète, une seconde ne suffit pas toujours.
  //   La sonde rendait -1 (pas de toile), -2 (pas de contexte) et un COMPTE sur le même canal :
  //   trois pannes distinctes réduites à un nombre comparable, donc un échec qui ne se nomme pas.
  // ⛔ KAN-65 — L'ÉCHEC PORTE SA PROPRE PIÈCE. Mesuré : la toile manque environ une fois sur dix,
  //   EN ISOLATION (1 sur 6 puis 0 sur 8, hors campagne) — donc ni la charge ni une attente trop
  //   courte. Quinze secondes ne suffisent pas non plus : la toile n'apparaît simplement pas.
  //   Sans ce relevé, chaque occurrence se solde par « élément introuvable » et n'apprend rien.
  try {
    await expect(page.locator('.p5 canvas')).toBeVisible({ timeout: 15_000 });
  } catch (echec) {
    const etat = await page.evaluate(() => ({
      conteneursP5: document.querySelectorAll('.p5').length,
      toilesTotales: document.querySelectorAll('canvas').length,
      p5Charge: typeof (window as { p5?: unknown }).p5,
      htmlDuConteneur:
        (document.querySelector('.p5') as HTMLElement | null)?.outerHTML?.slice(0, 400) ??
        '(aucun conteneur .p5)'
    }));
    console.log('KAN-65 — état du DOM à l’échec : ' + JSON.stringify(etat));
    throw echec;
  }
  // La toile existe ; il reste à laisser `draw` produire sa première image.
  await page.waitForTimeout(500);

  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.p5 canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('KAN-65 : toile absente APRÈS attente explicite de visibilité');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('KAN-65 : toile présente mais sans contexte 2d');
    const w = Math.min(64, canvas.width);
    const h = Math.min(64, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2) - w / 2);
    const y = Math.max(0, Math.floor(canvas.height / 2) - h / 2);
    const img = ctx.getImageData(x, y, w, h);
    let lit = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] > 16 || img.data[i + 1] > 16 || img.data[i + 2] > 16) lit++;
    }
    return lit;
  });

  expect(litPixels).toBeGreaterThan(100);

  // A normal re-eval keeps exactly one canvas (the previous instance is removed).
  await evalBlockAt(page, 1);
  await page.waitForTimeout(500);
  const canvasCount = await page.locator('.p5 canvas').count();
  expect(canvasCount).toBe(1);

  // Ctrl+. stops the p5 instance + removes the canvas.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
