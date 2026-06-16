// Resource libraries — the catalogs a program draws on (NOT the demo/scene
// catalogue in LibraryView). Read-only browse for the "Resources" activity view.
//
// Two sources, glued here:
//   - bpscript's musical catalogs (alphabets, tunings, temperaments, scales,
//     octaves, sounds) — shipped as JSON in the `bpscript` dep, imported AS-IS.
//   - Kanopi's own catalogs (audio banks, visuals, devices) — already parsed by
//     their existing modules; reused, never re-read.

import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import scalesJson from 'bpscript/lib/scales.json';
import octavesJson from 'bpscript/lib/octaves.json';
import tablaPercJson from 'bpscript/lib/sounds/tabla_perc.json';

import { catalog as audioBanks } from './audio-banks';
import { visualsCatalog } from './visuals';
import { listDevices } from '../devices/registry';

export interface ResourceEntry {
  /** id/name as referenced in source (e.g. `arabic`, `maqam_rast`, `dirt-samples`). */
  id: string;
  /** short human label / description / source, when the catalog carries one. */
  label?: string;
}

export interface ResourceGroup {
  /** group key, also used to match a referenced library's type. */
  type: string;
  /** display heading. */
  title: string;
  entries: ResourceEntry[];
}

// bpscript catalogs are objects keyed by name. They carry doc-only `_comment`
// (and `_comment_*` fragment) keys that are NOT real entries — skip them.
function isCommentKey(k: string): boolean {
  return k === '_comment' || k.startsWith('_comment');
}

type NamedCatalog = Record<string, unknown>;

function entriesFromNamedCatalog(catalog: NamedCatalog): ResourceEntry[] {
  return Object.keys(catalog)
    .filter((k) => !isCommentKey(k))
    .map((id) => {
      const v = catalog[id] as { description?: unknown; culture?: unknown } | undefined;
      const desc = v && typeof v === 'object' ? v.description : undefined;
      const culture = v && typeof v === 'object' ? v.culture : undefined;
      const label =
        typeof desc === 'string' ? desc : typeof culture === 'string' ? culture : undefined;
      return { id, label };
    });
}

// `sounds/` holds one JSON file per synthesis family (today only tabla_perc).
// Each file is one entry; its `description` is the label. Bundled as a static
// list — Vite can't glob across the dep boundary, and the set is tiny.
function soundEntries(): ResourceEntry[] {
  const files: { id: string; json: { description?: string } }[] = [
    { id: 'tabla_perc', json: tablaPercJson as { description?: string } }
  ];
  return files.map((f) => ({ id: f.id, label: f.json.description }));
}

/** All resource libraries, grouped by type. Computed once at module load. */
export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    type: 'alphabet',
    title: 'Alphabets',
    entries: entriesFromNamedCatalog(alphabetsJson as NamedCatalog)
  },
  {
    type: 'tuning',
    title: 'Tunings',
    entries: entriesFromNamedCatalog(tuningsJson as NamedCatalog)
  },
  {
    type: 'temperament',
    title: 'Temperaments',
    entries: entriesFromNamedCatalog(temperamentsJson as NamedCatalog)
  },
  {
    type: 'scale',
    title: 'Scales',
    entries: entriesFromNamedCatalog(scalesJson as NamedCatalog)
  },
  {
    type: 'octaves',
    title: 'Octaves',
    entries: entriesFromNamedCatalog(octavesJson as NamedCatalog)
  },
  {
    type: 'sound',
    title: 'Sounds',
    entries: soundEntries()
  },
  {
    type: 'audio-bank',
    title: 'Audio banks',
    entries: audioBanks.items.map((b) => ({ id: b.id, label: b.source ?? b.name }))
  },
  {
    type: 'visual',
    title: 'Visuals',
    entries: visualsCatalog.items.map((v) => ({ id: v.id, label: v.name }))
  },
  {
    type: 'device',
    title: 'Devices',
    entries: listDevices().map((d) => ({
      id: d.name,
      label: d.label ? `${d.type} · ${d.label}` : d.type
    }))
  }
];
