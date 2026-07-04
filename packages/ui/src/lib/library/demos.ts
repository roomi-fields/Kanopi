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
  /** the primary language/runtime for the card badge + filter; defaults to 'bpscript' */
  language?: string;
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
    name: 'Acid Bass — niveaux d’enveloppe',
    tagline: 'groupe vs per-note vs terminal, 3 enveloppes',
    description:
      'Banc complet des niveaux d’expression de l’enveloppe de cutoff, combinés : per-note (*:cutoff), GROUPE (cutoff:env1, une enveloppe sur la phrase), terminal (C2:cutoff), et trois enveloppes de caractère distinct (pluck sombre / pad ouvert / wah médian) — plus un LFO de panoramique.',
    category: 'bpscript',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['cv', 'bass', 'modulation', 'adsr'],
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
  strudel: {
    name: 'Strudel — code voice',
    tagline: 'a synth bassline inherited from the actor',
    description:
      'A code voice: the actor (eval.strudel) types the language, so a flow backtick in its head rule inherits Strudel with no tag. A synth bass pattern (no samples needed — it sounds without the network) sits in the rule flow as a terminal; Kronos owns start/stop/loop, the code is captured then transported.',
    category: 'other-langs',
    language: 'strudel',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['strudel', 'patterns'],
    showcase: true
  },
  hydra: {
    name: 'Hydra — code voice',
    tagline: 'video synth, not every voice makes sound',
    description:
      'A code voice for visuals: the actor (eval.hydra) types the language and the flow backtick inherits Hydra. A code voice need not be audible — Hydra renders image, routed by its runtime; the start/stop/loop container stays driven by Kronos.',
    category: 'other-langs',
    language: 'hydra',
    outputs: ['visual'],
    level: 'didactic',
    tags: ['hydra', 'visuals'],
    showcase: true
  },
  p5: {
    name: 'p5 — code voice',
    tagline: 'an explicit tag, no actor needed',
    description:
      'A code voice via the explicit tag form (p5: …): no code-voice actor is declared, the tag gives the language directly. Equivalent to an eval.p5 actor by inheritance. The sketch draws to the p5 canvas, placed in time by the dispatcher.',
    category: 'other-langs',
    language: 'p5',
    outputs: ['visual'],
    level: 'didactic',
    tags: ['p5', 'creative-coding']
  },
  csound: {
    name: 'Csound — code voice',
    tagline: 'a synthesis instrument, Kronos owns tempo',
    description:
      'A code voice for audio synthesis: the actor (eval.csound) types the language and the flow backtick inherits Csound. Any absolute tempo in the patch is overridden — Kronos is the sole time master (DAW model).',
    category: 'other-langs',
    language: 'csound',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['csound', 'synthesis']
  },
  mercury: {
    name: 'Mercury — code voice',
    tagline: 'minimal live coding, slaved to the master tempo',
    description:
      'A code voice for minimal live coding: the actor (eval.mercury) types the language, inherited on the head rule. A set tempo in the patch would be overridden — the voice is slaved to Kronos, its rhythm scales; polytempo is a ratio.',
    category: 'other-langs',
    language: 'mercury',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['mercury', 'live-coding']
  },
  tidal: {
    name: 'Tidal — code voice',
    tagline: 'inheritance plus a per-terminal tag override',
    description:
      'A code voice for TidalCycles patterns: two forms shown — inheritance (the eval.tidal actor types the beat rule) and a per-terminal tag override (sc:) for a one-off SuperCollider line in the flow.',
    category: 'other-langs',
    language: 'tidal',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['tidal', 'patterns']
  },
  'cv-curve-js': {
    name: 'CV curve in JS — code voice',
    tagline: 'a reusable modulation curve wired at a param point',
    description:
      'A CV modulation in JS: the cv keyword types the role (modulation) and the js: tag types the language. The curve (0..1 over the note duration) is declared once, reusable, and wired at a parameter point (C4(cutoff:sweep)).',
    category: 'bpscript-backticks',
    language: 'js',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['cv', 'modulation', 'js'],
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
      language: m.language ?? 'bpscript',
      outputs: m.outputs,
      level: m.level,
      tags: m.tags,
      showcase: m.showcase,
      sessionFile: file,
      files: [{ path: file, contents }]
    };
  });
