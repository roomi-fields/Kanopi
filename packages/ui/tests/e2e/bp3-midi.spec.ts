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
      w.__kanopi.workspace.loadFiles(
        [{ path: 'midi-explicit.bps', contents }],
        'midi-explicit.bps'
      );
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

// Per-actor MIDI channel travels to the bytes. `lead` declares `transport.midi(ch:1)`,
// `bass` declares `ch:2` — two actors, two channels, from ONE scene. Proves the migrated MIDI
// runtime (runtime-midi, Phase 2 frontière hôte↔runtimes) resolves the channel from the graven
// output layer (`output.channel`) — the HOST reshapes nothing (its midi wrapper + vel/127 +
// channel resolution are gone). Assertion is convention-independent (0- vs 1-based wire
// channel): only the DIFFERENCE matters — ch:2 sits exactly 1 above ch:1.
//
// NOTE: the inline NUDE-note override `E4(ch:5)` (library scene midi-channel-override.bps) is
// NOT asserted here — that note is dropped from the MIDI output (its output layer isn't graven
// as `midi`), an UPSTREAM attribution issue (Kairos/BPx), independent of this host migration
// (routed to the architect). The per-actor address below is exactly what the host change owns.
const TWO_CHANNEL_SCENE = `@core
@tempo:120
@actor lead  alphabet.western  transport.midi(ch:1)
@actor bass  alphabet.western  transport.midi(ch:2)

S -> Lead Low

Lead -> lead.C4 lead.E4 lead.G4 lead.C4
Low  -> bass.C2 bass.G2 bass.C2 bass.E2
`;

test('per-actor MIDI channel travels to the bytes (bass is 1 channel above lead)', async ({
  page
}) => {
  await setupFakeMidi(page);
  const noErrors = expectNoConsoleErrors(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate((contents) => {
    const w = window as unknown as {
      __kanopi: {
        workspace: { loadFiles: (f: { path: string; contents: string }[], focus?: string) => void };
      };
    };
    w.__kanopi.workspace.loadFiles([{ path: 'midi-two-ch.bps', contents }], 'midi-two-ch.bps');
  }, TWO_CHANNEL_SCENE);
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { workspace: { files: { path: string }[] } } };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'midi-two-ch.bps');
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
    const t = w.__kanopi.workspace.files.find((f) => f.path === 'midi-two-ch.bps');
    if (t) {
      w.__kanopi.workspace.openFile(t.id);
      w.__kanopi.workspace.setActive(t.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  await evalBlockAt(page, 1);

  // Wait until both discriminating notes are captured: lead C4 (60), bass C2 (36).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __kanopiMidiBytes?: number[][] };
      const notes = (w.__kanopiMidiBytes ?? [])
        .filter((m) => (m[0] & 0xf0) === 0x90 && m[2] > 0)
        .map((m) => m[1]);
      return notes.includes(60) && notes.includes(36);
    },
    undefined,
    { timeout: 15_000 }
  );

  const chan = await page.evaluate(() => {
    const w = window as unknown as { __kanopiMidiBytes?: number[][] };
    const noteOns = (w.__kanopiMidiBytes ?? []).filter((m) => (m[0] & 0xf0) === 0x90 && m[2] > 0);
    const chanOf = (note: number) => {
      const m = noteOns.find((x) => x[1] === note);
      return m ? m[0] & 0x0f : -1;
    };
    // Proof: the exact status/note bytes captured for the two-channel scene.
    console.log('captured two-channel NoteOn bytes:', JSON.stringify(noteOns));
    return { lead: chanOf(60), bass: chanOf(36) };
  });

  // Per-actor address travels through the migrated runtime: bass is exactly 1 channel
  // above lead (ch:2 vs ch:1), and each is a valid channel (not the -1 sentinel).
  expect(chan.lead).toBeGreaterThanOrEqual(0);
  expect(chan.bass - chan.lead).toBe(1);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
