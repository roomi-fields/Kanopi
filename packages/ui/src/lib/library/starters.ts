// Bundled starter sessions live in packages/library/bundled/ — single source
// of truth. We pull them in via Vite's `?raw` suffix so the contents are
// inlined at build time without ever duplicating them as string literals here.
// The relative path is: src/lib/library -> ../../../../library/bundled/.
// 01/02/03 are self-contained `.bps`: the code voices are inlined as backticks
// and routed by the new `@actor … transport.X eval.Y` syntax. No companion files.
import bundled01Session from '../../../../library/bundled/01-strudel-solo.bps?raw';
import bundled02Session from '../../../../library/bundled/02-strudel-hydra.bps?raw';
import bundled03Session from '../../../../library/bundled/03-scenes-A-B.bps?raw';
import bundled04Session from '../../../../library/bundled/04-scenes-select.bps?raw';
// Other-language starters, each migrated to a self-contained `.bps`: the code
// voice(s) are inlined as backticks, routed by `@actor … transport.X eval.Y`.
import tidalIntroSession from '../../../../library/bundled/tidal-intro.bps?raw';
import hydraAudioSession from '../../../../library/bundled/hydra-audio.bps?raw';
import mercuryIntroSession from '../../../../library/bundled/mercury-intro.bps?raw';
import csoundIntroSession from '../../../../library/bundled/csound-intro.bps?raw';
import jsWebaudioSession from '../../../../library/bundled/js-webaudio.bps?raw';
// Bol Processor showcase: authentic .gr grammars from Bernard Bel's BP3 corpus,
// derived by the next-gen BPx engine and played through Kanopi's WebAudio path.
import bpRotateScales from '../../../../library/bundled/bp-rotate-scales.gr?raw';
import bpNotReich from '../../../../library/bundled/bp-not-reich.gr?raw';
import bpAcceleration from '../../../../library/bundled/bp-acceleration.gr?raw';
import bpTransposition from '../../../../library/bundled/bp-transposition.gr?raw';
import bpAmes from '../../../../library/bundled/bp-ames.gr?raw';
import bpVisser5 from '../../../../library/bundled/bp-visser5.gr?raw';

export interface StarterFile {
  path: string;
  contents: string;
}

export interface Starter {
  id: string;
  name: string;
  tagline: string;
  description: string;
  sessionFile: string; // path of the session file to auto-open (.bps, .gr, …)
  files: StarterFile[];
}

export const STARTERS: Starter[] = [
  {
    id: 'bundled-01-strudel-solo',
    name: '01 — Strudel solo',
    tagline: 'single actor, zero regression vs strudel.cc',
    description:
      'One self-contained `.bps`: an actor whose Strudel code voice is inlined as a backtick and transported to audio. Put the cursor in the session and Ctrl+Enter to evaluate; Ctrl+. to hush.',
    sessionFile: '01-strudel-solo.bps',
    files: [{ path: '01-strudel-solo.bps', contents: bundled01Session }]
  },
  {
    id: 'bundled-02-strudel-hydra',
    name: '02 — Strudel + Hydra',
    tagline: 'audio + visuals synced on the shared clock',
    description:
      'One self-contained `.bps`: a Strudel actor (→ audio) and a Hydra actor (→ video), both inlined as backticks on the same transport. The Hydra patch reads `beat` and `bar` from the shared clock to pulse in time. Ctrl+Enter to evaluate; one Ctrl+. hushes both.',
    sessionFile: '02-strudel-hydra.bps',
    files: [{ path: '02-strudel-hydra.bps', contents: bundled02Session }]
  },
  {
    id: 'bundled-03-scenes-A-B',
    name: '03 — Sections enchaînées',
    tagline: 'two sections sequenced in time — calm, then full',
    description:
      'One self-contained `.bps` that SEQUENCES two sections in time: `calm` (drums only), then `full` (drums + lead). Two Strudel code voices inlined as backticks. Ctrl+Enter to evaluate the whole sequence; Ctrl+. to hush.',
    sessionFile: '03-scenes-A-B.bps',
    files: [{ path: '03-scenes-A-B.bps', contents: bundled03Session }]
  },
  {
    id: 'bundled-04-scenes-select',
    name: '04 — Sélecteur de scènes',
    tagline: 'named selectable scenes — pick calm or full live',
    description:
      'One self-contained `.bps` with named scenes guarded by a flag: `calm` (drums only) and `full` (drums + lead). Open it, then use the scene buttons in the transport bar (or Alt+1 / Alt+2) to switch which scene is armed — each click re-derives the grammar with that scene selected. Ctrl+. to hush.',
    sessionFile: '04-scenes-select.bps',
    files: [{ path: '04-scenes-select.bps', contents: bundled04Session }]
  },
  {
    id: 'tidal-intro',
    name: 'Tidal intro',
    tagline: 'drums + bass, two named scenes',
    description:
      'One self-contained `.bps`: a Tidal drums voice and a Strudel bass voice, both inlined as backticks → audio. Two named scenes guarded by a flag — `intro` (drums only) and `full` (drums + bass). Open it, then use the scene buttons in the transport bar (or Alt+1 / Alt+2) to switch. Ctrl+. to hush.',
    sessionFile: 'tidal-intro.bps',
    files: [{ path: 'tidal-intro.bps', contents: tidalIntroSession }]
  },
  {
    id: 'hydra-audio',
    name: 'Hydra + audio',
    tagline: 'reactive visuals over a drum loop',
    description:
      'One self-contained `.bps`: a Tidal drums voice → audio and a Hydra visual → video, both inlined as backticks. Two named scenes guarded by a flag — `a` (drums only) and `b` (drums + visuals). Open it, then switch scenes from the transport bar (or Alt+1 / Alt+2). Hydra renders behind the editor. Ctrl+. to hush.',
    sessionFile: 'hydra-audio.bps',
    files: [{ path: 'hydra-audio.bps', contents: hydraAudioSession }]
  },
  {
    id: 'mercury-intro',
    name: 'Mercury intro',
    tagline: 'declarative patterns from Amsterdam',
    description:
      'One self-contained `.bps`: a single Mercury voice playing a two-synth pattern → audio. Mercury is a readable, Tone.js-based live-coding language (Timo Hoogland). Put the cursor in the session and Ctrl+Enter to evaluate; Ctrl+. to silence.',
    sessionFile: 'mercury-intro.bps',
    files: [{ path: 'mercury-intro.bps', contents: mercuryIntroSession }]
  },
  {
    id: 'csound-intro',
    name: 'Csound intro',
    tagline: 'DSP synthesis, boots and plays',
    description:
      'One self-contained `.bps`: a Csound voice → audio. Csound is the MIT-lineage DSP language (Barry Vercoe, 1986) with ~1700 opcodes. Evaluate the session (Ctrl+Enter): the engine boots and the three notes in the score play. Ctrl+. to silence.',
    sessionFile: 'csound-intro.bps',
    files: [{ path: 'csound-intro.bps', contents: csoundIntroSession }]
  },
  {
    id: 'js-webaudio',
    name: 'JS / WebAudio',
    tagline: 'raw AudioContext oscillator',
    description:
      'One self-contained `.bps`: a plain JS voice → audio that spins up an oscillator via the shared AudioContext (`audio`). No framework — use it as a template for custom DSP. Ctrl+Enter to hear the beep; Ctrl+. to hush.',
    sessionFile: 'js-webaudio.bps',
    files: [{ path: 'js-webaudio.bps', contents: jsWebaudioSession }]
  },
  ...bpShowcase()
];

