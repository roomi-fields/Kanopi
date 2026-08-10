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
// BPScript language modules (`@core` + the `mod` CV lib): real library files with
// browsable content (core symbols/settings, CV objects + their declarative curves).
// Imported AS-IS so opening one shows it.
//
// ⚠️ `controls` A DISPARU DE LA LISTE LE 2026-08-10, ET SON FICHIER AVEC : bpscript a fusionné
// `@controls` dans `@core` et supprimé `lib/controls.json` (leur 647df04, ordre de Romain). Ce
// n'est pas une entrée retirée de l'affichage — c'est un module qui n'existe plus dans le langage.
// L'exposer encore montrerait une forme que le langage a retirée, et c'est précisément ce que le
// backlog KAN-42 reproche à 203 scènes.
import coreJson from 'bpscript/lib/core.json';
import modJson from 'bpscript/lib/mod.json';
// Digital functions library (transpose &c., KAI-B03's twin of mod.json) — a real
// browsable bpscript library file, same as the others above.
import digitalJson from 'bpscript/lib/digital.json';

import { guestLibraries, type GuestLibrary } from 'runtime-codevoices';
import { visualsCatalog } from './visuals';
import type { VisualItem } from './visuals';
import { listDevices } from '../devices/registry';
// Kanopi's own bundled catalogs — real files, read AS-IS (not the `listDevices()`
// merge, which adds a computed default-midi entry not present in the file).
import devicesJson from '../../../../library/devices.json';
import routingJson from '../../../../library/routing.json';
// BP3 auxiliary settings files (-se.<name>), bundled + keyed by reference name —
// the SAME source the bp3 adapter reads for engine timing (bp3-aux.ts). Reused
// here verbatim for Factory's Libraries browser, never re-copied.
import { BUNDLED_SE } from '../runtimes/bp3-aux';

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
    entries: [moduleEntry('core', coreJson), moduleEntry('mod', modJson)]
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
    entries: guestLibraries
      .filter((l) => l.declarable)
      .map((l) => ({ id: l.id, label: l.source || l.label, data: l }))
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

// --- Real library FILES, grouped BY LANGUAGE (Romain/architecte 2026-07-16) ---
//
// RESOURCE_GROUPS above splits each catalog file into one card per NAMED entry
// inside it (`western`, `sargam`… are entries INSIDE alphabets.json) — kept
// only because NowView's "Libraries used" panel must open the ONE entry a
// scene actually references (`@alphabet.western` → just that sub-object).
//
// Factory's "Libraries" browser is a different concern: it lists the real
// FILES/entries a language ships. Previous cut grouped by "who ships the file"
// (bpscript/lib vs Kanopi's own) — two groups, too coarse once bp3/strudel/
// mercury/hydra/p5 each got their own real, separately-browsable entries.
// Grouping is now by LANGUAGE: which language's catalog a card belongs to —
// a real fact per source (which import/registry it came from), same class of
// "this is our own data, we may name it" reasoning the old `domainOverride`
// already used for Kanopi's own catalogs ([726]):
//   - `bpscript` — the upstream BPScript pitch/function catalogs (one card per
//     whole file, as before).
//   - `bp3`      — one card per `-se.<name>` auxiliary settings file bundled
//     for the BP3 grammars (BUNDLED_SE, reused verbatim from bp3-aux.ts).
//   - `strudel` / `mercury` — one card per `guestLibraries` entry, grouped by
//     the entry's own `engine` field (a real declared fact, not invented).
//   - `hydra` / `p5` / `mercury` / `csound` — one card per visualsCatalog
//     item, grouped by the item's own `runtimes` field. The catalog turns out
//     to carry snippets for four runtimes, not just hydra/p5 — csound wasn't
//     anticipated going in; it gets its own honest group rather than being
//     folded into an existing one.
//   - `kanopi`   — the catalogs Kanopi itself ships (devices, OSC routing).
export interface LibraryFile {
  /** file/entry id (no extension) — also the card title and the path segment. */
  id: string;
  /** display name — the id for whole-file cards, a nicer label when the source has one (guestLibraries/visualsCatalog). */
  name: string;
  /** short description, read from the source's own `description`/`type`/`_comment`/`header` — absent if it carries none (shows just the name then). */
  description?: string;
  /** rail grouping key = the LANGUAGE this card belongs to (bpscript, bp3, strudel, mercury, hydra, p5, csound, kanopi) — a real fact per source, never an invented taxonomy. */
  language: string;
  /** the entry's parsed content — opened read-only, verbatim. */
  data: unknown;
}

