import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { createEventBus } from '../events/bus';
import { initAdapters } from './registry';
import {
  bpscriptAdapter,
  setActorsSink,
  isOrchestratedActor,
  setOrchestratedActorMuted,
  btTokenByActor,
  type PublishedActor
} from './bpx-adapter';
import * as registry from './registry';
import { createCodeVoiceAdapters } from 'runtime-codevoices';
import type { RuntimeAdapter } from './adapter';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS — comme le cœur le fait en vrai. Ce banc lit des
// adaptateurs AVANT de construire son cœur, il les initialise donc lui-même. C'est le cri
// fail-loud du registre qui l'a révélé ; l'affaiblir pour faire passer le banc aurait rendu au
// produit un « aucune voix reconnue » silencieux.
const bus = createEventBus();
beforeAll(() => initAdapters(bus));

// ⛔ DEUX OBJETS, DEUX SUJETS — depuis la couture du 2026-08-22 (`registry.ts`, `porteVersLaVoix`).
//   • `registry.getAdapter('strudel')` = LA PORTE DE L'HÔTE. Seul l'hôte y passe.
//   • `voixNue('strudel')` = l'instance que le paquet garde et que le RUNTIME appelle
//     (`runtime-codevoices/src/adapters.ts`, `createCodeVoiceAdapters` rend son tableau interne ; `code-voices-runtime.ts:743`
//     l'appelle sur une sourdine).
// Espionner l'une ou l'autre ne mesure donc pas la même chose, et c'est tout l'intérêt : avant la
// couture il n'y avait qu'un seul objet et les deux appelants étaient indiscernables.
const voixNue = (id: string): RuntimeAdapter =>
  createCodeVoiceAdapters(bus).find((a) => a.id === id)! as unknown as RuntimeAdapter;

// Minimal WebAudio + node stubs so the orchestrator eval can build its dispatcher.
class FakeGain {
  gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelScheduledValues() {}
  };
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = { value: 0, setValueAtTime() {} };
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
beforeEach(() => {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      return new FakeOsc();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
});

const SRC = `core
actor groove  eval.strudel
actor viz  eval.hydra
-----
S -> { groove_r, viz_r }
groove_r -> groove.\`stack(note("c2*4"))\`
viz_r -> viz.\`osc(60).out()\`
`;

// Copie À LA MAIN de l'orchestrateur embarqué
// (packages/library/scenes/code-voices/02-strudel-hydra.bps), gardée inline pour
// exercer la mapping sur la VRAIE forme de règle — backticks multilignes et
// commentaires — plutôt que sur une fixture simplifiée.
//
// ⛔ ELLE DÉRIVE DE SA SOURCE, ET RIEN NE LE SIGNALE TANT QUE LA COPIE COMPILE. Le
// 2026-09-02 la scène a gagné sa ligne `core` et cette copie ne l'avait pas : le banc
// a rougi pour la bonne raison, mais un écart qui ne casse PAS la compilation passerait
// muet. Le chemin cité ci-dessus est le seul état qui fasse foi.
const BUNDLED = `// 02 — Strudel + Hydra synchronisés sur le transport Kanopi.
core
actor groove  eval.strudel
actor viz  eval.hydra

-----
S -> { groove_r, viz_r }

groove_r -> groove.\`stack(
  note("c2*4").s("sawtooth").gain(0.5),
  note("c5*8").s("square").gain(0.2)
)\`

viz_r -> viz.\`osc(60, 0.1, () => 0.5 + 0.5 * Math.sin(beat * Math.PI))
  .rotate(() => bar * 0.05)
  .out()\`
`;

describe('btTokenByActor (actor → backtick token)', () => {
  it('maps every code-voice actor of the bundled orchestrator to its BT token', () => {
    const ast = sceneQuiPasse(BUNDLED);
    const map = btTokenByActor(ast);
    // Both actors map to a (distinct) backtick token; the slot routing + the
    // sink's mute guard depend on this being non-empty (the regression: an empty
    // map collapsed groove + viz into the whole-file slot).
    expect(Object.keys(map).sort()).toEqual(['groove', 'viz']);
    expect(map.groove).toMatch(/^BT/);
    expect(map.viz).toMatch(/^BT/);
    expect(map.groove).not.toBe(map.viz);
  });
});

describe('orchestrator actor publication', () => {
  it('publishes groove + viz to the Actors sink', async () => {
    let published: PublishedActor[] = [];
    setActorsSink((a) => {
      published = a;
    });
    await bpscriptAdapter.evaluate(SRC, { actorId: 'x.bps', fileId: 'x.bps' }, () => {});
    expect(published.map((p) => p.name).sort()).toEqual(['groove', 'viz']);
    expect(isOrchestratedActor('groove')).toBe(true);
    expect(isOrchestratedActor('viz')).toBe(true);
    // runtime mapped from eval tag
    const byName = Object.fromEntries(published.map((p) => [p.name, p.runtime]));
    expect(byName.groove).toBe('strudel');
    expect(byName.viz).toBe('hydra');
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'x.bps' }, () => {});
  });
});

