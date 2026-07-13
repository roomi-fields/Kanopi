import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupAudioCapture,
  evalBlockAt,
  expectNoConsoleErrors,
  readCanvasLitPixels
} from '../../helpers';

// Visual regression layer for the self-test suite. Captures four reference
// pixmaps per project:
//   1. boot shell with no session
//   2. Library panel listing the 3 bundled starters
//   3-5. each starter session loaded + first block evaluated
//
// Baselines DO NOT exist on the first run. The first invocation MUST fail and
// produce candidate snapshots in test-results/; the PM reviews them before
// committing baselines via `npm run e2e:visual:update`.
//
// Every assertion masks the bar.beat counter in the status bar — it advances
// every animation frame the transport is running, so leaving it unmasked
// would force a re-baseline every test run.
//
// `maxDiffPixels: 600` absorbs antialiasing jitter (subpixel hinting around
// editor glyphs, status bar separators, active-actor LED indicator color
// drift) without hiding genuine UI drift. Threshold tuned to ~1.4% of total
// pixels in the typical viewport — bumped from 200 after observing 423-px
// flake on starter 01 across consecutive runs (transport-tick-driven LED
// color shift). Reduce if false negatives become a problem.

const BUNDLED = fileURLToPath(new URL('../../../../library/bundled', import.meta.url));
const SNAPSHOT_OPTS = { maxDiffPixels: 600 } as const;

// Selector for the live bar.beat readout in Statusbar.svelte:35. Mask wraps
// the entire `.sb-item` so both the dim label and the changing digits are
// hidden by the screenshot comparison.
//
// The Console panel (ConsolePanel.svelte) is masked too: its rows carry
// wall-clock HH:MM:SS timestamps and Strudel's `%c[...]` eval logs, whose
// content and count vary every run — a genuinely non-deterministic region
// (it drove a ~3450-px flake on starter 03, dominated by this panel). Masking
// it hides ONLY that noise; the transport cluster, LEDs and structural chrome
// stay asserted.
function maskTargets(page: import('@playwright/test').Page) {
  return [
    page.locator('[title="bar.beat (Ableton-style, 1-indexed)"]'),
    page.locator('[data-testid="console-panel"]')
  ];
}

// Wait long enough for adapter-deferred work (Strudel core import, p5 boot,
// font shaping) to settle before the very first screenshot — otherwise the
// boot pixmap drifts session-to-session depending on cold/warm caches.
async function waitForShell(page: import('@playwright/test').Page) {
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('no file open').first()).toBeVisible();
  await page.waitForTimeout(800);
}

// Stub requestAnimationFrame so Hydra's rendering loop and any rAF-driven
// LED indicator stops scheduling new frames. The last painted frame remains
// on the canvas. Required before toHaveScreenshot() — Playwright otherwise
// takes two consecutive shots and fails the stability check whenever pixels
// keep changing (Hydra animations, transport LED pulses, etc.).
async function freezeAnimations(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(100);
}

// Push starter files into the workspace via the dev-only handle installed by
// main.ts. Same flow as packages/ui/tests/e2e/strudel.spec.ts — `loadFiles`
// replaces the workspace and focuses the .kanopi session, then we explicitly
// open the actor body so the editor mounts on it before Ctrl+Enter.
async function loadStarter(
  page: import('@playwright/test').Page,
  files: { path: string; contents: string }[],
  focusSession: string,
  evalActorPath: string
) {
  await page.evaluate(
    ({ files, focus }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(files, focus);
    },
    { files, focus: focusSession }
  );

  await page.waitForFunction((wantedPath) => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === wantedPath);
  }, evalActorPath);

  await page.evaluate((wantedPath) => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const target = w.__kanopi.workspace.files.find((f) => f.path === wantedPath);
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  }, evalActorPath);

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

test('boot screenshot of the empty shell with no session open', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await waitForShell(page);
  await freezeAnimations(page);

  await expect(page).toHaveScreenshot('__screenshots__/boot-empty-shell.png', {
    fullPage: true,
    mask: maskTargets(page),
    ...SNAPSHOT_OPTS
  });

  noErrors();
});

test('Library panel screenshot shows the bundled starters and Bol Processor showcase', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await waitForShell(page);

  // Open Library via the activity bar button (same selector used by
  // library.spec.ts — the `title=Library` attribute on the <button>).
  await page.locator('button[title="Factory"]').click();

  // Wait for the bundled starter cards plus the Bol Processor showcase cards to
  // render. Names come from STARTERS in starters.ts. Asserting visibility forces
  // the panel layout to settle before the screenshot.
  const starterNames = [
    '01 — Strudel solo',
    '02 — Strudel + Hydra',
    '03 — Sequenced sections',
    'BP — Rotate scales',
    'BP — NotReich',
    'BP — Acceleration',
    'BP — Transposition',
    'BP — Ames',
    'BP — Visser5'
  ];
  for (const name of starterNames) {
    await expect(
      page.locator('.card', { has: page.getByText(name, { exact: true }) }).first()
    ).toBeVisible({ timeout: 5_000 });
  }
  await freezeAnimations(page);

  await expect(page).toHaveScreenshot('__screenshots__/library-panel-starters.png', {
    fullPage: true,
    mask: maskTargets(page),
    ...SNAPSHOT_OPTS
  });

  noErrors();
});

