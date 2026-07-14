import type { VirtualFile } from './types';
import { runtimeFromExt } from './types';

const raw: { path: string; contents: string }[] = [
  {
    path: 'main.bps',
    contents: `// main session — 3 voix-code, sélectionnables par scène (intro/drop/break).
@library.strudel "dirt-samples"

@actor drums   transport.audio  eval.strudel
@actor visuals transport.video  eval.hydra
@actor bass    transport.audio  eval.strudel

@flag scene: intro:1, drop:2, break:3

[scene==intro] S -> visuals
[scene==drop]  S -> { drums, visuals, bass }
[scene==break] S -> { visuals, bass }

drums -> \`stack(s("bd*4").gain(0.9), s("~ cp").room(0.4), s("hh*8").gain(0.5).pan(sine.range(0.2, 0.8).slow(4)))\`
visuals -> \`osc(60, 0.1, 1.5).modulate(noise(3)).rotate(() => time/10).out()\`
bass -> \`note("c2 c2 eb2 g2").s("sawtooth").gain(0.4)\`
`
  },
  {
    path: 'second.bps',
    contents: `// second session — démo minimale, 2 scènes nommées (a / b silence).
@actor melody transport.audio eval.strudel

@flag scene: a:1, b:2

[scene==a] S -> melody
[scene==b] S -> -

melody -> \`note("c4 e4 g4 b4").s("sawtooth").gain(0.4).slow(2)\`
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
