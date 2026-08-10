import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// Transport self-test layer: validates the topbar transport cluster
// (TransportCluster.svelte) and the bar.beat readout in the statusbar
// (Statusbar.svelte). bar.beat is a PROJECTION of Kronos's Transport position
// (contract kronos-transport.md): there is NO free-running idle metronome any
// more, so it only advances while a real scene plays — the transport tests load
// + arm a minimal `.bps` (loadAndArm) before Play. Kronos is the SOLE transport
// authority: with no live scene there is no Transport, so the `playing` state is
// projected ONLY from Kronos (no host clock fallback) — Play on an empty
// workspace stays stopped. Every Play-activation test therefore arms a scene first.
//
// Stable DOM selectors come from TransportCluster.svelte:
//   - `.tbtn[title="Play"]` / `.tbtn[title="Stop"]` — two icon buttons; the
//     Play button gains class `.playing` once the transport state reads playing.
//   - `.tap-btn` — TAP tempo trigger; clicking ≥2 times within 2.5s lets
//     MockClock.tap() compute and apply a new BPM.
// Statusbar.svelte exposes `bar.beat` via the `.sb-item` whose tooltip is
// "bar.beat (Ableton-style, 1-indexed)"; the live value is the `.num` span
// inside that item.

const POS_LOCATOR = '.sb-item[title^="bar.beat"] .num';

// Minimal BPScript scene: 8 Western pitches → 8 beats at the default 128 BPM.
// Enough span for bar.beat to visibly advance once the Kronos Transport plays it.
// `:audio`, NOT `:midi`: this probe tests the TRANSPORT, and since the
// MIDI fail-loud GATE a `:midi` scene without a device (no setupFakeMidi here)
// would be BLOCKED at eval — the probe must stay playable without MIDI hardware.
const PROBE_SCENE = `@core
@alphabet.western:audio

S -> C4 D4 E4 G4 C5 G4 E4 C4
`;

// Load the probe scene, focus its editor, and PRODUCE it (arm at rest) so the
// Play button's replay edge re-evaluates it into a live Kronos Transport. bar.beat
// has no idle metronome any more — it only moves when a real scene plays.
async function loadAndArm(page: import('@playwright/test').Page) {
  await page.evaluate((contents) => {
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
    w.__kanopi.workspace.openBundle(
      [{ path: 'transport-probe.bps', contents }],
      'transport-probe.bps'
    );
  }, PROBE_SCENE);
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { workspace: { files: { path: string }[] } } };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'transport-probe.bps');
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const t = w.__kanopi.workspace.files.find((f) => f.path === 'transport-probe.bps');
    if (t) {
      w.__kanopi.workspace.openFile(t.id);
      w.__kanopi.workspace.setActive(t.id);
    }
    return t?.id ?? '';
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await page.evaluate(async (fid) => {
    const w = window as unknown as {
      __kanopi: { openBlocks: { produceLoadedProgram: (id: string) => Promise<void> } };
    };
    await w.__kanopi.openBlocks.produceLoadedProgram(fid);
  }, id);
  await page.waitForTimeout(300);
}

