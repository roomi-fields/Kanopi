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
