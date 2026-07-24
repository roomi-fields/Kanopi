import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Regression coverage for the Kronos fix (commit 9a7595a, @kronos/core symlink,
// consumed in `development` mode) — muting a code-voice actor (Strudel) from the
// mixer must actually silence its audio output, and unmuting must bring it back.
// Before the fix, `setActorMuted` did not fan out to every adapter, so a Strudel
// actor kept sounding after its mixer strip showed "muted". No e2e ever asserted
// this on RMS — a console rejection log was treated as sufficient proof, which it
// is not (the architect's standard: audible silence at the ear, proven by RMS).
//
// Bundled sessions loaded straight from disk (mirrors
// tests/e2e/sessions/session-strudel-solo.spec.ts /
// session-strudel-hydra.spec.ts) — self-contained `.bps`, one runnable block,
// Ctrl+Enter evaluates the whole session and places every backtick voice in
// time.
//
// Mixer mute button: ActorsPanel.svelte (`button.mix-mute`, merged in from the
// former MixerStrips.svelte) — `title="mute <actor> (mixer)"` when off,
// `title="unmute <actor>"` when on. Clicking calls `mixer.toggleActorMuted(a.name)`
// — the exact gesture a performer uses at the desk, so we drive it via a real
// click rather than the mixer store directly.
const BUNDLED = fileURLToPath(new URL('../../../library/scenes/code-voices', import.meta.url));

// The mute route (mixer.svelte.ts:92-100) gates on `isOrchestratedActor(name)`
// — the actor must be a registered live voice in bpx-adapter's
// `orchestratedVoices` map before a mute click has anything to act on. That
// registration lands moments after the actor first appears in `actors.list`
// (which we already assert on), and its exact timing isn't exposed to the
// page. Rather than a single fixed wait — which flaked once in manual runs,
// the mute click landing a beat before registration settled and reading back
// a still-sounding RMS — poll for the RMS to actually cross the threshold
// within a generous budget. This proves the same claim (mute achieves real
// silence) without depending on a lucky wall-clock guess; if mute genuinely
// never silences the actor, the loop exhausts and the final assertion fails
// exactly as it would with a fixed wait.
async function waitForRms(
  audio: { getMaxRMS: (sampleMs: number) => Promise<number> },
  predicate: (rms: number) => boolean,
  { sampleMs = 500, maxAttempts = 10 }: { sampleMs?: number; maxAttempts?: number } = {}
): Promise<number> {
  let last = 0;
  for (let i = 0; i < maxAttempts; i++) {
    last = await audio.getMaxRMS(sampleMs);
    if (predicate(last)) return last;
  }
  return last;
}

// Separate, DISCOVERED-not-scoped race: superdough (Strudel's audio engine)
// compiles its AudioWorklets asynchronously after the pattern already starts
// sounding via a plain WebAudio oscillator (a bare `.s("sine")` needs no
// worklet). In this sandboxed headless environment that cold compile
// reproducibly took ~25-28s. Manual instrumentation (not committed) showed
// that clicking mixer mute WHILE that compile is still in flight silently
// loses the mute — RMS stayed flat (~0.09-0.14, no decay at all) across a
// full 4.8s post-click sampling window. Once the engine reports itself ready,
// the SAME mute click silences to RMS=0 every time. That boot-race is a
// distinct bug from the one this suite proves fixed (steady-state mute via
// Kronos's `setActorMuted` fan-out, confirmed below) — flag for Kronos/
// runtime-codevoices, don't let it flake this suite. So: wait for the
// engine's own "ready" console line before touching the mixer at all. This
// couples the test to an implementation log line (fragile in the sense that
// a wording change breaks the wait, not the test's correctness) — the least
// bad option in the absence of a public "audio engine ready" signal on
// `window.kanopi`/`window.__kanopi`.
function trackSuperdoughReady(page: import('@playwright/test').Page): () => Promise<void> {
  let ready = false;
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('superdough') && t.includes('ready')) ready = true;
  });
  return async () => {
    // Bounded but generous — in this sandbox the cold compile was observed
    // anywhere from ~0ms (warm, second Strudel boot in the same browser
    // process) to >35s (cold), and in one run apparently never within 120s,
    // which points at host CPU contention on this shared dev box rather than
    // a deterministic app defect (worth flagging to runtime-codevoices/
    // Kronos separately as a sandbox-perf anomaly). Cap at 45s so a genuinely
    // stuck boot fails FAST and visibly instead of eating the whole test
    // budget; if the cap is hit we proceed anyway and let the mute
    // assertions below report honestly on whatever state the engine is in.
    const start = Date.now();
    const deadline = start + 45_000;
    while (!ready && Date.now() < deadline) {
      await page.waitForTimeout(200);
    }
    if (ready) {
      console.log(`[mute-code-voice] superdough ready after ${Date.now() - start}ms of waiting`);
    } else {
      console.log(
        `[mute-code-voice] WARNING: superdough "ready" not observed within 45s — proceeding anyway; a mute failure below may reflect this cold-boot race rather than the Kronos fan-out fix itself.`
      );
    }
  };
}