test('Play button click activates transport', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Kronos is the sole transport authority: the `playing` state comes from a live
  // Transport, which only exists once a scene is armed + played. Arm a minimal scene
  // first (no host clock fallback fabricates `playing` on an empty workspace).
  await loadAndArm(page);

  // Sanity: Play button starts WITHOUT the `.playing` class.
  const playBtn = page.locator('.tbtn[title="Play"]');
  await expect(playBtn).toBeVisible();
  await expect(playBtn).not.toHaveClass(/\bplaying\b/);

  await playBtn.click();

  // Once the armed scene evaluates into a live Kronos Transport, the button picks
  // up `.playing` and its title
  // flips to "Playing" (TransportCluster.svelte:31). Either signal is fine;
  // we check both for belt-and-braces.
  await expect(page.locator('.tbtn.playing')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('.tbtn[title="Playing"]')).toBeVisible();

  // Stop before yielding so the next test starts from a stopped transport.
  await page.locator('.tbtn[title="Stop"]').click();
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

test('bar.beat counter advances within 3 seconds after Play at the effective tempo', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // bar.beat is a PROJECTION of Kronos's Transport position (contract
  // kronos-transport.md) — there is no free-running idle metronome any more, so
  // it only advances while a real scene PLAYS. Load a minimal .bps (8 beats),
  // arm it (Produce), then Play through the transport button.
  await loadAndArm(page);

  const posBefore = (await page.locator(POS_LOCATOR).innerText()).trim();
  // Stopped state is 001.01 — record whatever it is and assert the string
  // CHANGES post-Play, rather than hardcoding (the formatter is the truth).
  await page.locator('.tbtn[title="Play"]').click();
  await expect(page.locator('.tbtn.playing')).toBeVisible({ timeout: 3_000 });

  // Whatever the effective tempo is (the scene's `@mm`, else the session tempo
  // injected into the AST, else BPx's own default), a beat is well under 3s, so
  // the bar.beat string must move from its frozen initial value (DERIVED from
  // transport.beatPosition()). We assert the BEHAVIOUR (the counter advances),
  // not a magic BPM number.
  // `expect.poll` re-reads the DOM until the predicate holds or the timeout fires.
  await expect
    .poll(async () => (await page.locator(POS_LOCATOR).innerText()).trim(), {
      timeout: 3_000,
      intervals: [100, 200, 400]
    })
    .not.toBe(posBefore);

  // Hush + stop for cleanup.
  await page.locator('.tbtn[title="Stop"]').click();
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

// The BPM module in TransportCluster.svelte (lines 37-40) is a pure display:
// `<div class="bpm-module"><span class="bpm-value">…</span></div>`. There is
// no onclick handler, no input, no contenteditable affordance — clicking the
// number does nothing in the current UI. The Inspector panel (right-panel)
// renders bpm as a <dd> too, also read-only. Until an editable BPM widget
// exists, this item cannot be automated without modifying app source (which
// is outside this self-test layer's read-only scope).
test.fixme('BPM widget reflects the effective tempo; clicking it and typing a new value updates the displayed tempo', async ({
  page
}) => {
  await page.goto('');
  // No editable BPM widget exists yet — see comment above. When one lands,
  // this test should: assert ".bpm-value" reflects the EFFECTIVE tempo (the
  // scene's `@mm`, else the session tempo, else BPx's engine default — NOT a
  // hardcoded host 128, which was removed), click into it, type "100", press
  // Enter, and assert ".bpm-value" reads "100".
});

test('TAP tempo: derived BPM matches the real click cadence', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // We ASK for ~500ms between taps, but under machine load Playwright has
  // delivered clicks 900-1130ms apart — and MockClock.tap() correctly derived
  // 52-67 BPM from that REAL cadence. Asserting an absolute band (the old
  // [80, 150]) tests Playwright's scheduling, not the widget. Instead we
  // record the actual click timestamps in-page (same performance.now() time
  // base and same click event MockClock.tap() consumes) and assert the app's
  // BPM matches the cadence it actually received.
  const tap = page.locator('.tap-btn');
  await expect(tap).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __kanopiTapTimes?: number[] };
    w.__kanopiTapTimes = [];
    document.querySelector('.tap-btn')?.addEventListener('click', () => {
      w.__kanopiTapTimes?.push(performance.now());
    });
  });
  for (let i = 0; i < 4; i++) {
    await tap.click();
    // Pacing only — the assertion below uses the cadence actually delivered,
    // so drift here is harmless.
    if (i < 3) await page.waitForTimeout(500);
  }

  const tapTimes = await page.evaluate(() => {
    const w = window as unknown as { __kanopiTapTimes?: number[] };
    return w.__kanopiTapTimes ?? [];
  });
  expect(tapTimes, 'all 4 clicks must reach the TAP button').toHaveLength(4);

  // Oracle mirrors the widget's documented semantics (mock-runtime.ts:161-172):
  // only taps within the trailing 2.5s window count; BPM = 60000 / mean delta.
  const last = tapTimes[tapTimes.length - 1];
  const windowed = tapTimes.filter((t) => last - t < 2500);
  expect(
    windowed.length,
    `need ≥2 taps within the widget's 2.5s window to derive a BPM — clicks landed too far apart (${tapTimes.map((t) => Math.round(t)).join(', ')})`
  ).toBeGreaterThan(1);
  const deltas = windowed.slice(1).map((t, i) => t - windowed[i]);
  const expectedBpm = 60000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length);

  // Read the live BPM straight from the dev hatch (`__kanopi.clock`, set up
  // in main.ts:25-35 under import.meta.env.DEV). That avoids parsing rounded
  // text from the topbar (which shows `<int>.<tenth>` via two separate spans).
  const bpm = await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi?: { clock?: { state?: { bpm?: number } } };
    };
    return w.__kanopi?.clock?.state?.bpm ?? -1;
  });
  // Wide sanity band first: a genuinely broken widget (NaN, 0, runaway value)
  // fails regardless of cadence.
  expect(bpm, `tap-derived BPM out of sane range, got ${bpm}`).toBeGreaterThan(20);
  expect(bpm).toBeLessThan(300);
  // Main assertion: the app's BPM tracks the cadence it really received.
  // ±15% absorbs the tiny offset between our listener's timestamps and
  // tap()'s own performance.now() reads while still catching real regressions
  // (a stuck or mis-averaging tap() lands far outside this).
  const ratio = Math.abs(bpm - expectedBpm) / expectedBpm;
  expect(
    ratio,
    `app BPM ${bpm.toFixed(1)} should be within 15% of cadence-derived ${expectedBpm.toFixed(1)}`
  ).toBeLessThan(0.15);

  // No transport was started; nothing to hush. Still ping Ctrl+. defensively
  // per project memory (hush-after-test) before yielding.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});

test('Stop button halts the transport — bar.beat freezes', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // A real scene must be playing for the position to advance (no idle metronome).
  await loadAndArm(page);

  // Start.
  await page.locator('.tbtn[title="Play"]').click();
  await expect(page.locator('.tbtn.playing')).toBeVisible({ timeout: 3_000 });

  // Wait long enough for at least one beat (>469ms at 128 BPM) so we know the
  // counter has moved from its initial value.
  await page.waitForTimeout(800);

  // Stop. Kronos's Transport.stop() resets the position to 0, so the post-stop
  // bar.beat is the frozen "001.01" string the player started from. We capture
  // the FIRST post-stop reading and assert the string does NOT change over a
  // 1.5s observation window (the position authority is frozen, not ticking).
  await page.locator('.tbtn[title="Stop"]').click();
  await expect(page.locator('.tbtn.playing')).toHaveCount(0, { timeout: 2_000 });

  const posJustAfterStop = (await page.locator(POS_LOCATOR).innerText()).trim();
  await page.waitForTimeout(1_500);
  const posLater = (await page.locator(POS_LOCATOR).innerText()).trim();
  expect(posLater, 'bar.beat must not advance after Stop').toBe(posJustAfterStop);

  // Hush is a no-op here (no audio) but matches the project's
  // hush-after-test convention.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