/** Pulls a one-line description straight from the file's own content, in order
 * of preference: a `description` string, the first line of an array
 * `_comment`, a string `_comment`, the first line of a `header` string (BP3
 * `-se` files), else the `type` field. No invented prose — a file carrying
 * none of these shows just its name. */
function describeFile(json: unknown): string | undefined {
  const j = json as
    | { description?: unknown; type?: unknown; _comment?: unknown; header?: unknown }
    | null
    | undefined;
  if (!j || typeof j !== 'object') return undefined;
  if (typeof j.description === 'string') return j.description;
  if (Array.isArray(j._comment) && typeof j._comment[0] === 'string') return j._comment[0];
  if (typeof j._comment === 'string') return j._comment;
  if (typeof j.header === 'string') return j.header.split('\n')[0];
  if (typeof j.type === 'string') return j.type;
  return undefined;
}

/** A whole-file card (bpscript catalogs, Kanopi's own catalogs): id doubles as
 *  the display name, description read straight off the file's own content. */
function libraryFile(id: string, data: unknown, language: string): LibraryFile {
  return { id, name: id, description: describeFile(data), language, data };
}

/** One card per bundled BP3 `-se.<name>` auxiliary settings file — same source
 *  the bp3 adapter reads (BUNDLED_SE), reused verbatim, never re-copied. Most
 *  bundled files are JSON; a few (`Djinns`, `doeslittle`, `MyMelody`, `Rajeev`,
 *  `tryRotate`) are the legacy BP2.8 plain-text settings format (one value per
 *  line, `.json` extension kept only as bp3-aux's lookup key) — parseable by
 *  the upstream BP3 parser, not by `JSON.parse`. Card shows the parsed object
 *  when the source IS JSON; falls back to the raw text verbatim otherwise
 *  (never invented structure). */
function bp3AuxFile(refName: string, rawJson: string): LibraryFile {
  const id = `se.${refName}`;
  try {
    const data = JSON.parse(rawJson);
    return { id, name: id, description: describeFile(data), language: 'bp3', data };
  } catch {
    const firstLine = rawJson.split('\n')[0];
    const description = firstLine.startsWith('//') ? firstLine.slice(2).trim() : undefined;
    return { id, name: id, description, language: 'bp3', data: rawJson };
  }
}

/** One card per `guestLibraries` entry — grouped by its own `engine` field
 *  (`strudel`/`mercury`), a real declared fact from the source of truth. */
function guestLibraryFile(l: GuestLibrary): LibraryFile {
  return { id: l.id, name: l.label, description: l.description, language: l.engine, data: l };
}

/** One card per `visualsCatalog` item — grouped by its own `runtimes` field
 *  (hydra/p5/mercury/csound today). Items in the catalog target exactly one
 *  runtime each; if a future item targets several, it groups under the first. */
function visualFile(v: VisualItem): LibraryFile {
  return { id: v.id, name: v.name, description: v.description, language: v.runtimes[0], data: v };
}

/** One card per REAL library file/entry (Factory › Libraries browser), grouped
 *  by LANGUAGE. `core.json` is EXCLUDED (architecte [726]): it is the LANGUAGE
 *  SCHEMA (@core: base defaults + reserved vocabulary), NOT a browsable
 *  library. It stays in RESOURCE_GROUPS below for NowView (a scene that
 *  references @core still surfaces it as "used"). */
export const RESOURCE_FILES: LibraryFile[] = [
  // bpscript — language pitch/function catalogs.
  libraryFile('alphabets', alphabetsJson, 'bpscript'),
  libraryFile('tunings', tuningsJson, 'bpscript'),
  libraryFile('temperaments', temperamentsJson, 'bpscript'),
  libraryFile('scales', scalesJson, 'bpscript'),
  libraryFile('octaves', octavesJson, 'bpscript'),
  libraryFile('mod', modJson, 'bpscript'),
  libraryFile('digital', digitalJson, 'bpscript'),
  // bp3 — one card per bundled `-se.<name>` auxiliary settings file.
  ...Object.entries(BUNDLED_SE).map(([name, raw]) => bp3AuxFile(name, raw)),
  // strudel + mercury — one card per guestLibraries entry (engine = language).
  ...guestLibraries.map(guestLibraryFile),
  // hydra + p5 + mercury + csound — one card per visualsCatalog item.
  ...visualsCatalog.items.map(visualFile),
  // kanopi — the host's own catalogs.
  libraryFile('devices', devicesJson, 'kanopi'),
  libraryFile('routing', routingJson, 'kanopi')
];