// Verbatim copy of the bundled demo (packages/library/bundled/demos/midi-actors.bps):
// one actor on MIDI, one on WebAudio. In vitest/jsdom there is no
// `navigator.requestMIDIAccess`, so `createMidiRuntime(...).init()` resolves to
// `ready:false, reason:'no-webmidi'` for real — the actual "MIDI unavailable"
// condition, no mocking of runtime-midi needed.
const MIDI_PLUS_WEBAUDIO = `core

actor melody  alphabet.western  out.midi(ch:1)
actor bass    alphabet.western  out.audio

-----
S -> {Mel, Low}

Mel -> melody.C4 melody.E4 melody.G4 melody.C5 melody.B4 melody.G4 melody.E4 melody.C4
Low -> bass.C2(wave:sawtooth, vel:80) - bass.G2 - bass.C2 - bass.E2 -
`;

describe('orchestrator MIDI gate scope (one actor MIDI-unavailable must not silence the whole scene)', () => {
  it('publishes + plays the audio actor even when the MIDI actor has no device', async () => {
    let published: PublishedActor[] = [];
    setActorsSink((a) => {
      published = a;
    });
    const logs: Array<{ runtime: string; level: string; msg: string }> = [];

    // Must NOT throw/reject: melody's MIDI gate failing is a per-actor cry, not a
    // scene-wide derive error (the bug: it used to abort evaluate() before
    // startKronosAudio + actor publication ran at all).
    await expect(
      bpscriptAdapter.evaluate(
        MIDI_PLUS_WEBAUDIO,
        { actorId: 'midi-actors.bps', fileId: 'midi-actors.bps' },
        (e) => logs.push(e)
      )
    ).resolves.not.toThrow();

    // Both actors published — bass (audio) is NOT collateral damage of melody's
    // (midi) missing hardware.
    expect(published.map((p) => p.name).sort()).toEqual(['bass', 'melody']);

    // outputTransport reflects the DECLARED transport per actor (BPx's
    // `tree.metadata.actors[name].runtime`, decision [624]) — the field the mixer
    // gates its slider on: melody (out.midi) must read 'midi', bass
    // (out.audio) must read 'audio' so its slider stays live.
    const transportByName = Object.fromEntries(published.map((p) => [p.name, p.outputTransport]));
    expect(transportByName.melody).toBe('midi');
    expect(transportByName.bass).toBe('audio');

    // The cry still happens, scoped to the MIDI actor, with the established
    // no-webmidi actionable text (contract kanopi-runtime-midi.md §3, [619]).
    const midiCry = logs.find(
      (l) => l.level === 'error' && l.msg.includes('melody') && l.msg.includes('Web MIDI')
    );
    expect(midiCry).toBeDefined();

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'midi-actors.bps' }, () => {});
  });
});

