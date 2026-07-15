import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Self-test for the compile chip's 3-signal health voyant (decision
// 2026-07-15-voyant-sante-niveau3.md): the chip must go RED not just on a parse/derive
// failure, but also when a declared resource (audio bank) doesn't resolve — Romain's
// bug was a scene that PARSED and DERIVED clean, logged "banque inconnue" to the
// console, yet the chip stayed a misleading green "compiles".
//
// The chip only reflects signals 1+2 (parse/derive + resource) after a PRODUCE
// (`openBlocks.produceLoadedProgram`, called by App.svelte on boot / LibrarySpace on
// open) — a bare Ctrl+Enter (`EditorArea`'s `onEval`) calls `core.evaluateBlock`
// directly and does NOT go through the produce/report path. We drive
// `produceLoadedProgram` via the dev-only `__kanopi` hatch (the SAME store instance
// App.svelte/LibrarySpace call — not a reimplementation), mirroring how
// `strudel.spec.ts` drives `__kanopi.workspace` for the same reason.

interface KanopiHatch {
  workspace: {
    loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
    files: { id: string; path: string }[];
    openFile: (id: string) => void;
    setActive: (id: string) => void;
  };
  openBlocks: {
    produceLoadedProgram: (fileId: string) => Promise<void>;
  };
}

async function loadAndProduce(
  page: import('@playwright/test').Page,
  path: string,
  contents: string
) {
  await page.evaluate(
    async ({ path, contents }) => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      const ws = w.__kanopi.workspace;
      ws.loadFiles([{ path, contents }], path);
      const target = ws.files.find((f) => f.path === path);
      if (!target) throw new Error(`fixture "${path}" did not land in the workspace`);
      ws.openFile(target.id);
      ws.setActive(target.id);
      await w.__kanopi.openBlocks.produceLoadedProgram(target.id);
    },
    { path, contents }
  );
}

test('an unresolved @library.strudel bank turns the compile chip RED (signal 2, resource)', async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Same skeleton as tests/fixtures/strudel.bps (parses + derives clean) but declaring
  // a bank absent from the guestLibraries catalog — the ONLY thing wrong with it.
  const broken = `@library.strudel "zzz-nonexistent"

@actor beat  eval.strudel

S -> beat

beat -> \`note("c2*4").s("sawtooth").gain(0.5)\`
`;

  await loadAndProduce(page, 'bad-bank.bps', broken);

  const chip = page.locator('.compile-chip').first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await expect(chip).toHaveClass(/fail/, { timeout: 5_000 });
  await expect(chip).not.toHaveClass(/ok/);
  await expect(chip.locator('.compile-label')).toHaveText('resource error');
  await expect(chip).toHaveAttribute('title', /zzz-nonexistent/);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});

test('a scene whose declared banks all resolve keeps the compile chip GREEN', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const fixturesDir = fileURLToPath(new URL('../../fixtures', import.meta.url));
  // `dirt-samples` is the canonical resolvable bank (library-catalog-source.test.ts) —
  // same fixture proven to make sound in strudel.spec.ts, reused here for the chip only.
  const healthy = readFileSync(join(fixturesDir, 'strudel.bps'), 'utf8');

  await loadAndProduce(page, 'good-bank.bps', healthy);

  const chip = page.locator('.compile-chip').first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await expect(chip).toHaveClass(/ok/, { timeout: 5_000 });
  await expect(chip).not.toHaveClass(/fail/);
  await expect(chip.locator('.compile-label')).toHaveText('compiles');

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});

// TODO (signal 3, runtime): a bonus 3rd case — a live Strudel voice throwing "sound not
// found" mid-play should also turn the chip red (phase 'runtime'), CONTINUOUSLY (it
// must clear again once the voice recovers, unlike signals 1/2 which are eval-time
// snapshots). Deferred: reliably provoking `getSlotErrors()` to populate from an e2e
// (vs. a parse-time failure, which is signal 1/2 territory) needs a sample name Strudel
// resolves as a valid pattern but superdough then fails to load asynchronously — timing
// against `onSlotErrorChange` from Playwright was flaky in manual trials and risked
// stalling the gate. `openBlocks.runtimeErrorsForFile` + the chip's 'runtime' phase are
// covered structurally (referenced.test.ts cases (b)/(d)); the live-voice trigger is a
// separate, lower-risk follow-up.
