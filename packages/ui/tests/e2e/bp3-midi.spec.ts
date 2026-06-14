import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors, setupFakeMidi } from '../helpers';

// MIDI vertical slice: the SAME raw BPx timed tokens that drive WebAudio are
// routed to runtime-midi's MidiSink, which emits MIDI bytes through the Web
// MIDI output port. Headless Chromium has no real MIDI hardware, so we inject a
// fake Web MIDI access whose output captures every byte array sent.
//
// Chain:
//   .gr → parseBP3 → createBPx → derive() → tokens
//        → MidiSink.load(tokens) → MidiSink.start() → MidiTransport.send()
//        → output.send([0x90|ch, note, vel], ts)
//
// melody.gr derives  C4 D4 E4 G4 C5 G4 E4 C4  → MIDI notes 60 62 64 67 72.
const EXPECTED_NOTES = [60, 62, 64, 67, 72];

// BLOCKED on upstream runtime-midi: its package entry pulls in
// `src/data/index.js`, which loads bundled JSON via Node `node:fs`
// (readFileSync) at module-init time. That module cannot load in a browser, so
// `import { MidiSink } from 'runtime-midi'` crashes the Kanopi app (blank page).
// MidiSink's constructor also depends on that loader (resolverConfig). No
// browser-safe path exists through the public API. Un-fixme once runtime-midi
// ships browser-loadable data (e.g. JSON `import` / a precomputed export).
test.fixme('bp3 grammar routes BPx tokens to runtime-midi (NoteOn bytes)', async ({ page }) => {
  const midi = await setupFakeMidi(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const grammar = readFileSync(join(fixturesDir, 'melody.gr'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi.workspace.loadFiles([{ path: 'melody.gr', contents }], 'melody.gr');
    },
    { contents: grammar }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'melody.gr');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'melody.gr');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Ctrl+Enter evaluates the whole grammar; the eval is the user gesture that
  // unlocks requestMIDIAccess (our fake) and the AudioContext clock.
  await evalBlockAt(page, 1);

  // The dispatcher schedules the 8 notes across ~4s; its lookahead clock calls
  // output.send() as it advances. Poll the captured bytes until all expected
  // NoteOn note numbers have shown up (or time out).
  await page.waitForFunction(
    (expected: number[]) => {
      const w = window as unknown as { __kanopiMidiBytes?: number[][] };
      const bytes = w.__kanopiMidiBytes ?? [];
      const noteOns = bytes.filter((m) => (m[0] & 0xf0) === 0x90).map((m) => m[1]);
      return expected.every((n) => noteOns.includes(n));
    },
    EXPECTED_NOTES,
    { timeout: 8_000 }
  );

  const sent = await midi.getSent();
  // NoteOn = status nibble 0x90; data byte 1 is the note number.
  const noteOns = sent.filter((m) => (m[0] & 0xf0) === 0x90);
  const noteNumbers = noteOns.map((m) => m[1]);

  // Proof: the exact MIDI bytes captured for melody.gr.
  console.log('captured MIDI NoteOn messages:', JSON.stringify(noteOns));
  console.log('captured NoteOn note numbers:', JSON.stringify(noteNumbers));

  expect(noteOns.length).toBeGreaterThanOrEqual(EXPECTED_NOTES.length);
  for (const n of EXPECTED_NOTES) {
    expect(noteNumbers).toContain(n);
  }

  // Hush (Ctrl+.) — the user is at the machine; never leave audio running.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