describe('orchestrator arm/disarm', () => {
  // (Ce banc a porté du 2026-08-10 au 2026-08-10 une attente INVERSÉE, avec six mesures et le
  // constat qu'aucune bisection de l'hôte ne pouvait le dater. Il a RÉCLAMÉ SON RETRAIT le jour
  // même : les deux causes réelles étaient la quatrième sortie jamais abonnée et trois
  // scènes-sondes qui n'analysaient plus. Rien de ce qui avait été supposé n'était juste.)
  it('each code voice fires into its OWN per-actor slot (file::actor)', async () => {
    setActorsSink(() => {});
    // LE SUJET EST LE TIR DU RUNTIME, pas un geste de l'hôte : l'espion se pose donc sur l'instance
    // NUE. Pose-le sur la porte et ce banc rend une liste VIDE — mesuré le 2026-08-22, et c'est la
    // preuve directe que ces tirs viennent bien du runtime.
    const strudel = voixNue('strudel');
    const evalSlots: string[] = [];
    const evalSpy = vi
      .spyOn(strudel, 'evaluate')
      .mockImplementation(async (_code: string, s: { actorId?: string }) => {
        if (s.actorId) evalSlots.push(s.actorId);
      });

    await bpscriptAdapter.evaluate(BUNDLED, { actorId: 'z.bps', fileId: 'z.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 30));

    // The strudel (groove) voice must land in the per-actor slot, NOT the whole
    // file — otherwise disarm can't isolate it (the fixed regression).
    expect(evalSlots).toContain('z.bps::groove');
    expect(evalSlots).not.toContain('z.bps');

    evalSpy.mockRestore();
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'z.bps' }, () => {});
  });

  it('l’HÔTE n’appelle jamais l’adaptateur de voix de code sur un mute — il porte l’intention à Kronos, et c’est le RUNTIME qui exécute ([673], [76]/[77])', async () => {
    setActorsSink(() => {});
    await bpscriptAdapter.evaluate(SRC, { actorId: 'y.bps', fileId: 'y.bps' }, () => {});

    const strudel = registry.getAdapter('strudel')!;
    const stopSpy = vi.spyOn(strudel, 'stop').mockResolvedValue(undefined);
    const evalSpy = vi.spyOn(strudel, 'evaluate').mockResolvedValue(undefined);

    // This is the exact deviation that was retired 2026-07-11: `armOrchestratedActor`/
    // `disarmOrchestratedActor` used to call `evaluate`/`stop` on the runtime directly.
    // Kronos + runtime-codevoices' own ACTIVE `setActorMuted` now own firing/stopping —
    // the host must never touch the adapter for a mute toggle, running or not.
    //
    // ⛔ CE QUE CE BANC ÉNONÇAIT ÉTAIT FAUX, ET SON TITRE L'ENSEIGNAIT AVANT SON CORPS. Il disait
    // « mute/unmute n'appellent JAMAIS l'adaptateur directement ». La règle réelle est autre :
    // l'HÔTE ne l'appelle jamais — le RUNTIME, lui, DOIT l'appeler, c'est son rôle. La sourdine
    // EXÉCUTE chez runtime-codevoices (`code-voices-runtime.ts:743`, arbitrage [76]/[77]) :
    // `muteActorSlot` appelle `adapter.stop({ actorId: '<fichier>::<acteur>', fileId: '<fichier>' })`
    // et `unmuteActorSlot` appelle `adapter.evaluate`. L'ancien énoncé interdisait donc ce que
    // l'architecture PRESCRIT (arbitrage de l'architecte, 2026-08-22).
    //
    // L'ESPION EST SUR LA PORTE DE L'HÔTE, ET C'EST CE QUI REND L'ASSERTION EXACTE. Jusqu'au
    // 2026-08-22 il était posé sur l'objet que l'hôte et le runtime PARTAGEAIENT, et les deux
    // appels y étaient indiscernables : même forme d'argument — l'hôte la construit en
    // `bpx-adapter.ts` (`stopCode`), le runtime en `code-voices-runtime.ts` — et même asynchronie,
    // le chemin de l'hôte passant par un `import()` dynamique. Ni l'argument ni le moment ne les
    // séparaient : ce filet attrapait l'exécution LÉGITIME du runtime dès qu'un jeton avait tiré,
    // donc au gré de la charge (rouge une fois en campagne, non reproduit en dix passages).
    // Le discriminant est désormais STRUCTUREL : `registry.getAdapter` rend une PORTE que seul
    // l'hôte traverse (`registry.ts`, `porteVersLaVoix`), et le runtime appelle l'instance nue.
    //
    // ⛔ NE PAS « RÉPARER » CE BANC EN RÉTRÉCISSANT SA FENÊTRE. Mesuré : recentrer l'assertion sur
    // un contrôle SYNCHRONE le rend VERT sous la dérivation de 2026-07-11 réinjectée — le garde
    // devient un décor. Le chemin de l'hôte est asynchrone lui aussi. Toute retouche ici se prouve
    // par cette injection : remettre `stopCode` dans `setOrchestratedActorMuted` doit faire ROUGIR.
    setOrchestratedActorMuted('groove', true);
    await new Promise((r) => setTimeout(r, 10));
    setOrchestratedActorMuted('groove', false);
    await new Promise((r) => setTimeout(r, 10));
    expect(
      stopSpy,
      'un mute a coupé la voix par l’adaptateur — l’hôte a-t-il court-circuité Kronos ?'
    ).not.toHaveBeenCalled();
    expect(
      evalSpy,
      'un unmute a relancé la voix par l’adaptateur — l’hôte a-t-il court-circuité Kronos ?'
    ).not.toHaveBeenCalled();

    stopSpy.mockRestore();
    evalSpy.mockRestore();
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'y.bps' }, () => {});
  });

  it('unmute on a STOPPED transport (scene just opened, never played) does not fire sound (Romain 2026-07-11)', async () => {
    setActorsSink(() => {});
    // Opening a scene PRODUCES it (structure only, transport stays 'stopped') —
    // the exact state after a Library load, before any Play click.
    await bpscriptAdapter.evaluate(
      SRC,
      { actorId: 'w.bps', fileId: 'w.bps', produceOnly: true },
      () => {}
    );

    const strudel = registry.getAdapter('strudel')!;
    const evalSpy = vi.spyOn(strudel, 'evaluate').mockResolvedValue(undefined);

    // Toggling mute/unmute on the strip before ever pressing Play must NOT start the
    // code voice — with the unified mute channel this is now guaranteed by construction
    // (the host never calls `evaluate`), not by a transport-state guard.
    setOrchestratedActorMuted('groove', true);
    setOrchestratedActorMuted('groove', false);
    await new Promise((r) => setTimeout(r, 10));
    expect(evalSpy).not.toHaveBeenCalled();

    evalSpy.mockRestore();
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'w.bps' }, () => {});
  });
});
