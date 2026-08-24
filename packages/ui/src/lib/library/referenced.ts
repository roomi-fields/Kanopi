// Referenced libraries — the resource libraries the ACTIVE program pulls in via
// its invocations. Surfaced read-only in the Files panel (FilesView), updated
// as the active file changes. NOT the demo catalogue.
//
// Source: bpscript / bp3 (`.bps`, `.gr`) — compileToBPxAST(contents) emits
// `.directives` (alphabet, tuning, scale, octaves, sound, devices) and
// `.actors` (each actor's engine + its `entityParams` — audio banks live there,
// `eval.strudel(bank:"dirt-samples")`) — read AS-IS.
// Anything else, parse errors, or compile throws → empty list (graceful).

import { compileBps, parseGr } from '../runtimes/compile-cache';
import { runtimeFromExt, isNonProgramFile } from '../workspace/types';

export interface ReferencedLib {
  /** resource type, matching RESOURCE_GROUPS.type where applicable. */
  type: string;
  /** display heading for the type (e.g. "alphabet", "audio bank"). */
  typeLabel: string;
  /** the referenced name/id (e.g. `arabic`, `maqam_rast`, `dirt-samples`). */
  name: string;
}

// A compileBPS directive (the fields we read; bpscript carries more).
interface BpsDirective {
  name: string;
  subkey: string | null;
  runtime: string | null;
  value: unknown;
}

// Invocation `name` → how to read its referenced resource name + display label.
// Universal dot canon (`.` names a component, `:` assigns a value; bpscript
// f35d069 rejects `:` on every component axis): `alphabet.<x>` / `tuning.<x>` /
// `scale.<x>` / `octaves.<x>` / `sound.<x>` / `out.<device>` put <x> in
// `subkey`. The `runtime` slot carries a `:value` (an output target like
// `alphabet.western:audio` → `audio`), never a resource name.
// `devices` (no subkey) means "the whole device library".
const DIRECTIVE_TYPES: Record<string, { type: string; typeLabel: string }> = {
  alphabet: { type: 'alphabet', typeLabel: 'alphabet' },
  tuning: { type: 'tuning', typeLabel: 'tuning' },
  temperament: { type: 'temperament', typeLabel: 'temperament' },
  scale: { type: 'scale', typeLabel: 'scale' },
  octaves: { type: 'octaves', typeLabel: 'octaves' },
  sound: { type: 'sound', typeLabel: 'sound' },
  // PAS de `transport` ici : `transport.<canal>` est SORTIE du langage (décision Romain
  // 2026-08-04, BPscript parser.js:1692) — la direction se déclare sur l'acteur, `out.<canal>`.
  // Une scène qui l'écrit encore ne compile plus : elle tombe donc dans le repli-texte, où
  // cette entrée l'aurait affichée comme un appareil valide au panneau des ressources.
  devices: { type: 'device', typeLabel: 'devices' },
  // `core` / `controls` / `filter` are bare module directives (no
  // sub-reference): they pull in a BPScript library — core grammar functions, the
  // control terminals (`vel:`/`wave:`…), the CV filter library (`filter.adsr(…)`).
  // They carry no name in subkey/runtime, so their own directive name IS the
  // referenced module — surfaced so the "libraries used" list shows them like any
  // other dependency.
  core: { type: 'module', typeLabel: 'module' },
  controls: { type: 'module', typeLabel: 'module' },
  filter: { type: 'module', typeLabel: 'module' }
};

// Bare module directives whose referenced name is the directive name itself.
const SELF_NAMED = new Set(['core', 'controls', 'filter']);

function nameOfDirective(d: BpsDirective): string | null {
  // Prefer subkey (`alphabet.arabic`, `tuning.sargam_22shruti`, `scale.bilaval`,
  // `out.midi`); the runtime fallback is defensive — under the universal dot
  // canon a resource name always lands in subkey, never the value slot.
  if (typeof d.subkey === 'string' && d.subkey.length > 0) return d.subkey;
  if (typeof d.runtime === 'string' && d.runtime.length > 0) return d.runtime;
  // A bare module directive (`core`, `controls`) names itself.
  if (SELF_NAMED.has(d.name)) return d.name;
  // `devices` with no name = the whole library.
  if (d.name === 'devices') return 'all';
  return null;
}

