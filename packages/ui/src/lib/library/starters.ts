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
    tagline: 'DSP academic synthesis via @csound/browser',
    description:
      'A single Csound actor running a .csd file. Csound is the MIT-lineage DSP language (Barry Vercoe, 1986) with ~1700 opcodes. Ctrl+Enter to eval, Ctrl+. to silence. Phase 2.7a uses whole-file recompile — block-by-block incremental eval lands in 2.7b.',
    sessionFile: 'csound-intro.kanopi',
    files: [
      {
        path: 'csound-intro.kanopi',
        contents: `# Csound intro — toggle the actor, then Ctrl+Enter on beep.csd.

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

instr 1
  kEnv madsr 0.01, 0.1, 0.7, 0.1
  aOsc vco2 0.3 * kEnv, p4
  outs aOsc, aOsc
endin

</CsInstruments>
<CsScore>
i 1 0 0.5 220
i 1 0.5 0.5 277
i 1 1 0.5 330
i 1 1.5 0.5 440
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
  }
];
