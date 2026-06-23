// Referenced libraries — the resource libraries the ACTIVE program pulls in via
// its `@` directives. Surfaced read-only in the Files panel (FilesView), updated
// as the active file changes. NOT the demo catalogue.
//
// Source: bpscript / bp3 (`.bps`, `.gr`) — compileToBPxAST(contents) emits
// `.directives` (alphabet, tuning, scale, octaves, sound, transport/devices),
// `.libraries` (audio banks per engine) and `.alphabet` — read AS-IS.
// Anything else, parse errors, or compile throws → empty list (graceful).

import { compileBps } from '../runtimes/compile-cache';
import { runtimeFromExt } from '../workspace/types';

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
// `@alphabet.<x>` puts <x> in `subkey`; `@tuning:<x>` / `@scale:<x>` put <x> in
// `runtime`; `@octaves.<x>` / `@sound.<x>` / `transport.<device>` use `subkey`.
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
  // Prefer subkey (`@alphabet.arabic`, `@octaves.western`, `transport.midi`),
  // fall back to runtime (`@tuning:maqam_rast`, `@scale:bilaval`).
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
    // `@name(.subkey)?(:value)?` — e.g. `@alphabet.western:browser`, `@tuning:maqam_rast`.
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
  /** True when the program compiles with no errors. */
  ok: boolean;
  /** Compile errors (line + message), empty when ok. */
  errors: { line?: number; message: string }[];
}

// Loosely-typed compile error from compileToBPxAST.
interface BpsError {
  line?: number;
  message?: string;
}

/**
 * Compile status of the active program — drives a clear pass/fail indicator in
 * the UI (Files panel). Pure; call from a `$derived`. Only `.bps` is "applicable":
 * its status comes from `compileToBPxAST`. `.gr` is native BP3 grammar parsed by
 * `parseBP3` (different validator, needs alphabet plumbing) — running the BPScript
 * transpiler on it would report a FALSE error, so `.gr` shows no chip for now.
 */
export function programCompileStatus(
  fileName: string | undefined,
  contents: string | undefined
): CompileStatus {
  if (!fileName || contents === undefined) return { applicable: false, ok: true, errors: [] };
  const runtime = runtimeFromExt(fileName);
  if (runtime !== 'bpscript') {
    return { applicable: false, ok: true, errors: [] };
  }
  try {
    const c = compileBps(contents) as { errors?: BpsError[] };
    const errors = (c.errors ?? []).map((e) => ({ line: e.line, message: e.message ?? 'error' }));
    return { applicable: true, ok: errors.length === 0, errors };
  } catch (e) {
    return { applicable: true, ok: false, errors: [{ message: String(e) }] };
  }
}
