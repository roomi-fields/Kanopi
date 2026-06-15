import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Lot 4 — a multi-voice BPScript orchestrator (.bps) plays its voices through
// the dispatcher's per-actor routing: a melody actor → MIDI, a bass actor →
// WebAudio. Without MIDI hardware the bass still sounds, so audio proves the
// orchestration wired up (actorTable → setActors → per-actor transport).
test('a BPScript orchestrator plays its WebAudio voice', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // library load confirm
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.ab-btn[title="Library"]').click();
  await page.locator('.cat', { hasText: 'Orchestrator' }).click();
  await page.locator('.search').fill('dual actors');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('.card .load').click();

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);

  // The bass actor (transport:webaudio) sounds regardless of MIDI hardware.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
