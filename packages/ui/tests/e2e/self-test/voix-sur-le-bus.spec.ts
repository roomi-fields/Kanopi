import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// UNE VOIX DE CODE ATTEINT LE BUS COMMUN — SANS PONT. La preuve du chantier bus [1253-1261].
//
// CE QU'ELLE MESURE, ET POURQUOI ELLE NE POUVAIT PAS ÊTRE ÉCRITE AVANT : jusqu'au 2026-08-10, une
// voix publiait sur un bus À ELLE, et `real-core` republiait sur le bus commun — deux bus et un
// pont. Une preuve écrite à ce moment-là aurait traversé le pont, donc elle n'aurait rien dit du
// chemin d'aujourd'hui. Le pont est SUPPRIMÉ (pas commenté) : les six voix reçoivent le bus commun
// à leur CONSTRUCTION et y publient directement.
//
// ⚠️ ELLE PASSE PAR L'API PILOTE, jamais par un import de store : un store importé dans la page
// donne une instance DUPLIQUÉE qui ne voit rien, et le banc rendrait un vert sur un bus qui n'est
// pas celui de l'application.
//
// ⚠️ ET ELLE MESURE L'ARRIVÉE, PAS L'ÉMISSION. Qu'une voix appelle `emit` ne prouve rien : le
// silence d'une migration d'émission ratée est exactement un `emit` qui part vers un bus que
// personne ne consomme. Ce qui est lu ici est ce qu'un CONSOMMATEUR du bus commun a reçu.
test('une voix de code publie sur le bus COMMUN, sans pont', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'p5.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate((contents) => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          openBundle: (f: { path: string; contents: string }[], focus?: string) => unknown;
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const ws = w.__kanopi.workspace;
    ws.openBundle([{ path: 'p5.bps', contents }], 'p5.bps');
    const cible = ws.files.find((f) => f.path === 'p5.bps')!;
    ws.openFile(cible.id);
    ws.setActive(cible.id);
  }, program);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  // Sondage : l'événement arrive quand la voix démarre, pas à l'instant de l'évaluation.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const w = window as unknown as {
            kanopi?: { inspect?: { voiceEvents?: () => readonly { type: string }[] } };
          };
          return (w.kanopi?.inspect?.voiceEvents?.() ?? []).length;
        }),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);

  const vus = await page.evaluate(() => {
    const w = window as unknown as {
      kanopi?: { inspect?: { voiceEvents?: () => readonly { type: string }[] } };
    };
    return (w.kanopi?.inspect?.voiceEvents?.() ?? []).map((e) => e.type);
  });
  // Les six voix publient `trigger` (p5, js, hydra, mercury, csound) ou `token` (strudel).
  expect(vus.some((t) => t === 'trigger' || t === 'token')).toBe(true);

  noErrors();
});
