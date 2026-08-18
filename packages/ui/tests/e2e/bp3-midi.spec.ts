import { test, expect } from '@playwright/test';
import { evalBlockAt, expectNoConsoleErrors, setupFakeMidi } from '../helpers';

// MIDI vertical slice — EXPLICIT routing only. MIDI is never auto-selected off a
// granted Web MIDI port (that used to make every `.gr` silent on a machine that
// merely HAS a MIDI port). A voice reaches MIDI ONLY when it declares
// `out.midi`; the SAME raw BPx timed tokens that drive WebAudio are then
// routed — through the canonical runtime-MIDI `MidiTransport` (no Kanopi/core MIDI
// copy) — to the Web MIDI output port.
//
// Chain:
//   .bps (actor … out.midi) → derive() → per-actor Kronos events
//        → runtime-midi MidiTransport.send() → output.send([0x90|ch, note, vel], ts)
//
// ⚠️ INSTABLE CONNU, APPARU LE 2026-07-28 — et sa FORME dit où il ne faut PAS chercher.
// Ce jour-là, le premier passage du portillon après l'élargissement de l'union du bus l'a vu
// rougir pour la première fois. Comme il touche le MIDI, c'est-à-dire la zone que ce changement
// venait de traverser, il a été rejoué SEUL, machine au calme, deux invocations à froid de cinq
// répétitions chacune, sans réessai : 20 sur 20 verts. Il ne rougit donc pas en isolement.
// CE QUI L'AVAIT FAIT ROUGIR, lu dans la sortie du gate : `.cm-content` invisible au bout de 5 s —
// l'ÉDITEUR n'était pas monté à temps. Ce n'est pas un défaut de routage MIDI : rien n'avait encore
// été joué. C'est un démarrage lent sous la charge du gate, la même famille que l'autre instable
// connu (le hush après vidange). Si ce test rougit à nouveau, regarder le TEMPS DE MONTAGE de la
// page avant de soupçonner le MIDI — et se souvenir qu'un vert obtenu au deuxième essai n'est pas
// un vert, c'est un vert et une question.
//
// The scene derives C4 D4 E4 G4 C5 G4 E4 C4 → MIDI notes 60 62 64 67 72.
const EXPECTED_NOTES = [60, 62, 64, 67, 72];

// One western actor routed EXPLICITLY to MIDI. Each terminal is actor-qualified so
// every event carries `payload.actor: 'melody'`, which the per-actor router sends to
// the MIDI transport.
const MIDI_SCENE = `core
actor melody  alphabet.western  out.midi

-----
S -> melody.C4 melody.D4 melody.E4 melody.G4 melody.C5 melody.G4 melody.E4 melody.C4
`;

test('an EXPLICIT out.midi actor routes BPx tokens to runtime-midi (NoteOn bytes)', async ({
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
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
          };
        };
      };
      w.__kanopi.workspace.openBundle(
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

  // Fail-loud gate (contract §3, 2bcbdc9): a `:midi` scene without an EXPLICITLY
  // selected device is blocked at eval (`status().ready===false`, reason
  // 'no-selection') even though our fake Web MIDI access has a port. Select the
  // fake device via the real Hardware panel UI before evaluating — the same path
  // Romain uses.
  await page.click('.ab-btn[title="Hardware"]');
  const outSection = page.locator('.hw section').filter({ hasText: 'MIDI Output' });
  await outSection.locator('button').click();
  await outSection.locator('select.port-select').selectOption({ label: 'Kanopi Fake MIDI Out' });

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

// Per-actor MIDI channel AND inline per-note override travel to the bytes. `lead` declares
// `out.midi(ch:1)`, `bass` declares `ch:2`, and the note `lead.E4(ch:5)` carries an inline
// channel override. From ONE scene: three distinct channels reach the wire. Proves the migrated
// MIDI runtime (runtime-midi, Phase 2 frontière hôte↔runtimes) resolves the channel from the
// graven output layer (`output.channel`) — the HOST reshapes nothing (its midi wrapper + vel/127
// + channel resolution are gone). Assertions are convention-independent (0- vs 1-based wire
// channel): only the DIFFERENCES matter — ch:2 sits 1 above ch:1, ch:5 sits 4 above ch:1.
//
// The override note is PREFIXED (`lead.E4`), not nude — required with two western actors (décision
// Romain 2026-07-03, note-nue-ch-implique-sortie-midi.md): a nude note's actor is ambiguous, so its
// output isn't graven and it drops from MIDI; the prefix names the actor and Kairos graves ch:5.
const TWO_CHANNEL_SCENE = `core
tempo:120
actor lead  alphabet.western  out.midi(ch:1)
actor bass  alphabet.western  out.midi(ch:2)

-----
S -> Lead Low

Lead -> lead.C4 lead.E4(ch:5) lead.G4 lead.C4
Low  -> bass.C2 bass.G2 bass.C2 bass.E2
`;

test('per-actor channel + inline (ch:5) override travel to the MIDI bytes', async ({ page }) => {
  await setupFakeMidi(page);
  const noErrors = expectNoConsoleErrors(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

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
    w.__kanopi.workspace.openBundle([{ path: 'midi-two-ch.bps', contents }], 'midi-two-ch.bps');
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

  // Fail-loud gate (contract §3, 2bcbdc9): select the fake device before eval.
  await page.click('.ab-btn[title="Hardware"]');
  const outSection = page.locator('.hw section').filter({ hasText: 'MIDI Output' });
  await outSection.locator('button').click();
  await outSection.locator('select.port-select').selectOption({ label: 'Kanopi Fake MIDI Out' });

  await evalBlockAt(page, 1);

  // Wait until the three discriminating notes are captured: lead C4 (60), the E4 override
  // (64), and bass C2 (36).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __kanopiMidiBytes?: number[][] };
      const notes = (w.__kanopiMidiBytes ?? [])
        .filter((m) => (m[0] & 0xf0) === 0x90 && m[2] > 0)
        .map((m) => m[1]);
      return notes.includes(60) && notes.includes(64) && notes.includes(36);
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
    // Proof: the exact status/note bytes captured for the two-channel + override scene.
    console.log('captured channel NoteOn bytes:', JSON.stringify(noteOns));
    return { lead: chanOf(60), override: chanOf(64), bass: chanOf(36) };
  });

  // Everything travels through the migrated runtime, each a valid channel (not -1):
  expect(chan.lead).toBeGreaterThanOrEqual(0);
  // Per-actor address: bass is exactly 1 channel above lead (ch:2 vs ch:1).
  expect(chan.bass - chan.lead).toBe(1);
  // Inline per-note override: lead.E4 jumps 4 channels above lead's declared channel (ch:5 vs ch:1).
  expect(chan.override - chan.lead).toBe(4);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
