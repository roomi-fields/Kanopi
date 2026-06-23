import { test, expect } from '@playwright/test';
import { evalBlockAt, expectNoConsoleErrors, setupFakeMidi } from '../helpers';

// MIDI vertical slice — EXPLICIT routing only. MIDI is never auto-selected off a
// granted Web MIDI port (that used to make every `.gr` silent on a machine that
// merely HAS a MIDI port). A voice reaches MIDI ONLY when it declares
// `transport:midi`; the SAME raw BPx timed tokens that drive WebAudio are then
// routed — through the canonical runtime-MIDI `MidiTransport` (no Kanopi/core MIDI
// copy) — to the Web MIDI output port.
//
// Chain:
//   .bps (@actor … transport:midi) → derive() → per-actor Kronos events
//        → runtime-midi MidiTransport.send() → output.send([0x90|ch, note, vel], ts)
//
// The scene derives C4 D4 E4 G4 C5 G4 E4 C4 → MIDI notes 60 62 64 67 72.
const EXPECTED_NOTES = [60, 62, 64, 67, 72];

// One western actor routed EXPLICITLY to MIDI. Each terminal is actor-qualified so
// every event carries `payload.actor: 'melody'`, which the per-actor router sends to
// the MIDI transport.
const MIDI_SCENE = `@core
@actor melody  alphabet:western  transport:midi

S -> melody.C4 melody.D4 melody.E4 melody.G4 melody.C5 melody.G4 melody.E4 melody.C4
`;

test('an EXPLICIT transport:midi actor routes BPx tokens to runtime-midi (NoteOn bytes)', async ({
  page
}) => {
  const midi = await setupFakeMidi(page);
  const noErrors = expectNoConsoleErrors(page);

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
      w.__kanopi.workspace.loadFiles([{ path: 'midi-explicit.bps', contents }], 'midi-explicit.bps');
    },
    { contents: MIDI_SCENE }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'midi-explicit.bps');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'midi-explicit.bps');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Ctrl+Enter evaluates the whole scene; the eval is the user gesture that
  // unlocks requestMIDIAccess (our fake) and the AudioContext clock.
  await evalBlockAt(page, 1);

  // Kronos schedules the 8 notes across ~6s; the driver lookahead calls
  // output.send() as it advances. Poll the captured bytes until all expected
  // NoteOn note numbers have shown up (or time out).
  await page.waitForFunction(
    (expected: number[]) => {
      const w = window as unknown as { __kanopiMidiBytes?: number[][] };
      const bytes = w.__kanopiMidiBytes ?? [];
      const noteOns = bytes.filter((m) => (m[0] & 0xf0) === 0x90 && m[2] > 0).map((m) => m[1]);
      return expected.every((n) => noteOns.includes(n));
    },
    EXPECTED_NOTES,
    { timeout: 10_000 }
  );

  const sent = await midi.getSent();
  // NoteOn = status nibble 0x90 with a non-zero velocity; data byte 1 is the note.
  const noteOns = sent.filter((m) => (m[0] & 0xf0) === 0x90 && m[2] > 0);
  const noteNumbers = noteOns.map((m) => m[1]);

  // Proof: the exact MIDI bytes captured for the explicit-MIDI scene.
  console.log('captured MIDI NoteOn messages:', JSON.stringify(noteOns));
  console.log('captured NoteOn note numbers:', JSON.stringify(noteNumbers));

  expect(noteOns.length).toBeGreaterThanOrEqual(EXPECTED_NOTES.length);
  for (const n of EXPECTED_NOTES) {
    expect(noteNumbers).toContain(n);
  }

  // Hush (Ctrl+.) — defensive; a MIDI-only scene makes no local audio.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
