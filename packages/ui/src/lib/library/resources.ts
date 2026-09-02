// Resource libraries — the catalogs a program draws on (NOT the demo/scene
// catalogue in LibrarySpace). Read-only browse for the "Resources" activity view
// (also reused, as-is, for Factory's "Libraries" section — ESPACE_PERSO_SPEC §10.3).
//
// Two sources, glued here:
//   - bpscript's libraries, read as OBJETS through its `objets` door — one family per
//     invocation word (`alphabet`, `tuning`, `scale`…), each entry the object the
//     library declares. Consumed AS-IS, never re-read from the package's file table.
//   - Kanopi's own catalogs (audio banks, visuals, devices) — already parsed by
//     their existing modules; reused, never re-read.
//
// ⛔ LA PORTE DES OBJETS REMPLACE LA TABLE DE FICHIERS, ET C'EST LA DÉCISION DU 2026-09-02
// (`la-structure-des-objets-suffit-les-cablages-1-et-2-se-font-par-la-phase-5`). Ce fichier lisait
// sept clés de `bpscript/libs-data` — `LIBS.alphabets`, `…tunings`, `…temperaments`, `…scales`,
// `…octaves`, `…core`, `…digital` — c'est-à-dire des NOMS DE FICHIER amont, quand une scène invoque
// par le MOT que la librairie déclare (`alphabet`, non `alphabets` ; `function`, non `digital`).
// Trois choses meurent avec cette table, et rien ne les remplace parce que rien n'en a plus besoin :
//   · le filtre « une entrée est un objet, un champ de sommet est une chaîne ou un tableau » — la
//     porte rend `entrees: Objet[]`, une population sans champ de sommet à écarter. Ce filtre a
//     laissé passer `resolves` (2026-08-10) puis `apporte` (2026-08-31) sans qu'un rouge le dise ;
//     sa disparition est la seule forme qui ne peut plus rouvrir ce trou ;
//   · les catalogues disparus dont ce fichier tenait la chronique (`controls` fusionné dans `core`
//     le 2026-08-10, `mod` archivé le 2026-08-23) — la porte ne les sert pas, donc ils n'existent
//     pas ici, sans qu'une ligne ait à le dire ;
//   · l'adresse qui rend `undefined` en silence : `famille()` rend `null` sur un mot inconnu, et
//     `familleOuCrie` en fait une exception AU CHARGEMENT DU MODULE — un mot que l'amont retire
//     fait rougir tout banc qui importe ce fichier, au lieu d'afficher une carte vide.
//
// ⚠️ `sound` était écrit `[]` À LA MAIN — une absence inventée. La synthèse de percussion est sortie
// de Kanopi (RA-6), mais la librairie `sound` existe chez l'amont et la porte la sert ; ce que le
// langage déclare s'affiche, ce que l'hôte ne joue plus n'est pas un motif pour le cacher.

import { famille, type Famille, type Objet } from 'bpscript/objets';
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
  /** the entry as its source declares it — opened read-only as formatted JSON. */
  data: unknown;
}

export interface ResourceGroup {
  /** group key, also used to match a referenced library's type. */
  type: string;
  /** display heading. */
  title: string;
  entries: ResourceEntry[];
}

/** Une famille par son mot d'invocation — et un mot que la porte ne sert pas est une EXCEPTION,
 *  jamais une liste vide. C'est le mode d'échec que bpscript a nommé le 2026-08-30 (« tout code qui
 *  lit une adresse retirée rend `undefined`, sans erreur ») et que `LIBS.mod` avait déjà joué ici :
 *  une carte affichée sur un catalogue absent, sans un rouge. */
function familleOuCrie(mot: string): Famille {
  const f = famille(mot);
  if (f === null)
    throw new Error(
      `la porte des objets de bpscript ne sert aucune famille « ${mot} » — l'amont l'a retirée ou ` +
        'renommée. Corriger le MOT, jamais afficher une carte vide.'
    );
  return f;
}

/** Le libellé court d'un objet, lu dans ce qu'il déclare : sa description, ou sa culture pour les
 *  gammes. Aucune prose inventée — un objet qui n'en porte pas montre son seul nom. */
