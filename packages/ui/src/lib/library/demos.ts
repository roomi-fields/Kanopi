// BPScript demo scenes bundled from the shared catalogue
// (hub/projets/librairies-inventaire.md, owner: bpscript). Each is a single
// `.bps` that plays through the BPScript adapter (compileBPS → BPx → audio).
// Loaded as raw text via a glob over the bundled demos directory; the per-demo
// axes (category/level/⭐) come from the catalogue.
//
// Tuning note: microtonal demos (gamelan slendro, Bohlen-Pierce, arabic maqam)
// render at their INTENDED tuning — the resolver reads BPScript's pitch catalogs
// (alphabets/temperaments/scales/tunings) and computes exact just-intonation
// frequencies (maqams from compose(jins)+junction). No 12-TET approximation.

import type { LibraryItem, LibraryCategory, OutputKind, Level } from './catalog';

const raw = import.meta.glob('../../../../library/bundled/demos/*.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

interface DemoMeta {
  name: string;
  tagline: string;
  description: string;
  category: LibraryCategory;
  outputs: OutputKind[];
  level: Level;
  tags: string[];
  showcase?: boolean;
}

// Keyed by the `.bps` file basename.
const DEMO_META: Record<string, DemoMeta> = {
  'polymetric-rhythm': {
    name: 'Polymetric rhythm',
    tagline: '3 against 4 against 5',
    description: 'A didactic study in polymeter — three voices in 3, 4 and 5 over a shared pulse.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['polymeter', 'rhythm'],
    showcase: true
  },
  arabic: {
    name: 'Arabic — maqam Rast',
    tagline: 'quarter-tone melody',
    description: 'A maqam Rast line in just intonation — neutral 3rd (sikah) and 7th (awj).',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['microtonal', 'melody'],
    showcase: true
  },
  mohanam: {
    name: 'Mohanam — Carnatic raga',
    tagline: 'generative sargam melody',
    description:
      'Raga Mohanam (pentatonic: sa re ga pa dha), a generative Carnatic grammar by Kumar S. Subramanian. The sargam alphabet is routed to the in-browser synth; the generative structure is the original fixture, only the output is adapted for audio.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['microtonal', 'raga', 'sargam', 'generative', 'india'],
    showcase: true
  },
  gamelan: {
    name: 'Gamelan — slendro',
    tagline: 'Javanese pentatonic',
    description: 'A slendro (Javanese pentatonic) texture, at its intended stretched tuning.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['microtonal', 'gamelan'],
    showcase: true
  },
  'bohlen-pierce': {
    name: 'Bohlen-Pierce',
    tagline: 'the 3:1 tritave',
    description:
      'A melody on the Bohlen-Pierce scale, built on a 3:1 tritave instead of the octave.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['microtonal', 'xenharmonic'],
    showcase: true
  },
  'cv-adsr': {
    name: 'Acid Bass — ADSR + pan LFO',
    tagline: 'per-note filter envelope, LFO panning',
    description:
      'TB-303 acid bass: the filter envelope retriggers per note (*:cutoff) while an LFO pans the sound across the stereo field (signal).',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['cv', 'bass', 'modulation'],
    showcase: true
  },
  'superp-cutoff': {
    name: 'Superposition — group + per-note cutoff',
    tagline: 'two filters in series on one param',
    description:
      'SUPERP-1 test scene: a slow GROUP cutoff envelope (a shared bus over the whole phrase) and a fast PER-NOTE cutoff envelope superpose in series on the same parameter. Each note re-triggers its own filter, then passes through the group bus.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['cv', 'modulation', 'superposition', 'test'],
    showcase: false
  },
  'group-cutoff': {
    name: 'Group cutoff — filtre de groupe',
    tagline: 'la 1ʳᵉ note brillante, les suivantes sombres',
    description:
      'Démo du filtre de GROUPE (portée règle) : une seule enveloppe de cutoff sur toute la phrase. La 1ʳᵉ note attrape l’attaque (filtre ouvert, brillante) ; les suivantes sont au sustain (cutoff bas, sombres). Réglée pour un contraste évident (decay long, sustain bas, notes longues).',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['cv', 'modulation', 'group', 'cutoff'],
    showcase: true
  },
  'cv-lfo': {
    name: 'Spatial Arp — LFO',
    tagline: 'panning modulation',
    description: 'An arpeggio swept across the stereo field by a panning LFO.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['cv', 'arp']
  },
  'midi-dual-output': {
    name: 'MIDI + WebAudio',
    tagline: 'two outputs at once',
    description: 'A line sent to a MIDI synth and the in-browser synth simultaneously.',
    category: 'bpscript',
    outputs: ['midi', 'audio'],
    level: 'intermediate',
    tags: ['midi'],
    showcase: true
  },
  'cv-backtick': {
    name: 'Wobble Bass — backtick',
    tagline: 'a custom JS curve in a backtick',
    description:
      'A wobble bass whose filter is modulated by a custom JavaScript curve embedded in a backtick — BPScript hosting code inline.',
    category: 'bpscript-backticks',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['cv', 'backtick', 'code'],
    showcase: true
  },
  'strudel-backtick': {
    name: 'Strudel backtick — code voice',
    tagline: 'a strudel pattern as a terminal in the flow',
    description:
      'A standalone backtick voice: a `strudel:` pattern sits in the rule flow as a terminal of its own right. The dispatcher places it in time and fires the Strudel interpreter at that moment — the code is captured then transported, not rendered opaquely.',
    category: 'bpscript-backticks',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['backtick', 'code', 'cross-runtime', 'strudel'],
    showcase: true
  },
  'midi-actors': {
    name: 'Dual actors — MIDI + audio',
    tagline: 'two voices, two transports',
    description:
      'A BPScript orchestrator: a melody actor routed to a MIDI synth and a bass actor routed to the in-browser synth, voiced together from one scene. The bass sounds even without MIDI hardware.',
    category: 'orchestrator',
    outputs: ['midi', 'audio'],
    level: 'intermediate',
    tags: ['orchestration', 'multi-actor', 'midi'],
    showcase: true
  },
  'dual-actors-audio': {
    name: 'Twin synth voices — all audio',
    tagline: 'lead + bass, one synth',
    description:
      'A BPScript orchestrator with a lead and a bass actor, both routed to the in-browser synth and voiced together from one scene. Arm/disarm silences one voice while the other plays on.',
    category: 'orchestrator',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['orchestration', 'multi-actor'],
    showcase: true
  },
  'midi-channel-override': {
    name: 'MIDI channel override',
    tagline: 'address in the language, per-note override',
    description:
      'Two MIDI actors declare their channel in BPScript (transport.midi(ch:N)); one note carries an inline (ch:5) override. The output address travels in the scene, not via any host routing map (KAI-9 test scene).',
    category: 'orchestrator',
    outputs: ['midi'],
    level: 'advanced',
    tags: ['orchestration', 'multi-actor', 'midi', 'routing'],
    showcase: false
  }
};

export const DEMO_ITEMS: LibraryItem[] = Object.entries(raw)
  .map(([path, contents]) => ({
    base: path
      .split('/')
      .pop()!
      .replace(/\.bps$/, ''),
    contents
  }))
  .filter(({ base }) => base in DEMO_META)
  .map(({ base, contents }): LibraryItem => {
    const m = DEMO_META[base];
    const file = `${base}.bps`;
    return {
      id: `bps-${base}`,
      name: m.name,
      tagline: m.tagline,
      description: m.description,
      category: m.category,
      language: 'bpscript',
      outputs: m.outputs,
      level: m.level,
      tags: m.tags,
      showcase: m.showcase,
      sessionFile: file,
      files: [{ path: file, contents }]
    };
  });
