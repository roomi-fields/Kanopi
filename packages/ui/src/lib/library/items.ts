// The bundled library items, mapped onto the structured catalog model. The
// `starters.ts` file holds the CONTENT (names, descriptions, files); this adds
// the catalog axes (category, language, outputs, level, tags, showcase) the
// library space sorts and filters by. Lot 3 grows this from the shared
// catalogue (hub/projets/librairies-inventaire.md) by bundling more scenes.

import { STARTERS } from './starters';
import { DEMO_ITEMS } from './demos';
import type { LibraryItem, LibraryCategory, OutputKind, Level } from './catalog';

interface Axes {
  category: LibraryCategory;
  language: string;
  outputs: OutputKind[];
  level: Level;
  tags: string[];
  showcase?: boolean;
}

// Keyed by starter id. Anything unmapped falls back to a sensible default.
const STARTER_AXES: Record<string, Axes> = {
  'bundled-01-strudel-solo': {
    category: 'codevoice',
    language: 'strudel',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['drums', 'strudel'],
    showcase: true
  },
  'bundled-02-strudel-hydra': {
    category: 'codevoice',
    language: 'strudel',
    outputs: ['audio', 'visual'],
    level: 'intermediate',
    tags: ['sync', 'visuals'],
    showcase: true
  },
  'bundled-03-scenes-A-B': {
    category: 'orchestrator',
    language: 'strudel',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['sequence', 'sections', 'multi-actor'],
    showcase: true
  },
  'bundled-04-scenes-select': {
    category: 'orchestrator',
    language: 'strudel',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['scenes', 'select'],
    showcase: true
  },
  'tidal-intro': {
    category: 'codevoice',
    language: 'tidal',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['tidal', 'scenes', 'multi-actor']
  },
  'hydra-audio': {
    category: 'codevoice',
    language: 'hydra',
    outputs: ['audio', 'visual'],
    level: 'didactic',
    tags: ['visuals', 'hydra', 'scenes']
  },
  'mercury-intro': {
    category: 'codevoice',
    language: 'mercury',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['mercury']
  },
  'csound-intro': {
    category: 'codevoice',
    language: 'csound',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['csound']
  },
  'js-webaudio': {
    category: 'codevoice',
    language: 'js',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['webaudio']
  },
  'bp3-rotate-scales': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['scales'],
    showcase: true
  },
  'bp3-not-reich': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['minimalism'],
    showcase: true
  },
  'bp3-acceleration': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['rhythm'],
    showcase: true
  },
  'bp3-transposition': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['transposition'],
    showcase: true
  },
  'bp3-ames': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['polymetric'],
    showcase: true
  },
  'bp3-visser5': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['generative'],
    showcase: true
  },
  'bp3-765432': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['polyrhythm', 'dance'],
    showcase: true
  },
  'bp3-alan': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['melody']
  },
  'bp3-alarm': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['melody']
  },
  'bp3-beatrix': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['melody']
  },
  'bp3-djinns': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['generative', 'palindrome'],
    showcase: true
  },
  'bp3-doeslittle': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['minimal']
  },
  'bp3-drum': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['drums', 'rhythm']
  },
  'bp3-kss2': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['melody']
  },
  'bp3-livecode1': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['chords']
  },
  'bp3-livecode2': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['polytempo', 'rhythm']
  },
  'bp3-mozart': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['harmony'],
    showcase: true
  },
  'bp3-mymelody': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: ['melody', 'polyphony']
  },
  'bp3-rajeev': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['raga', 'drone'],
    showcase: true
  },
  'bp3-ruwet': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'intermediate',
    tags: ['variations']
  },
  'bp3-visser3': {
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'advanced',
    tags: ['polymetric']
  }
};

const DEFAULT_AXES: Axes = {
  category: 'basics',
  language: 'bpscript',
  outputs: ['audio'],
  level: 'intermediate',
  tags: []
};

const STARTER_ITEMS: LibraryItem[] = STARTERS.map((s) => {
  const a = STARTER_AXES[s.id] ?? DEFAULT_AXES;
  return {
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    sessionFile: s.sessionFile,
    files: s.files,
    category: a.category,
    language: a.language,
    outputs: a.outputs,
    level: a.level,
    tags: a.tags,
    showcase: a.showcase
  };
});

// Bundled starters (sessions + bp3 showcase) + the BPScript demo scenes from the
// shared catalogue. Lot 3 grows the latter; both share the one item shape.
export const LIBRARY_ITEMS: LibraryItem[] = [...STARTER_ITEMS, ...DEMO_ITEMS];
