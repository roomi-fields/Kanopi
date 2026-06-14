// Bundled starter sessions live in packages/library/bundled/ — single source
// of truth. We pull them in via Vite's `?raw` suffix so the contents are
// inlined at build time without ever duplicating them as string literals here.
// The relative path is: src/lib/library -> ../../../../library/bundled/.
import bundled01Session from '../../../../library/bundled/01-strudel-solo.kanopi?raw';
import bundled01Drums from '../../../../library/bundled/01-drums.strudel?raw';
import bundled02Session from '../../../../library/bundled/02-strudel-hydra.kanopi?raw';
import bundled02Drums from '../../../../library/bundled/02-drums.strudel?raw';
import bundled02Moire from '../../../../library/bundled/02-moire.hydra?raw';
import bundled03Session from '../../../../library/bundled/03-scenes-A-B.kanopi?raw';
import bundled03Drums from '../../../../library/bundled/03-drums.strudel?raw';
import bundled03Lead from '../../../../library/bundled/03-lead.strudel?raw';
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
  sessionFile: string; // path of the .kanopi to auto-open
  files: StarterFile[];
}

export const STARTERS: Starter[] = [
  {
    id: 'bundled-01-strudel-solo',
    name: '01 — Strudel solo',
    tagline: 'single actor, zero regression vs strudel.cc',
    description:
      'One Strudel actor running a 4-note sine pattern. The minimal proof Kanopi runs a strudel.cc patch unchanged. Ctrl+Enter to eval, Ctrl+. to hush.',
    sessionFile: '01-strudel-solo.kanopi',
    files: [
      { path: '01-strudel-solo.kanopi', contents: bundled01Session },
      { path: '01-drums.strudel', contents: bundled01Drums }
    ]
  },
  {
    id: 'bundled-02-strudel-hydra',
    name: '02 — Strudel + Hydra',
    tagline: 'audio + visuals synced on the shared clock',
    description:
      'A Strudel drum loop drives Kanopi’s transport; a Hydra patch reads `beat` and `bar` from the same clock to pulse in time. One Ctrl+. hushes both.',
    sessionFile: '02-strudel-hydra.kanopi',
    files: [
      { path: '02-strudel-hydra.kanopi', contents: bundled02Session },
      { path: '02-drums.strudel', contents: bundled02Drums },
      { path: '02-moire.hydra', contents: bundled02Moire }
    ]
  },
  {
    id: 'bundled-03-scenes-A-B',
    name: '03 — Scenes A / B',
    tagline: 'two scenes, one session — the Kanopi differentiator',
    description:
      'Two scenes arm different combinations of Strudel actors. Click `calm` for drums only, `full` for drums + lead. Alt+1 / Alt+2 to switch from the keyboard.',
    sessionFile: '03-scenes-A-B.kanopi',
    files: [
      { path: '03-scenes-A-B.kanopi', contents: bundled03Session },
      { path: '03-drums.strudel', contents: bundled03Drums },
      { path: '03-lead.strudel', contents: bundled03Lead }
    ]
  },
  {
    id: 'tidal-intro',
    name: 'Tidal intro',
    tagline: 'drums + bass in separate actors',
    description:
      'Two Strudel actors playing simultaneously through named slots. Toggle each LED independently or Ctrl+Enter to live-edit.',
    sessionFile: 'tidal-intro.kanopi',
    files: [
      {
        path: 'tidal-intro.kanopi',
        contents: `# Tidal intro — toggle each LED, or Ctrl+Enter on a block.

@actor drums drums.tidal  tidal
@actor bass  bass.strudel strudel

@scene intro drums
@scene full  drums bass
`
      },
      {
        path: 'drums.tidal',
        contents: `stack(
  s("bd*4").gain(0.9),
  s("~ cp").room(0.3),
  s("hh*8").gain(0.5).pan(sine.range(0.2, 0.8).slow(4))
)
`
      },
      {
        path: 'bass.strudel',
        contents: `note("c2 c2 eb2 g2")
  .sound("sawtooth")
  .cutoff(sine.range(400, 2000).slow(4))
  .gain(0.5)
`
      }
    ]
  },
  {
    id: 'hydra-audio',
    name: 'Hydra + audio',
    tagline: 'reactive visuals over a drum loop',
    description:
      'A Strudel drum loop paired with a Hydra visual. Toggle the drums first, then visuals — Hydra renders behind the editor.',
    sessionFile: 'hydra-audio.kanopi',
    files: [
      {
        path: 'hydra-audio.kanopi',
        contents: `# Hydra + audio — toggle both actors, then try editing a Hydra block.

@actor drums   drums.tidal   tidal
@actor visuals visuals.hydra hydra

@scene a drums
@scene b drums visuals
`
      },
      {
        path: 'drums.tidal',
        contents: `stack(
  s("bd ~ bd ~").gain(0.9),
  s("~ sd").room(0.4),
  s("hh*8").gain(0.4)
)
`
      },
      {
        path: 'visuals.hydra',
        contents: `osc(20, 0.1, 1.2)
  .kaleid(4)
  .modulate(noise(2), 0.3)
  .rotate(() => time / 6)
  .out()
`
      }
    ]
  },
  {
    id: 'mercury-intro',
    name: 'Mercury intro',
    tagline: 'declarative patterns from Amsterdam',
    description:
      'A single Mercury actor playing a synth-and-sample pattern. Mercury is a readable, Tone.js-based live-coding language (Timo Hoogland). Ctrl+Enter to eval, Ctrl+. to silence.',
    sessionFile: 'mercury-intro.kanopi',
    files: [
      {
        path: 'mercury-intro.kanopi',
        contents: `# Mercury intro — toggle the actor, then Ctrl+Enter on mercury-intro.mercury.

@actor patch patch.mercury mercury

@scene on patch
`
      },
      {
        path: 'patch.mercury',
        contents: `set tempo 110
set scale minor

new synth saw time(1/8) note(0 0) shape(1 1/16 0.5) gain(0.5)
new synth square time(1/4) note(-7 0) shape(1 1/8 0.4) gain(0.4)
`
      }
    ]
  },
  {
    id: 'csound-intro',
    name: 'Csound intro',
    tagline: 'DSP synthesis + live incremental eval',
    description:
      'Csound is the MIT-lineage DSP language (Barry Vercoe, 1986) with ~1700 opcodes. First Ctrl+Enter boots the engine. Then Ctrl+Enter on a single score line plays just that note — no glitch on what is already running. Ctrl+Enter on an `instr N … endin` block redefines the instrument live. Ctrl+. silences.',
    sessionFile: 'csound-intro.kanopi',
    files: [
      {
        path: 'csound-intro.kanopi',
        contents: `# Csound intro — toggle the actor, then follow the steps in beep.csd.

@actor synth beep.csd csound

@scene on synth
`
      },
      {
        path: 'beep.csd',
        contents: `<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
sr = 44100
ksmps = 32
nchnls = 2
0dbfs = 1

; Step 1: put the cursor anywhere in this file, Ctrl+Enter.
; The engine boots and the 2 notes in <CsScore> play automatically.

instr 1
  kEnv madsr 0.01, 0.1, 0.7, 0.1
  aOsc vco2 0.3 * kEnv, p4
  outs aOsc, aOsc
endin

; Step 3: replace the 'vco2' line above with
;   aOsc pluck 0.3 * kEnv, p4, p4, 0, 1
; then Ctrl+Enter anywhere inside the instr 1 ... endin block to
; redefine the instrument live (Karplus-Strong pluck). The eval
; light goes green but you hear nothing yet: compileOrc only rewrites
; instr 1's body. Now go back to Step 2 and Ctrl+Enter a 'i 1 ...'
; score line — that new note uses the pluck sound.
; Pluck's 5 required params: kamp, kcps, icps, ifn, imeth
;   (ifn=0 = white noise init, imeth=1 = averaging method).

</CsInstruments>
<CsScore>
; f 0 3600 keeps the engine alive for 1 hour — required for live
; coding. Without it, Csound ends realtime rendering as soon as the
; score is exhausted.
f 0 3600

; Initial notes to hear on boot:
i 1 0 1 220
i 1 0.5 1 440

; Step 2: put the cursor on the line below and Ctrl+Enter to fire
; just this note without disrupting anything already playing.
; Add more 'i 1 ...' lines and Ctrl+Enter each.
i 1 0 1 330
</CsScore>
</CsoundSynthesizer>
`
      }
    ]
  },
  {
    id: 'js-webaudio',
    name: 'JS / WebAudio',
    tagline: 'raw AudioContext oscillator',
    description:
      'No framework: a plain JS block that spins up an oscillator via the shared AudioContext. Use it as a template for custom DSP.',
    sessionFile: 'js-webaudio.kanopi',
    files: [
      {
        path: 'js-webaudio.kanopi',
        contents: `# JS / WebAudio — Ctrl+Enter on the block in tone.js to hear the beep.

@actor tone tone.js js

@scene on tone
`
      },
      {
        path: 'tone.js',
        contents: `// 'audio' is the shared AudioContext injected by the runtime.
const osc = audio.createOscillator();
const gain = audio.createGain();
osc.frequency.value = 220;
gain.gain.value = 0.15;
osc.connect(gain).connect(audio.destination);
osc.start();
osc.stop(audio.currentTime + 1.5);
`
      }
    ]
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
