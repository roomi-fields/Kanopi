import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// KAN-orchestration P1 — RE-RANDOM on the Kairos path (closes the gap where the
// StructureSource re-projected a FROZEN tree). With re-random ON + looping, Kanopi
// registers `kairos.setReDerive(cb)`; Kronos fires `cb` at each loop edge → the host
// re-derives the grammar with a FRESH seed (re-rolling `@mode:random` / weighted rules)
// and `charger`s the new tree → generation bump → Kronos swaps the new flat at the edge.
//
// The proof: `cv-lfo.bps` has a `@mode:random` `Arp` rule with FOUR distinct note
// sequences (weighted). Looping with re-random ON, the derived production must show
// MORE THAN ONE distinct token sequence across consecutive cycles (a re-roll); a frozen
// tree would replay ONE sequence forever. We compare the symbolic production the adapter
// re-publishes each cycle (`__kanopi.production.current.tokens`), not the audio.

interface ProdTok {
  token: string;
}
interface KanopiHatch {
  production: { current: { tokens: ProdTok[] } | null };
  transport: { reRandom: boolean; loop: boolean; toggleReRandom: () => void };
}

/** Load cv-lfo.bps into the workspace and focus its editor. Returns its source. */
async function loadCvLfo(page: Page): Promise<string> {
  const bundledDir = fileURLToPath(new URL('../../../library/scenes/cv', import.meta.url));
  const program = readFileSync(join(bundledDir, 'cv-lfo.bps'), 'utf8');
  // Sanity: the fixture must actually carry the random rule we rely on.
  expect(program).toContain('@mode:random');

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
          };
        };
      };
      w.__kanopi.workspace.openBundle([{ path: 'cv-lfo.bps', contents }], 'cv-lfo.bps');
    },
    { contents: program }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { workspace: { files: { path: string }[] } } };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'cv-lfo.bps');
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'cv-lfo.bps');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  return program;
}

/** Sample the derived production token sequence over several loop cycles, collecting the
 *  DISTINCT signatures seen. `stopAt` ends early once that many distinct signatures appear. */
async function collectSignatures(
  page: Page,
  samples: number,
  stopAt: number
): Promise<Set<string>> {
  const signatures = new Set<string>();
  for (let i = 0; i < samples; i++) {
    const sig = await page.evaluate(() => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      const toks = w.__kanopi.production.current?.tokens ?? [];
      return toks.map((t) => t.token).join(' ');
    });
    if (sig.length > 0) signatures.add(sig);
    if (signatures.size >= stopAt) break;
    await page.waitForTimeout(500);
  }
  return signatures;
}

// SKIPPÉ (décision Romain 2026-08-08, KAN-40) : joue cv/cv-lfo.bps, déclarée rouge par la
// garde de statut du corpus. La scène déclare son LFO (rate:0.4, amplitude:0.9, shape:sine sur
// sweep) avec des mots supprimés du langage ; la forme qui préserverait ces réglages n'existe pas
// encore dans le parseur et sera revue avec FaustX. Revient avec la scène.
test.skip('re-random re-rolls the derivation each loop cycle (Kairos path)', async ({ page }) => {
  // The scene loops ~4.8 s (@tempo:100, 8 beats). We watch ~4 cycles → ~20 s + load/eval.
  test.setTimeout(60_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  await loadCvLfo(page);

  // Arm re-random BEFORE evaluating: the adapter reads `transport.reRandom` at eval
  // time to decide whether to register `kairos.setReDerive`. Loop is ON by default.
  await page.evaluate(() => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    w.__kanopi.transport.reRandom = true;
    w.__kanopi.transport.loop = true;
  });

  // Evaluate (Ctrl+Enter) — this derives + starts looping playback.
  await evalBlockAt(page, 1);

  // Audio sanity: the scene sounds.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // ~20 s at 500 ms cadence ≈ 4 loop cycles; stop early once a re-roll is seen.
  const signatures = await collectSignatures(page, 40, 2);

  // Hush BEFORE the assertion so audio never lingers if the assertion fails.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);

  // The decisive assertion: the looping re-random produced MORE THAN ONE distinct
  // derived sequence ⇒ the grammar re-rolled each cycle (Kairos re-derive fired).
  expect(
    signatures.size,
    `expected ≥2 distinct derived token sequences across loop cycles (re-roll), ` +
      `saw ${signatures.size}: ${[...signatures].map((s) => `«${s.slice(0, 60)}…»`).join(' | ')}`
  ).toBeGreaterThanOrEqual(2);

  noErrors();
});

// SKIPPÉ (décision Romain 2026-08-08, KAN-40) : joue cv/cv-lfo.bps, déclarée rouge par la
// garde de statut du corpus. La scène déclare son LFO (rate:0.4, amplitude:0.9, shape:sine sur
// sweep) avec des mots supprimés du langage ; la forme qui préserverait ces réglages n'existe pas
// encore dans le parseur et sera revue avec FaustX. Revient avec la scène.
test.skip('LIVE toggle: re-random armed mid-play starts re-rolling (Kairos path)', async ({
  page
}) => {
  // OFF → frozen (one sequence). Toggle ON live → re-rolls (more distinct sequences). The
  // arming goes transport.toggleReRandom → handle.setReRandom → kairos.setReDerive(cb).
  test.setTimeout(90_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  await loadCvLfo(page);

  // Start with re-random OFF (loop ON) so the tree is STATIC at eval.
  await page.evaluate(() => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    w.__kanopi.transport.reRandom = false;
    w.__kanopi.transport.loop = true;
  });
  await evalBlockAt(page, 1);

  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Phase 1 — re-random OFF: across several cycles the derived sequence must NOT change
  // (loop identity). We give up early only if it does (that would be a failure below).
  const offSigs = await collectSignatures(page, 16, 2); // ~8 s ≈ 2 cycles.
  expect(
    offSigs.size,
    `re-random OFF must replay ONE sequence (loop identity), saw ${offSigs.size}: ` +
      `${[...offSigs].map((s) => `«${s.slice(0, 60)}…»`).join(' | ')}`
  ).toBe(1);
  const frozen = [...offSigs][0];

  // Phase 2 — ARM re-random LIVE (the fix under test). The toggle re-arms
  // kairos.setReDerive on the playing handle, so the NEXT loop edges re-roll.
  await page.evaluate(() => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    w.__kanopi.transport.toggleReRandom(); // OFF → ON
  });

  // Now a DIFFERENT sequence than the frozen one must appear within a few cycles.
  let sawDifferent = false;
  for (let i = 0; i < 30; i++) {
    const sig = await page.evaluate(() => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      return (w.__kanopi.production.current?.tokens ?? []).map((t) => t.token).join(' ');
    });
    if (sig.length > 0 && sig !== frozen) {
      sawDifferent = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  // Hush before asserting.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);

  expect(
    sawDifferent,
    `after arming re-random LIVE, a sequence DIFFERENT from the frozen «${(frozen ?? '').slice(0, 60)}…» ` +
      `must appear (the live toggle re-armed kairos.setReDerive)`
  ).toBe(true);

  noErrors();
});
