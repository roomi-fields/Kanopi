import type { VirtualFile } from './types';
import { runtimeFromExt } from './types';

const raw: { path: string; contents: string }[] = [
  {
    path: 'main.bps',
    contents: `// main session — 3 voix-code, sélectionnables par section (intro/drop/break).
@library.strudel "dirt-samples"

@actor drums  eval.strudel
@actor visuals  eval.hydra
@actor bass  eval.strudel

@flag section: intro:1, drop:2, break:3

[section==intro] S -> visuals_r
[section==drop]  S -> { drums_r, visuals_r, bass_r }
[section==break] S -> { visuals_r, bass_r }

drums_r -> drums.\`stack(s("bd*4").gain(0.9), s("~ cp").room(0.4), s("hh*8").gain(0.5).pan(sine.range(0.2, 0.8).slow(4)))\`
visuals_r -> visuals.\`osc(60, 0.1, 1.5).modulate(noise(3)).rotate(() => time/10).out()\`
bass_r -> bass.\`note("c2 c2 eb2 g2").s("sawtooth").gain(0.4)\`
`
  },
  {
    path: 'second.bps',
    contents: `// second session — démo minimale, 2 sections nommées (a / b silence).
@actor melody eval.strudel

@flag section: a:1, b:2

[section==a] S -> melody_r
[section==b] S -> -

melody_r -> melody.\`note("c4 e4 g4 b4").s("sawtooth").gain(0.4).slow(2)\`
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
