import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// The produced-structure view is the ported polymetric piano-roll
// (BPscript/public/timeline.js, vendored). It renders the BPx timed tokens as
// colored note blocks on voice tracks; STEP drives its playback cursor.

// Count BRIGHT/coloured pixels on the timeline canvas — the note blocks. The
// threshold (channel sum > 120) excludes BOTH the dark background (#08090d,
// sum 30) AND a cleared/black canvas (sum 0), so a black panel reads as 0 lit
// (an earlier resize-without-render bug left the canvas pure black — this guards
// against its return).
async function timelineLitPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('.timeline-panel canvas') as HTMLCanvasElement | null;
    if (!c) return -1;
    const ctx = c.getContext('2d');
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
    }
    return lit;
  });
}

async function loadAndOpen(page: Page, path: string, contents: string): Promise<void> {
  await page.evaluate(
    ({ p, c }) => {
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
      w.__kanopi.workspace.loadFiles([{ path: p, contents: c }], p);
      const t = w.__kanopi.workspace.files.find((f) => f.path === p);
      if (t) {
        w.__kanopi.workspace.openFile(t.id);
        w.__kanopi.workspace.setActive(t.id);
      }
    },
    { p: path, c: contents }
  );
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

// `melody.gr` derives 8 bare notes over 8 beats — no head-rule sections (notes
// are control terminals, filtered out). STEP is driven by the produced BEAT
// grid (duration / one beat), so it enables here, and the piano-roll renders
// the production. Verifies the gate + that the timeline canvas draws content.
test('STEP gate enables on a multi-beat grammar and the piano-roll renders it', async ({
  page
}) => {
  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const grammar = readFileSync(join(fixturesDir, 'melody.gr'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndOpen(page, 'melody.gr', grammar);

  await evalBlockAt(page, 1);

  // GATE: a multi-beat production enables STEP even with no head-rule sections.
  const stepBtn = page.locator('.step-btn');
  await expect(stepBtn).toBeVisible({ timeout: 5_000 });

  // The piano-roll canvas drew the production (note blocks on a voice track).
  await expect(page.locator('.timeline-panel canvas')).toBeVisible();
  await expect.poll(() => timelineLitPixels(page), { timeout: 5_000 }).toBeGreaterThan(2000);

  // STEP advances the playback cursor without error (cursor is drawn on canvas).
  await stepBtn.click();
  await page.waitForTimeout(120);
  await stepBtn.click();
  await page.waitForTimeout(120);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});

// Polymetric `{ a, b, c }` derives overlapping voices (3 vs 4 vs 5). The
// timeline assigns them to separate voice tracks by timing overlap, so the
// canvas shows substantially more content than a single monophonic line.
test('polymetric simultaneous group renders multiple voice tracks', async ({ page }) => {
  await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const poly = `@mm:90\nS -> { C4 C4 C4, E4 E4 E4 E4, G4 G4 G4 G4 G4 }`;

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await loadAndOpen(page, 'poly.bps', poly);

  await evalBlockAt(page, 2);

  await expect(page.locator('.timeline-panel canvas')).toBeVisible();
  // Three stacked voice tracks of blocks → a lot of lit pixels.
  await expect.poll(() => timelineLitPixels(page), { timeout: 5_000 }).toBeGreaterThan(10_000);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