// Bol Processor showcase. Each entry pairs a one-actor `.kanopi` session with an
// authentic `.gr` grammar from Bernard Bel's BP3 corpus. The session routes the
// `.gr` to the `bp3` runtime, which derives it with the next-gen BPx engine and
// plays the resulting pitched tokens through Kanopi's WebAudio transport.
function bpStarter(
  id: string,
  name: string,
  tagline: string,
  description: string,
  grFile: string,
  grContents: string
): Starter {
  const sessionFile = `${id}.kanopi`;
  return {
    id: `bp3-${id}`,
    name,
    tagline,
    description,
    sessionFile,
    files: [
      {
        path: sessionFile,
        contents: `# ${name} — toggle the actor, then Ctrl+Enter anywhere in ${grFile}.\n# The grammar is parsed, derived by the BPx engine, and played as pitched notes.\n\n@actor grammar ${grFile} bp3\n\n@scene play grammar\n`
      },
      { path: grFile, contents: grContents }
    ]
  };
}

function bpShowcase(): Starter[] {
  return [
    bpStarter(
      'rotate-scales',
      'BP — Rotate scales',
      'Harm Visser · the _rotate() tool',
      'An authentic Bol Processor grammar by Harm Visser (1998) demonstrating the `_rotate()` operator over two C-major scales. Parsed and derived live by the next-gen BPx engine, played as pitched notes in Kanopi. The clearest melodic entry point. Ctrl+Enter to derive, Ctrl+. to hush.',
      'bp-rotate-scales.gr',
      bpRotateScales
    ),
    bpStarter(
      'not-reich',
      'BP — NotReich',
      'Thierry Montaudon · minimalist polyphony',
      'A Bol Processor grammar by Thierry Montaudon (1997), a phasing minimalist study in the spirit of Steve Reich. ~580 notes across overlapping voices, derived by BPx and rendered through Kanopi’s WebAudio path. Ctrl+Enter to play, Ctrl+. to silence.',
      'bp-not-reich.gr',
      bpNotReich
    ),
    bpStarter(
      'acceleration',
      'BP — Acceleration',
      'Harm Visser · recursive sawtooth rhythm',
      'A Bol Processor grammar by Harm Visser (1997) building an accelerating “sawtooth-rhythm” through recursive rewriting, with rising velocities, in the low register. Bernard Bel’s grammar formalism, derived by the BPx engine inside Kanopi. Ctrl+Enter to derive, Ctrl+. to hush.',
      'bp-acceleration.gr',
      bpAcceleration
    ),
    bpStarter(
      'transposition',
      'BP — Transposition',
      'Harm Visser · the Computer Music Journal example',
      'A Bol Processor grammar by Harm Visser (1997) using nested `_transpose()` substitutions — the very example published in the Computer Music Journal paper on BP. A deep low-register study, derived by the next-gen BPx engine and played in Kanopi. Ctrl+Enter to play, Ctrl+. to silence.',
      'bp-transposition.gr',
      bpTransposition
    ),
    bpStarter(
      'ames',
      'BP — Ames',
      'time structure with an undetermined rest',
      'A compact Bol Processor grammar from Bernard Bel’s corpus illustrating a complex polymetric time structure with an undetermined rest and stacked chords. Derived by BPx, voiced through Kanopi’s WebAudio transport. Ctrl+Enter to derive, Ctrl+. to hush.',
      'bp-ames.gr',
      bpAmes
    ),
    bpStarter(
      'visser5',
      'BP — Visser5',
      'Harm Visser · large generative piece',
      'A Bol Processor grammar by Harm Visser (1998): a dense, fully generative polyphonic piece (~1000+ notes) layering transposed and rotated melodic cells. Bernard Bel’s formalism, derived by the next-gen BPx engine, playing in Kanopi. Ctrl+Enter to play, Ctrl+. to silence.',
      'bp-visser5.gr',
      bpVisser5
    )
  ];
}