test('starter 01 (Strudel solo) loaded and evaluated', async ({ page }) => {
  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const session = readFileSync(join(BUNDLED, '01-strudel-solo.bps'), 'utf8');

  await page.goto('');
  await waitForShell(page);

  await loadStarter(
    page,
    [{ path: '01-strudel-solo.bps', contents: session }],
    '01-strudel-solo.bps',
    '01-strudel-solo.bps'
  );

  // A `.bps` is one runnable block; Ctrl+Enter evaluates the whole session and
  // places the inlined Strudel backtick voice in time.
  await evalBlockAt(page, 5);
  // Let Strudel's scheduler render at least one cycle so any post-eval UI
  // (active actor LED, runtimes count) reaches its steady state.
  await page.waitForTimeout(1200);
  await freezeAnimations(page);

  await expect(page).toHaveScreenshot('__screenshots__/starter-01-strudel-solo.png', {
    fullPage: true,
    mask: maskTargets(page),
    ...SNAPSHOT_OPTS
  });

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

test('starter 02 (Strudel + Hydra) loaded and evaluated', async ({ page }) => {
  // This test combines the two slowest cold-boot paths in the project (Strudel
  // core import + Hydra/regl WebGL context). On the user's WSL2 machine the
  // default 30s test timeout is regularly exceeded — observed failure modes:
  //   1. Stuck at boot, transport still at 001.01.00 (Strudel import never
  //      finished within 30s).
  //   2. Hydra eval completed (bar.beat at 004.03, runtimes=2, "Playing"),
  //      but readCanvasLitPixels + screenshot stability check pushed past 30s.
  // Bump per-test budget to 90s so both cold paths can settle without the
  // screenshot/lit-pixels gates racing against the global timeout.
  test.setTimeout(90_000);

  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const session = readFileSync(join(BUNDLED, '02-strudel-hydra.bps'), 'utf8');

  await page.goto('');
  await waitForShell(page);

  await loadStarter(
    page,
    [{ path: '02-strudel-hydra.bps', contents: session }],
    '02-strudel-hydra.bps',
    '02-strudel-hydra.bps'
  );

  // One `.bps` block: evaluating the whole session places BOTH backtick voices
  // in time — the Strudel voice → audio, the Hydra voice → video.
  await evalBlockAt(page, 5);

  // Hydra needs a few rAF frames before the back-buffer holds non-zero pixels.
  // Use readCanvasLitPixels as a gate so the screenshot lands on a frame with
  // actual content drawn (otherwise we'd snapshot the initial black canvas).
  // Poll up to ~6s instead of a fixed 900ms — on cold WSL2 the regl context
  // and first shader compile can take longer than a single 900ms window.
  await page.waitForTimeout(900);
  let lit = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    lit = await readCanvasLitPixels(page, 'canvas.hydra');
    if (lit > 100) break;
    await page.waitForTimeout(500);
  }
  expect(lit).toBeGreaterThan(100);

  // Hydra's render loop runs via regl's internal scheduler — stubbing
  // window.requestAnimationFrame is not enough to stop it. Hush after the
  // lit-pixels gate (which proves Hydra rendered) freezes the canvas and
  // halts all transport-driven LED animations in one shot.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  await freezeAnimations(page);

  // Hide the live Hydra GL canvas before the screenshot. `canvas.hydra` is a
  // FULLSCREEN overlay (`position:fixed; inset:0; 100vw×100vh; z-index:9999;
  // opacity:0.85`), so every page pixel is tinted by the moving GL pattern —
  // ~66% of the frame differs run-to-run depending on which rAF tick the freeze
  // landed on. Masking its bounding box would blank the whole page (it covers
  // everything), defeating the snapshot. Instead we drop the overlay so the UI
  // chrome underneath (panels, layout, Structure tab) is captured deterministically
  // — which is the snapshot's actual job. Hydra is already PROVEN to have rendered
  // by the `readCanvasLitPixels(...) > 100` gate above; we don't need its pixels in
  // the image. `maxDiffPixels` stays at 600 so the chrome comparison stays strict.
  await page.evaluate(() => {
    document.querySelectorAll('canvas.hydra').forEach((c) => {
      (c as HTMLElement).style.display = 'none';
    });
  });

  // Override the per-call expect timeout (default 5s in playwright.config.ts).
  // toHaveScreenshot runs an internal stability loop — takes two consecutive
  // shots and only resolves once they match. With fullPage:true on a slow
  // WSL2 host, the first capture alone can take 2-3s, so the default 5s
  // ceiling left no margin for the second capture + comparison. 30s is
  // generous enough that the stability check always converges.
  await expect(page).toHaveScreenshot('__screenshots__/starter-02-strudel-hydra.png', {
    fullPage: true,
    mask: maskTargets(page),
    timeout: 30_000,
    ...SNAPSHOT_OPTS
  });

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});

test('starter 03 (sequenced sections) loaded and evaluated', async ({ page }) => {
  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const session = readFileSync(join(BUNDLED, '03-scenes-A-B.bps'), 'utf8');

  await page.goto('');
  await waitForShell(page);

  await loadStarter(
    page,
    [{ path: '03-scenes-A-B.bps', contents: session }],
    '03-scenes-A-B.bps',
    '03-scenes-A-B.bps'
  );

  // A `.bps` is one runnable block; Ctrl+Enter evaluates the whole sequence —
  // both sections (calm = drums, then full = drums + lead) are derived and
  // placed in time via their inlined Strudel backtick voices.
  await evalBlockAt(page, 8);
  await page.waitForTimeout(1200);
  await freezeAnimations(page);

  await expect(page).toHaveScreenshot('__screenshots__/starter-03-scenes-A-B.png', {
    fullPage: true,
    mask: maskTargets(page),
    ...SNAPSHOT_OPTS
  });

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