// An actor AST node (`actor <name> eval.<engine>(bank:"<bank>")`) — the bank
// is now an actor parameter, not a scene directive. Only the fields read here.
interface BpsActorNode {
  properties?: {
    eval?: string | null;
    entityParams?: Record<string, { bank?: unknown } & Record<string, unknown>>;
  };
}

// Parse-independent scan of the invocations straight from the text. Used as a
// fallback when the compiler can't build an AST at all (a hard syntax error
// elsewhere in the file, e.g. a malformed rule): the top-of-file lines are
// still perfectly readable and the "Libraries used" list must keep showing them.
//
// ⛔ CE QUI DÉLIMITE UNE INVOCATION, DEPUIS QUE L'AROBASE EST SORTIE DU LANGAGE (décision Romain
// 2026-08-17) : la POSITION, plus un préfixe. Les invocations vivent AVANT le premier `-----`, qui
// sépare le déclaratif de la production ; après lui, `alphabet` serait un nom de règle ordinaire.
// Sans cette borne, ce repli lirait une tête de règle comme une invocation — et `DIRECTIVE_TYPES`
// ne l'arrêterait pas, puisqu'une règle PEUT s'appeler `sound`.
function directivesFromText(contents: string): ReferencedLib[] {
  const out: ReferencedLib[] = [];
  const lignes = contents.split('\n');
  const fin = lignes.findIndex((l) => /^-{3,}\s*$/.test(l.trim()));
  for (const raw of fin >= 0 ? lignes.slice(0, fin) : lignes) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('//')) continue;
    // PAS de branche `library.<moteur> "<banque>"` : la directive est SUPPRIMÉE du langage
    // (décision Romain 2026-08-06, BPscript parser.js:1642) — la banque est un paramètre de
    // l'acteur, lu plus haut sur `entityParams.eval.bank`. Ce repli est précisément la voie
    // qui tourne sur une scène qui ne compile plus : la garder aurait affiché « audio bank »
    // pour une scène qui ne jouera aucun son. Le message du compilateur, lui, nomme déjà la
    // relève au voyant santé (programCompileStatus, phase `parse`).
    // `name(.subkey)?(:value)?` — e.g. `alphabet.western:audio`, `tuning.sargam_22shruti`.
    const m = /^(\w+)(?:\.([\w-]+))?(?::\s*(\S+))?\s*(?:\/\/.*)?$/.exec(line);
    if (!m) continue;
    const meta = DIRECTIVE_TYPES[m[1]];
    if (!meta) continue;
    const name = nameOfDirective({
      name: m[1],
      subkey: m[2] ?? null,
      runtime: m[3] ?? null,
      value: null
    });
    if (!name) continue;
    out.push({ type: meta.type, typeLabel: meta.typeLabel, name });
  }
  return dedupe(out);
}

