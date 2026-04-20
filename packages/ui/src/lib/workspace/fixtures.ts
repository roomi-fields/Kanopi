import type { VirtualFile } from './types';
import { runtimeFromExt } from './types';

const raw: { path: string; contents: string }[] = [
  {
    path: 'session.kanopi',
    contents: `# myset — main session
# Edit and save: actors/scenes/maps reload on the fly.

@actor drums   drums.tidal    tidal
@actor visuals visuals.hydra  hydra
@actor bass    bass.scd       sc

@scene intro   visuals
@scene drop    drums visuals bass
@scene break   visuals bass

@map cv:1    tempo
@map trig:36 scene:drop
@map cv:21   drums.toggle
`
  },
  {
    path: 'second.kanopi',
    contents: `# second session — minimal demo

@actor melody melody.strudel strudel

@scene a melody
@scene b
`
  },
  {
    path: 'melody.strudel',
    contents: `note("c4 e4 g4 b4").s("sawtooth").gain(0.4).slow(2)
`
  },
  {
    path: 'drums.tidal',
    contents: `stack(
  s("bd*4").gain(0.9),
  s("~ cp").room(0.4),
  s("hh*8").gain(0.5).pan(sine.range(0.2, 0.8).slow(4))
)
`
  },
  {
    path: 'visuals.hydra',
    contents: `osc(60, 0.1, 1.5)
  .modulate(noise(3))
  .rotate(() => time/10)
  .out()
`
  },
  {
    path: 'bass.scd',
    contents: `(
SynthDef(\\bass, { |freq=55, amp=0.3|
  var sig = SinOsc.ar(freq) * EnvGen.kr(Env.perc, doneAction:2);
  Out.ar(0, sig.dup * amp);
}).add;
)
`
  }
];

export function starterFiles(): VirtualFile[] {
  return raw.map((f, i) => ({
    id: `f${i + 1}`,
    path: f.path,
    name: f.path.split('/').pop() ?? f.path,
    contents: f.contents,
    runtime: runtimeFromExt(f.path)
  }));
}
