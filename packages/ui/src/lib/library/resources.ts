// Resource libraries — the catalogs a program draws on (NOT the demo/scene
// catalogue in LibrarySpace). Read-only browse for the "Resources" activity view
// (also reused, as-is, for Factory's "Libraries" section — ESPACE_PERSO_SPEC §10.3).
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
// BPScript language modules (`@core`/`@controls` + the `mod` CV lib): real library
// files with browsable content (core symbols/settings, control terminals, CV
// objects + their declarative curves). Imported AS-IS so opening one shows it.
import coreJson from 'bpscript/lib/core.json';
import controlsJson from 'bpscript/lib/controls.json';
import modJson from 'bpscript/lib/mod.json';
// Digital functions library (transpose &c., KAI-B03's twin of mod.json) — a real
// browsable bpscript library file, same as the others above.
import digitalJson from 'bpscript/lib/digital.json';

import { catalog as audioBanks } from './audio-banks';
import { visualsCatalog } from './visuals';
import { listDevices } from '../devices/registry';
// Kanopi's own bundled catalogs — real files, read AS-IS (not the `listDevices()`
// merge, which adds a computed default-midi entry not present in the file).
import devicesJson from '../../../../library/devices.json';
import routingJson from '../../../../library/routing.json';

export interface ResourceEntry {
  /** id/name as referenced in source (e.g. `arabic`, `maqam_rast`, `dirt-samples`). */
  id: string;
  /** short human label / description / source, when the catalog carries one. */
  label?: string;
  /** raw catalog value for this entry — opened read-only as formatted JSON. */
  data: unknown;
}

export interface ResourceGroup {
  /** group key, also used to match a referenced library's type. */
  type: string;
  /** display heading. */
  title: string;
  entries: ResourceEntry[];
}

// bpscript catalogs are objects keyed by name. They carry META keys that are NOT
// real entries and must not surface as browsable cards: any `_`-prefixed key
// (doc-only `_comment`/`_comment_*`, `_anchor_doc`, …) and the catalog's own
// `domain` self-declaration (same schema as personal libs) — skip them all.
function isMetaKey(k: string): boolean {
  return k === 'domain' || k.startsWith('_');
}

type NamedCatalog = Record<string, unknown>;

function entriesFromNamedCatalog(catalog: NamedCatalog): ResourceEntry[] {
  return Object.keys(catalog)
    .filter((k) => !isMetaKey(k))
    .map((id) => {
      const v = catalog[id] as { description?: unknown; culture?: unknown } | undefined;
      const desc = v && typeof v === 'object' ? v.description : undefined;
      const culture = v && typeof v === 'object' ? v.culture : undefined;
      const label =
        typeof desc === 'string' ? desc : typeof culture === 'string' ? culture : undefined;
      return { id, label, data: catalog[id] };
    });
}

// Percussion SOUND is no longer in Kanopi (RA-6 / décision Romain): the synthesis
// (`tabla_perc.json` + the synth) moved out with the deleted audio output. The tabla
// ALPHABET (bols) + grammars stay as language content — bols are writable but MUTE
// until the alphabet→sound-backtick model is rebuilt. So no sound resources here.
function soundEntries(): ResourceEntry[] {
  return [];
}

// A bpscript library module (`core`/`controls`/`filter`) → a browsable entry.
// `description`/`name` is the label when present; the whole JSON is the content.
function moduleEntry(id: string, json: unknown): ResourceEntry {
  const j = json as { description?: unknown; name?: unknown; type?: unknown } | undefined;
  const label =
    (j && typeof j.description === 'string' && j.description) ||
    (j && typeof j.type === 'string' && j.type) ||
    undefined;
  return { id, label: label || undefined, data: json };
}

/** All resource libraries, grouped by type. Computed once at module load. */
export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    type: 'module',
    title: 'Modules (langage)',
    entries: [
      moduleEntry('core', coreJson),
      moduleEntry('controls', controlsJson),
      moduleEntry('mod', modJson)
    ]
  },
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
    entries: audioBanks.items.map((b) => ({ id: b.id, label: b.source ?? b.name, data: b }))
  },
  {
    type: 'visual',
    title: 'Visuals',
    entries: visualsCatalog.items.map((v) => ({ id: v.id, label: v.name, data: v }))
  },
  {
    type: 'device',
    title: 'Devices',
    entries: listDevices().map((d) => ({
      id: d.name,
      label: d.label ? `${d.type} · ${d.label}` : d.type,
      data: d
    }))
  }
];