function fromBps(contents: string): ReferencedLib[] {
  const out: ReferencedLib[] = [];
  // The AST's `directives` (single source of truth) carry the resource
  // directives (alphabet, tuning, …); audio banks are read separately off
  // `.actors` (below) — the bank is an actor parameter, not a directive.
  // `compileBPS().directives` is `ast.directives`, so we read the AST here too.
  let c: {
    errors?: unknown[];
    ast?: {
      directives?: (BpsDirective & { type?: string })[];
      actors?: BpsActorNode[];
    } | null;
  };
  try {
    c = compileBps(contents) as typeof c;
  } catch {
    return out;
  }
  // ⛔ CE COMMENTAIRE DÉCRIVAIT UN CHEMIN QUE LE CODE N'EMPRUNTE PAS. Il disait « l'arbre est
  // quand même produit » sur une scène en erreur, et donc que cette boucle tenait le panneau
  // « Libraries used » vivant pendant qu'on corrige une faute. MESURÉ le 2026-08-24 sur la porte
  // vive de BPscript : 321 scènes du corpus, dont 12 en erreur, PLUS cinq états de frappe d'une
  // même scène (entière, coupée en deux, dernière ligne tronquée, mot inconnu ajouté, parenthèse
  // laissée ouverte) — l'arbre est `null` DANS TOUS LES CAS où des erreurs sortent. Zéro arbre
  // accompagné de ses erreurs.
  // ⇒ CE QUI TIENT RÉELLEMENT LE PANNEAU pendant une erreur est le repli textuel plus bas, jamais
  //   cette boucle. Elle ne sert que la scène qui compile.
  // La décision de Romain du 2026-08-24 — « on ne produit un arbre que s'il est correct et complet,
  // sinon on produit une erreur » — fige ce comportement ; elle ne me retire rien.
  const directives = c.ast?.directives ?? [];
  for (const d of directives) {
    const meta = DIRECTIVE_TYPES[d.name];
    if (!meta) continue;
    const name = nameOfDirective(d);
    if (!name) continue;
    out.push({ type: meta.type, typeLabel: meta.typeLabel, name });
  }

  // Audio banks: each actor's `eval.<engine>(bank:"dirt-samples")` param. The
  // engine isn't a resource type the user browses; the bank name is what
  // matters. Read off the AST actor nodes (the bank is an actor parameter now,
  // not a scene directive) — deduped below (several actors commonly declare the
  // same bank).
  for (const actor of c.ast?.actors ?? []) {
    const bank = actor.properties?.entityParams?.eval?.bank;
    if (typeof bank !== 'string' || bank.length === 0) continue;
    out.push({ type: 'audio-bank', typeLabel: 'audio bank', name: bank });
  }

  // No AST (hard syntax error) → the directive loop found nothing. Fall back to a
  // text scan so the libraries stay visible while the error is fixed.
  if (out.length === 0) return directivesFromText(contents);

  return dedupe(out);
}