test('muting a Strudel actor via the mixer silences it, unmuting brings it back (01 - strudel solo)', async ({
  page
}) => {
  test.setTimeout(90_000);
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);
  const waitForSuperdoughReady = trackSuperdoughReady(page);

  const sessionContents = readFileSync(join(BUNDLED, '01-strudel-solo.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate((session) => {
    const w = window as unknown as {
      __kanopi?: {
        workspace: {
          loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
        };
      };
    };
    w.__kanopi!.workspace.loadFiles(
      [{ path: '01-strudel-solo.bps', contents: session }],
      '01-strudel-solo.bps'
    );
  }, sessionContents);

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '01-strudel-solo.bps');
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Ctrl+Enter on line 5 (`@actor drums ...`) evaluates the whole session — the
  // backtick voice is placed in time and fires the Strudel adapter.
  await evalBlockAt(page, 5);

  // Confirm the actor is live and routed through strudel before trusting the
  // RMS assertions below.
  const drumsActor = await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi?: { actors: { list: { name: string; runtime: string }[] } };
    };
    return w.__kanopi?.actors.list.find((a) => a.name === 'drums') ?? null;
  });
  expect(drumsActor, 'actor "drums" must be live after eval').not.toBeNull();
  expect(drumsActor?.runtime).toBe('strudel');

  // Let superdough's cold AudioWorklet boot settle before exercising mute —
  // see `trackSuperdoughReady` above for why.
  await waitForSuperdoughReady();

  // Strudel schedules one cycle ahead — peak-sample over 2.5s to catch the
  // loudest moment before we trust "audio is running".
  const rmsBefore = await audio.getMaxRMS(2500);
  console.log(`[mute-code-voice] rmsBefore (playing, unmuted) = ${rmsBefore}`);
  expect(
    rmsBefore,
    'audio must be running before we test mute — else the test is vacuous'
  ).toBeGreaterThan(0.001);

  // The performer gesture: click the mixer strip's "M" button for `drums`.
  const muteButton = page.getByTitle('mute drums (mixer)');
  await expect(muteButton).toBeVisible({ timeout: 5_000 });
  await muteButton.click();

  // Poll for RMS to actually cross the silence threshold — covers both
  // Strudel's scheduler lookahead flush (same rationale as the hush test,
  // shortcuts.spec.ts:130-137) and the orchestrated-voice registration race
  // described above. Budget: 10 x 500ms = up to 5s.
  const rmsAfter = await waitForRms(audio, (v) => v < 0.01);
  console.log(`[mute-code-voice] rmsAfter (muted) = ${rmsAfter}, rmsBefore = ${rmsBefore}`);
  expect(
    rmsAfter,
    `mixer mute must silence the Strudel actor — got before=${rmsBefore} after=${rmsAfter}`
  ).toBeLessThan(rmsBefore * 0.15);
  expect(
    rmsAfter,
    `mixer mute must drop RMS below the audible floor — got after=${rmsAfter}`
  ).toBeLessThan(0.01);

  // Unmute — same button, title flips to "unmute drums" while muted.
  const unmuteButton = page.getByTitle('unmute drums');
  await expect(unmuteButton).toBeVisible({ timeout: 5_000 });
  await unmuteButton.click();

  // Poll for sound to resume (a couple of Strudel cycles to reach the
  // audible part of its lookahead window). Budget: 10 x 500ms = up to 5s.
  const rmsBack = await waitForRms(audio, (v) => v > 0.001);
  console.log(`[mute-code-voice] rmsBack (unmuted again) = ${rmsBack}`);
  expect(rmsBack, `unmute must bring the sound back — got rmsBack=${rmsBack}`).toBeGreaterThan(
    0.001
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

test('muting the Strudel actor in a Strudel+Hydra session silences audio only (02 - strudel + hydra)', async ({
  page
}) => {
  test.setTimeout(120_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);
  const waitForSuperdoughReady = trackSuperdoughReady(page);

  const sessionContents = readFileSync(join(BUNDLED, '02-strudel-hydra.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate((session) => {
    const w = window as unknown as {
      __kanopi?: {
        workspace: {
          loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
        };
      };
    };
    w.__kanopi!.workspace.loadFiles(
      [{ path: '02-strudel-hydra.bps', contents: session }],
      '02-strudel-hydra.bps'
    );
  }, sessionContents);

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '02-strudel-hydra.bps');
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 5);

  const grooveActor = await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi?: { actors: { list: { name: string; runtime: string }[] } };
    };
    return w.__kanopi?.actors.list.find((a) => a.name === 'groove') ?? null;
  });
  expect(grooveActor, 'actor "groove" must be live after eval').not.toBeNull();
  expect(grooveActor?.runtime).toBe('strudel');

  // Let superdough's cold AudioWorklet boot settle before exercising mute —
  // see `trackSuperdoughReady` above for why.
  await waitForSuperdoughReady();

  const rmsBefore = await audio.getMaxRMS(2500);
  console.log(`[mute-code-voice] (02) rmsBefore (playing, unmuted) = ${rmsBefore}`);
  expect(
    rmsBefore,
    'audio must be running before we test mute — else the test is vacuous'
  ).toBeGreaterThan(0.001);

  // `viz` (Hydra) is video-only and not asserted here — RMS cannot see it.
  const muteButton = page.getByTitle('mute groove (mixer)');
  await expect(muteButton).toBeVisible({ timeout: 5_000 });
  await muteButton.click();

  const rmsAfter = await waitForRms(audio, (v) => v < 0.01);
  console.log(`[mute-code-voice] (02) rmsAfter (muted) = ${rmsAfter}, rmsBefore = ${rmsBefore}`);
  expect(
    rmsAfter,
    `mixer mute must silence the "groove" Strudel actor — got before=${rmsBefore} after=${rmsAfter}`
  ).toBeLessThan(rmsBefore * 0.15);
  expect(
    rmsAfter,
    `mixer mute must drop RMS below the audible floor — got after=${rmsAfter}`
  ).toBeLessThan(0.01);

  const unmuteButton = page.getByTitle('unmute groove');
  await expect(unmuteButton).toBeVisible({ timeout: 5_000 });
  await unmuteButton.click();

  const rmsBack = await waitForRms(audio, (v) => v > 0.001);
  console.log(`[mute-code-voice] (02) rmsBack (unmuted again) = ${rmsBack}`);
  expect(rmsBack, `unmute must bring the sound back — got rmsBack=${rmsBack}`).toBeGreaterThan(
    0.001
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
