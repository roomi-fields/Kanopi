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

  await page.locator('.ab-btn[title="Factory"]').click();
  // Category label (English, all-English UI rule): « Orchestrator ».
  await page.locator('.cat', { hasText: 'Orchestrator' }).click();
  // The all-audio orchestrator demo `dual-actors-audio` is displayed « Twin synth
  // voices — all audio » (renamed in the restructure). Target it by NAME.
  await page.locator('.search').fill('twin');
  const orchCard = page.locator('.card', { hasText: 'Twin synth voices' });
  await expect(orchCard).toBeVisible();
  await orchCard.locator('.load').click();

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);

  // The bass actor (transport.audio) sounds regardless of MIDI hardware.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