function libelle(membres: Record<string, unknown>): string | undefined {
  const { description, culture } = membres;
  if (typeof description === 'string') return description;
  if (typeof culture === 'string') return culture;
  return undefined;
}

/** Une entrée par objet de la famille — l'objet entier est la donnée ouverte en lecture seule :
 *  son nom, ce dont il dérive, ses membres, sa place, sa chaîne d'invocation. */
function entreeDObjet(o: Objet): ResourceEntry {
  return { id: o.nom, label: libelle(o.membres), data: o };
}

function groupeDeFamille(mot: string, title: string): ResourceGroup {
  return { type: mot, title, entries: familleOuCrie(mot).entrees.map(entreeDObjet) };
}

/** All resource libraries, grouped by type. Computed once at module load. */
export const RESOURCE_GROUPS: ResourceGroup[] = [
  // `core` s'invoque NU — il apporte le socle (LANGUAGE.md § « Invoquer »). Ce qu'une scène
  // référence est donc la famille entière, sous son propre nom : une entrée `core` dont la
  // donnée est la famille, comme `devices` référence toute la librairie sous `all`.
  {
    type: 'core',
    title: 'Core (socle)',
    entries: [
      (() => {
        const f = familleOuCrie('core');
        return { id: f.nom, label: libelle(f.membres), data: f };
      })()
    ]
  },
  groupeDeFamille('alphabet', 'Alphabets'),
  groupeDeFamille('tuning', 'Tunings'),
  groupeDeFamille('temperament', 'Temperaments'),
  groupeDeFamille('scale', 'Scales'),
  groupeDeFamille('octaves', 'Octaves'),
  groupeDeFamille('sound', 'Sounds'),
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
// RESOURCE_GROUPS above splits each family into one card per NAMED entry
// inside it (`western`, `sargam`… are entries INSIDE the `alphabet` family) — kept
// only because NowView's "Libraries used" panel must open the ONE entry a
// scene actually references (`alphabet.western` → just that object).
//
// Factory's "Libraries" browser is a different concern: it lists the real
// libraries a language ships. Previous cut grouped by "who ships the file"
// (bpscript/lib vs Kanopi's own) — two groups, too coarse once bp3/strudel/
// mercury/hydra/p5 each got their own real, separately-browsable entries.
// Grouping is now by LANGUAGE: which language's catalog a card belongs to —
// a real fact per source (which import/registry it came from), same class of
// "this is our own data, we may name it" reasoning the old `domainOverride`
// already used for Kanopi's own catalogs ([726]):
//   - `bpscript` — the upstream families, one card per INVOCATION WORD (the
//     word a scene writes — `alphabet`, `tuning`, `function`… — never the name
//     of the file that happens to carry it).
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

/** A whole-file card (Kanopi's own catalogs): id doubles as the display name,
 *  description read straight off the file's own content. */
function libraryFile(id: string, data: unknown, language: string): LibraryFile {
  return { id, name: id, description: describeFile(data), language, data };
}

/** One card per upstream FAMILY, under the word a scene invokes it by. The
 *  family — its root members and every object it declares — is the content. */
function carteDeFamille(mot: string): LibraryFile {
  const f = familleOuCrie(mot);
  return { id: f.nom, name: f.nom, description: libelle(f.membres), language: 'bpscript', data: f };
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

/** One card per REAL library (Factory › Libraries browser), grouped by
 *  LANGUAGE. `core` is EXCLUDED (architecte [726]): it is the LANGUAGE
 *  SCHEMA (core: base defaults + reserved vocabulary), NOT a browsable
 *  library. It stays in RESOURCE_GROUPS above for NowView (a scene that
 *  references core still surfaces it as "used"). */
export const RESOURCE_FILES: LibraryFile[] = [
  // bpscript — one card per family, under its invocation word.
  carteDeFamille('alphabet'),
  carteDeFamille('tuning'),
  carteDeFamille('temperament'),
  carteDeFamille('scale'),
  carteDeFamille('octaves'),
  carteDeFamille('function'),
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
