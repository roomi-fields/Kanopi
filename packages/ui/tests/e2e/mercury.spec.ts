import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Mercury reached through a `.bps` code voice: the program declares a `melody`
// actor whose body is a Mercury backtick (`new synth saw …`). Evaluating the
// whole `.bps` derives the `melody` terminal, the dispatcher fires its backtick
// sink, and the Mercury adapter (Tone.js) plays.
//
// Cold Mercury boot = Vite-transforming the ~1.5 MB mercury-engine bundle on
// first eval — same 90s budget the legacy spec used for the same reason.
//
// SKIPPED (Romain, 2026-07-06): intermittent HTTP 429 from an external audio
// resource under gate load ("Error loading audio file" — rate-limited third
// party, not a Kanopi/Mercury regression). Passes 2/2 in isolation; fails
// non-deterministically only when the full e2e suite runs back-to-back and
// exhausts the remote quota. Not worth retry-flakiness in every gate run —
// re-enable once the audio dependency is self-hosted or the flakiness source
// is otherwise removed.
test.skip('a .bps mercury code voice evaluates and produces audio', async ({ page }) => {
  test.setTimeout(90_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'mercury.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi.workspace;
      ws.loadFiles([{ path: 'mercury.bps', contents }], 'mercury.bps');
      const target = ws.files.find((f) => f.path === 'mercury.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Whole-`.bps` eval — the `melody` Mercury backtick fires through the sink.
  await evalBlockAt(page, 1);

  // Wait for the Mercury adapter's own 'eval ok' Console entry (logged strictly
  // after instance.code() succeeded) — the cold import can take tens of seconds
  // under load. We deliberately do NOT wait for 'engine loaded' (sample buffers);
  // the `new synth saw` voice needs no samples.
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __kanopi?: {
          core?: { console?: { entries?: () => { runtime: string; msg: string }[] } };
        };
      };
      const entries = w.__kanopi?.core?.console?.entries?.() ?? [];
      return entries.some((e) => e.runtime === 'mercury' && e.msg.startsWith('eval ok'));
    },
    undefined,
    { timeout: 60_000 }
  );

  // Re-eval now that the engine is warm: this fresh Ctrl+Enter gesture lets
  // resume() execute within its user-activation window even if the cold import
  // outlived the first gesture. Mercury's code() replaces the sound tree
  // wholesale (idempotent live-coding semantics).
  await evalBlockAt(page, 1);

  // Real readiness signal: the captured AudioContext must actually be running.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __kanopiAnalysers?: AnalyserNode[] };
      return (w.__kanopiAnalysers ?? []).some((a) => a.context.state === 'running');
    },
    undefined,
    { timeout: 20_000 }
  );

  // At tempo 120, eighth-note time, a note fires every 250ms. Sample peak RMS
  // over 3s — each Tone envelope dips to silence between hits.
  const rms = await audio.getMaxRMS(3000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
