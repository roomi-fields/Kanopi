// Referenced libraries — the resource libraries the ACTIVE program pulls in via
// its `@` directives. Surfaced read-only in the Files panel (FilesView), updated
// as the active file changes. NOT the demo catalogue.
//
// Source: bpscript / bp3 (`.bps`, `.gr`) — compileToBPxAST(contents) emits
// `.directives` (alphabet, tuning, scale, octaves, sound, transport/devices),
// `.libraries` (audio banks per engine) and `.alphabet` — read AS-IS.
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

// Directive `@name` → how to read its referenced resource name + display label.
// Universal dot canon (`.` names a component, `:` assigns a value; bpscript
// f35d069 rejects `:` on every component axis): `@alphabet.<x>` / `@tuning.<x>` /
// `@scale.<x>` / `@octaves.<x>` / `@sound.<x>` / `transport.<device>` put <x> in
// `subkey`. The `runtime` slot carries a `:value` (an output target like
// `@alphabet.western:audio` → `audio`), never a resource name.
// `@devices` (no subkey) means "the whole device library".
const DIRECTIVE_TYPES: Record<string, { type: string; typeLabel: string }> = {
  alphabet: { type: 'alphabet', typeLabel: 'alphabet' },
  tuning: { type: 'tuning', typeLabel: 'tuning' },
  temperament: { type: 'temperament', typeLabel: 'temperament' },
  scale: { type: 'scale', typeLabel: 'scale' },
  octaves: { type: 'octaves', typeLabel: 'octaves' },
  sound: { type: 'sound', typeLabel: 'sound' },
  transport: { type: 'device', typeLabel: 'device' },
  devices: { type: 'device', typeLabel: 'devices' },
  // `@core` / `@controls` / `@filter` are bare module directives (no
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
  // Prefer subkey (`@alphabet.arabic`, `@tuning.sargam_22shruti`, `@scale.bilaval`,
  // `transport.midi`); the runtime fallback is defensive — under the universal dot
  // canon a resource name always lands in subkey, never the value slot.
  if (typeof d.subkey === 'string' && d.subkey.length > 0) return d.subkey;
  if (typeof d.runtime === 'string' && d.runtime.length > 0) return d.runtime;
  // A bare module directive (`@core`, `@controls`) names itself.
  if (SELF_NAMED.has(d.name)) return d.name;
  // `@devices` with no name = the whole library.
  if (d.name === 'devices') return 'all';
  return null;
}

// A `LibraryDirective` AST node (`@library.<engine> "<bank>"`).
interface LibraryDirectiveNode {
  type: 'LibraryDirective';
  engine: string;
  name: string;
}

// Parse-independent scan of `@` directives straight from the text. Used as a
// fallback when the compiler can't build an AST at all (a hard syntax error
// elsewhere in the file, e.g. a malformed rule): the top-of-file `@` lines are
// still perfectly readable and the "Libraries used" list must keep showing them.
function directivesFromText(contents: string): ReferencedLib[] {
  const out: ReferencedLib[] = [];
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('@')) continue;
    // Audio bank: `@library.<engine> "<bank>"`.
    const bank = /^@library\.\w+\s+"([^"]+)"/.exec(line);
    if (bank) {
      out.push({ type: 'audio-bank', typeLabel: 'audio bank', name: bank[1] });
      continue;
    }
    // `@name(.subkey)?(:value)?` — e.g. `@alphabet.western:audio`, `@tuning.sargam_22shruti`.
    const m = /^@(\w+)(?:\.([\w-]+))?(?::\s*(\S+))?/.exec(line);
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
  // The AST's `directives` (single source of truth) carry BOTH the resource
  // directives (alphabet, tuning, …) and the `LibraryDirective` audio-bank nodes.
  // `compileBPS().directives` is `ast.directives`, so we read the AST here too.
  let c: { errors?: unknown[]; ast?: { directives?: (BpsDirective & { type?: string })[] } | null };
  try {
    c = compileBps(contents) as typeof c;
  } catch {
    return out;
  }
  // Read directives even when the program has errors: the `@` directives sit at
  // the top of the file and a downstream error (e.g. an invalid control value)
  // doesn't invalidate them. The AST is still produced — only a hard parse throw
  // (caught above) leaves no AST. This keeps "Libraries used" visible while a
  // compile error is being fixed.
  const directives = c.ast?.directives ?? [];
  for (const d of directives) {
    const meta = DIRECTIVE_TYPES[d.name];
    if (!meta) continue;
    const name = nameOfDirective(d);
    if (!name) continue;
    out.push({ type: meta.type, typeLabel: meta.typeLabel, name });
  }

  // Audio banks: each `LibraryDirective` node (`@library.strudel "dirt-samples"`).
  // The engine isn't a resource type the user browses; the bank name is what
  // matters. Read off the AST nodes instead of compileBPS's `libraries` sidecar.
  for (const d of directives) {
    if (d.type !== 'LibraryDirective') continue;
    const node = d as unknown as LibraryDirectiveNode;
    out.push({ type: 'audio-bank', typeLabel: 'audio bank', name: node.name });
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
 * derives can still declare a resource the host's catalog doesn't know (`@library.
 * strudel "typo"`) or have a code voice currently throwing at runtime ("sound not
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