// --- Real library FILES (Romain 2026-07-13: end of the per-ENTRY split) ---
//
// RESOURCE_GROUPS above splits each catalog file into one card per NAMED entry
// inside it (`western`, `sargam`… are entries INSIDE alphabets.json) — kept
// only because NowView's "Libraries used" panel must open the ONE entry a
// scene actually references (`@alphabet.western` → just that sub-object).
//
// Factory's "Libraries" browser is a different concern: it lists the real
// FILES on disk. "One alphabet file contains every alphabet — a real library
// file is one entry point; opening it opens the library" (Romain). So a card
// here = one whole file, opened verbatim (no meta-key stripping, no per-entry
// split).
//
// Grouping (the rail): by REAL ownership, the only fact that doesn't require
// inventing a taxonomy —
//   - `bpscript/lib`     — the upstream BPScript language libraries (pitch +
//     function catalogs), all physically the same directory in the `bpscript`
//     dependency.
//   - `Kanopi library`   — the catalogs Kanopi itself ships (devices, OSC
//     routing, audio banks, visuals). These are NOT all in one physical
//     folder (`packages/library/*.json` for devices/routing,
//     `lib/library/*/catalog.json` for audio-banks/visuals) — grouped by WHO
//     ships the file (Kanopi vs. the bpscript language), not by invented
//     content domains. Two groups only: honest given how few real sources
//     there are.
export interface LibraryFile {
  /** file id (no extension) — also the card title and the path segment. */
  id: string;
  /** display name, same as `id` (kept distinct in case a nicer label is ever warranted). */
  name: string;
  /** short description, read from the file's own `description`/`type`/`_comment` — absent if the file carries none (shows just the name then). */
  description?: string;
  /** rail grouping key = the DOMAIN the file DECLARES inside itself (`domain`
   *  field), or `'uncategorized'` when the file declares none. Romain 2026-07-13:
   *  the category comes from the file itself (a real declared fact), NEVER an
   *  invented taxonomy nor "who ships it". Files missing `domain` (a real upstream
   *  data hole, routed to bpscript) surface honestly as uncategorized. */
  domain: string;
  /** the file's entire parsed content — opened read-only, verbatim. */
  data: unknown;
}

/** Pulls a one-line description straight from the file's own content, in order
 * of preference: a `description` string, the first line of an array
 * `_comment`, a string `_comment`, else the `type` field. No invented prose —
 * a file carrying none of these shows just its name. */
function describeFile(json: unknown): string | undefined {
  const j = json as
    | { description?: unknown; type?: unknown; _comment?: unknown }
    | null
    | undefined;
  if (!j || typeof j !== 'object') return undefined;
  if (typeof j.description === 'string') return j.description;
  if (Array.isArray(j._comment) && typeof j._comment[0] === 'string') return j._comment[0];
  if (typeof j._comment === 'string') return j._comment;
  if (typeof j.type === 'string') return j.type;
  return undefined;
}

/** The domain a file DECLARES about itself — its `domain` field, read verbatim.
 *  No inference from the filename, no invented default: a file that declares
 *  nothing is `'uncategorized'` (honest — the data hole shows, routed upstream). */
function readDomain(json: unknown): string {
  const j = json as { domain?: unknown } | null | undefined;
  return j && typeof j === 'object' && typeof j.domain === 'string' ? j.domain : 'uncategorized';
}

function libraryFile(id: string, data: unknown): LibraryFile {
  return { id, name: id, description: describeFile(data), domain: readDomain(data), data };
}

/** One card per REAL library file (Factory › Libraries browser). Grouped by the
 *  `domain` each file DECLARES (readDomain), never by an invented taxonomy. */
export const RESOURCE_FILES: LibraryFile[] = [
  libraryFile('alphabets', alphabetsJson),
  libraryFile('tunings', tuningsJson),
  libraryFile('temperaments', temperamentsJson),
  libraryFile('scales', scalesJson),
  libraryFile('octaves', octavesJson),
  libraryFile('core', coreJson),
  libraryFile('controls', controlsJson),
  libraryFile('mod', modJson),
  libraryFile('digital', digitalJson),
  libraryFile('devices', devicesJson),
  libraryFile('routing', routingJson),
  libraryFile('audio-banks', audioBanks),
  libraryFile('visuals', visualsCatalog)
];
