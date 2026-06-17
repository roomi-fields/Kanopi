// Referenced libraries — the resource libraries the ACTIVE program pulls in via
// its `@` directives. Surfaced read-only in the Files panel (FilesView), updated
// as the active file changes. NOT the demo catalogue.
//
// Two sources, depending on the active file's runtime:
//   - bpscript / bp3 (`.bps`, `.gr`): compileBPS(contents) emits `.directives`
//     (alphabet, tuning, scale, octaves, sound, transport/devices), `.libraries`
//     (audio banks per engine) and `.alphabet` — read AS-IS.
//   - `.kanopi` session: parseSession(contents) emits `@library <id>` audio-bank
//     nodes.
// Anything else, parse errors, or compile throws → empty list (graceful).

import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { parseSession } from '../session';
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
  devices: { type: 'device', typeLabel: 'devices' }
};

function nameOfDirective(d: BpsDirective): string | null {
  // Prefer subkey (`@alphabet.arabic`, `@octaves.western`, `transport.midi`),
  // fall back to runtime (`@tuning:maqam_rast`, `@scale:bilaval`).
  if (typeof d.subkey === 'string' && d.subkey.length > 0) return d.subkey;
  if (typeof d.runtime === 'string' && d.runtime.length > 0) return d.runtime;
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

function fromBps(contents: string): ReferencedLib[] {
  const out: ReferencedLib[] = [];
  // The AST's `directives` (single source of truth) carry BOTH the resource
  // directives (alphabet, tuning, …) and the `LibraryDirective` audio-bank nodes.
  // `compileBPS().directives` is `ast.directives`, so we read the AST here too.
  let c: { errors?: unknown[]; ast?: { directives?: (BpsDirective & { type?: string })[] } | null };
  try {
    c = compileBPS(contents) as typeof c;
  } catch {
    return out;
  }
  if (c.errors && c.errors.length > 0) return out;

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

  return dedupe(out);
}

function fromSession(contents: string): ReferencedLib[] {
  const out: ReferencedLib[] = [];
  let result: ReturnType<typeof parseSession>;
  try {
    result = parseSession(contents);
  } catch {
    return out;
  }
  // The session resolver collects `@library <id>` declarations into `.libraries`.
  for (const id of result.libraries) {
    out.push({ type: 'audio-bank', typeLabel: 'audio bank', name: id });
  }
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
  if (runtime === 'kanopi') return fromSession(contents);
  return [];
}