function dedupe(libs: ReferencedLib[]): ReferencedLib[] {
  const seen = new Set<string>();
  const out: ReferencedLib[] = [];
  for (const l of libs) {
    const key = `${l.type}:${l.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/**
 * The resource libraries referenced by the active file. Pure — call from a
 * `$derived` so it re-runs on file/content change. Non-program files, parse
 * errors, or compile throws → empty list.
 */
export function referencedLibraries(
  fileName: string | undefined,
  contents: string | undefined
): ReferencedLib[] {
  if (!fileName || contents === undefined) return [];
  const runtime = runtimeFromExt(fileName);
  if (runtime === 'bpscript' || runtime === 'bp3') return fromBps(contents);
  return [];
}

export interface CompileStatus {
  /** Whether this file type is one we compile (bps/bp3); false → no indicator. */
  applicable: boolean;
  /** True when the program PARSES, DERIVES, its declared RESOURCES resolve, and no
   *  voice is currently erroring at RUNTIME — the 3-signal health voyant (decision
   *  2026-07-15-voyant-sante-niveau3.md). */
  ok: boolean;
  /** Errors (line + message), empty when ok. */
  errors: { line?: number; message: string }[];
  /** Which stage failed: parse errors, a derivation throw at eval time, an unresolved
   *  declared resource (bank/…), or a live runtime error from a code voice. Lets the
   *  chip say "derive error" / "resource error" / "runtime error" — fail-loud, never
   *  a misleading green "compiles". */
  phase?: 'parse' | 'derive' | 'resource' | 'runtime';
}

/** The last derivation outcome of the file, as recorded by the eval pipeline
 *  (`deriveStatus.for(...)`). `null` = never derived or stale since the last edit. */
export interface DeriveOutcomeView {
  ok: boolean;
  error?: { line?: number; message: string };
}

/** The last resource-resolution outcome of the file, as recorded by the eval pipeline
 *  (`resourceStatus.for(...)`). `null` = never checked or stale since the last edit. */
export interface ResourceOutcomeView {
  ok: boolean;
  errors: { message: string }[];
}

// Loosely-typed compile error from compileToBPxAST.
interface BpsError {
  line?: number;
  message?: string;
}

/**
 * Compile status of the active program — drives a clear pass/fail indicator in
 * the UI (Files panel). Pure; call from a `$derived`. `.bps` and `.gr` are both
 * "applicable": `.bps` status comes from `compileToBPxAST` (`compileBps`), `.gr`
 * is native BP3 grammar parsed by the REAL BP3 front-end, `parseBP3` (`parseGr`,
 * memoized like `compileBps`) — running the BPScript transpiler on a `.gr` would
 * report a FALSE error, so `.gr` never goes through `compileBps`.
 *
 * `derive` is the last DERIVATION outcome recorded by the eval pipeline (msg [598]).
 * A scene can PARSE cleanly yet throw at `derive()` (an unresolvable pitch, …); the
 * chip must be fail-loud, not a green "compiles" over a scene that never sounds. So
 * a passing parse + a failed derive → not ok. `null`/undefined derive (never
 * evaluated, or stale since the last edit) leaves the status at parse-only.
 *
 * `resource` (signal 2) and `runtimeErrors` (signal 3) extend the same fail-loud
 * contract (decision 2026-07-15-voyant-sante-niveau3.md): a scene that parses AND
 * derives can still declare a resource the host's catalog doesn't know (`eval.
 * strudel(bank:"typo")`) or have a code voice currently throwing at runtime ("sound not
 * found"). Priority when several signals fail: parse, then derive, then resource,
 * then runtime — parse always wins (nothing downstream is trustworthy without it).
 */
export function programCompileStatus(
  fileName: string | undefined,
  contents: string | undefined,
  derive?: DeriveOutcomeView | null,
  path?: string,
  resource?: ResourceOutcomeView | null,
  runtimeErrors?: { message: string }[]
): CompileStatus {
  if (!fileName || contents === undefined) return { applicable: false, ok: true, errors: [] };
  // A data file (`libraries/…` personal catalog OR `resources/…` factory catalog
  // entry) is never a program — no BPScript parse, no compile chip (decision
  // 2026-07-13-invocation-librairies-factory-mine.md).
  if (isNonProgramFile(path)) return { applicable: false, ok: true, errors: [] };
  const runtime = runtimeFromExt(fileName);
  if (runtime !== 'bpscript' && runtime !== 'bp3') {
    return { applicable: false, ok: true, errors: [] };
  }
  try {
    const c =
      runtime === 'bp3'
        ? (parseGr(contents) as { errors?: BpsError[] })
        : (compileBps(contents) as { errors?: BpsError[] });
    const parseErrors = (c.errors ?? []).map((e) => ({
      line: e.line,
      message: e.message ?? 'error'
    }));
    if (parseErrors.length > 0)
      return { applicable: true, ok: false, errors: parseErrors, phase: 'parse' };
    // Parse clean → the derivation outcome (if the pipeline recorded one for THIS
    // content) decides. A derive throw reads red with the engine's message.
    if (derive && !derive.ok)
      return {
        applicable: true,
        ok: false,
        errors: [derive.error ?? { message: 'derivation failed' }],
        phase: 'derive'
      };
    // Signal 2 — a declared resource (audio bank, …) the host's catalog can't
    // resolve. Recorded by the SAME eval attempt as `derive` (blocks.svelte.ts).
    if (resource && !resource.ok)
      return {
        applicable: true,
        ok: false,
        errors: resource.errors.length > 0 ? resource.errors : [{ message: 'resource unresolved' }],
        phase: 'resource'
      };
    // Signal 3 — a code voice of THIS file is currently erroring at runtime
    // (openBlocks.errored, continuously reactive — not tied to the last eval).
    if (runtimeErrors && runtimeErrors.length > 0)
      return { applicable: true, ok: false, errors: runtimeErrors, phase: 'runtime' };
    return { applicable: true, ok: true, errors: [] };
  } catch (e) {
    return { applicable: true, ok: false, errors: [{ message: String(e) }], phase: 'parse' };
  }
}
