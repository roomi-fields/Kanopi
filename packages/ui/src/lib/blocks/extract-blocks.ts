import type { Runtime } from '../core-mock';

/**
 * A named, runnable chunk of code extracted from a file.
 * The panel Actors lists one entry per block detected in every open file.
 *
 * Detection rules (in priority order):
 *  1. Native slot syntax (Strudel `$:`, Tidal `dN`, Hydra `oN`, SC `~x`).
 *  2. Top-level assignment (`const foo = …`, `let foo = …`, `foo = …`).
 *  3. Positional fallback — the block is delimited by blank lines and gets
 *     a stable index name like `#1`, `#2`.
 *
 * Kanopi does NOT add directives, magic comments, or any non-native syntax
 * to the source: every detection rule is valid pure syntax of the target
 * runtime, so a file written for Kanopi still runs verbatim in its native
 * environment (strudel.cc, atom-tidalcycles, hydra-editor, scide…).
 */
export interface CodeBlock {
  /** Short name: `drums`, `$0`, `d1`, `o2`, `#1`. NOT prefixed by the file. */
  name: string;
  /** Where the name was derived from — drives panel affordances and dim styling. */
  kind: 'slot' | 'assign' | 'positional';
  /** Absolute offsets into the source file. `from..to` is what Ctrl+Enter would eval. */
  from: number;
  to: number;
}

export function extractBlocks(code: string, runtime: Runtime): CodeBlock[] {
  switch (runtime) {
    case 'strudel':
    case 'tidal':
      return extractStrudelOrTidal(code, runtime);
    case 'hydra':
      return extractHydra(code);
    case 'sc':
      return extractSuperCollider(code);
    case 'js':
      return extractJavascript(code);
    default:
      return extractPositional(code);
  }
}

/* ---------------------------------------------------------------- positional */

function splitBlocks(code: string): { from: number; to: number; text: string }[] {
  // Blank-line-separated chunks. Whitespace-only lines count as blank.
  const blocks: { from: number; to: number; text: string }[] = [];
  const lines = code.split('\n');
  let cursor = 0;
  let blockStart = -1;
  let blockText = '';
  let blockFromOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineFrom = cursor;
    cursor += line.length + 1; // +1 for \n (last line has no \n but it doesn't matter)
    if (line.trim() === '') {
      if (blockStart !== -1) {
        blocks.push({ from: blockFromOffset, to: blockFromOffset + blockText.length, text: blockText });
        blockStart = -1;
        blockText = '';
      }
      continue;
    }
    if (blockStart === -1) {
      blockStart = i;
      blockFromOffset = lineFrom;
      blockText = line;
    } else {
      blockText += '\n' + line;
    }
  }
  if (blockStart !== -1) {
    blocks.push({ from: blockFromOffset, to: blockFromOffset + blockText.length, text: blockText });
  }
  return blocks;
}

function extractPositional(code: string): CodeBlock[] {
  return splitBlocks(code).map((b, i) => ({
    name: `#${i + 1}`,
    kind: 'positional' as const,
    from: b.from,
    to: b.to
  }));
}

/* ------------------------------------------------------------------- Strudel */

// Strudel `$:` slot markers — the canonical "play this" convention in the
// Strudel REPL. Lines starting with `$:` are numbered `$0`, `$1`, …
// Assignments: `const x = …`, `let x = …`, `var x = …`, `x = …` at column 0.
function extractStrudelOrTidal(code: string, runtime: Runtime): CodeBlock[] {
  const blocks = splitBlocks(code);
  let slotIdx = 0;
  const isTidal = runtime === 'tidal';
  // Tidal: `d1 $ sound "bd"` → name = d1.
  const tidalRe = /^\s*(d(?:[1-9]|1[0-6]))\b/;
  const strudelSlotRe = /^\s*\$\s*:/;
  const assignRe = /^\s*(?:const|let|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;

  return blocks.map((b, i) => {
    const first = b.text.split('\n')[0] ?? '';
    if (strudelSlotRe.test(first)) {
      const name = `$${slotIdx++}`;
      return { name, kind: 'slot' as const, from: b.from, to: b.to };
    }
    if (isTidal) {
      const m = tidalRe.exec(first);
      if (m) return { name: m[1], kind: 'slot' as const, from: b.from, to: b.to };
    }
    const a = assignRe.exec(first);
    if (a && !RESERVED.has(a[1])) {
      return { name: a[1], kind: 'assign' as const, from: b.from, to: b.to };
    }
    return { name: `#${i + 1}`, kind: 'positional' as const, from: b.from, to: b.to };
  });
}

/* --------------------------------------------------------------------- Hydra */

// Hydra outputs are `o0`..`o3`. A block ending with `.out(o0)` is named `o0`.
// `.out()` (no arg) maps to `o0` by Hydra convention.
function extractHydra(code: string): CodeBlock[] {
  const blocks = splitBlocks(code);
  const outRe = /\.out\s*\(\s*(o[0-3])?\s*\)/;
  const assignRe = /^\s*(?:const|let|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;
  return blocks.map((b, i) => {
    const m = outRe.exec(b.text);
    if (m) {
      const name = m[1] ?? 'o0';
      return { name, kind: 'slot' as const, from: b.from, to: b.to };
    }
    const first = b.text.split('\n')[0] ?? '';
    const a = assignRe.exec(first);
    if (a && !RESERVED.has(a[1])) {
      return { name: a[1], kind: 'assign' as const, from: b.from, to: b.to };
    }
    return { name: `#${i + 1}`, kind: 'positional' as const, from: b.from, to: b.to };
  });
}

/* ------------------------------------------------------------ SuperCollider */

// SC environment variables `~foo = …` — the idiomatic "named" top-level
// pattern target. Synth definitions `SynthDef(\name, …)` also exposed as slots.
function extractSuperCollider(code: string): CodeBlock[] {
  const blocks = splitBlocks(code);
  const envRe = /^\s*~([a-zA-Z_][a-zA-Z0-9_]*)\s*=/;
  const synthDefRe = /SynthDef\s*\(\s*\\([a-zA-Z_][a-zA-Z0-9_]*)/;
  return blocks.map((b, i) => {
    const first = b.text.split('\n')[0] ?? '';
    const envMatch = envRe.exec(first);
    if (envMatch) return { name: envMatch[1], kind: 'slot' as const, from: b.from, to: b.to };
    const synthMatch = synthDefRe.exec(b.text);
    if (synthMatch) return { name: synthMatch[1], kind: 'slot' as const, from: b.from, to: b.to };
    return { name: `#${i + 1}`, kind: 'positional' as const, from: b.from, to: b.to };
  });
}

/* ---------------------------------------------------------------- Javascript */

function extractJavascript(code: string): CodeBlock[] {
  const blocks = splitBlocks(code);
  const assignRe = /^\s*(?:const|let|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;
  return blocks.map((b, i) => {
    const first = b.text.split('\n')[0] ?? '';
    const a = assignRe.exec(first);
    if (a && !RESERVED.has(a[1])) {
      return { name: a[1], kind: 'assign' as const, from: b.from, to: b.to };
    }
    return { name: `#${i + 1}`, kind: 'positional' as const, from: b.from, to: b.to };
  });
}

// JS/Strudel reserved words / built-ins we don't want to treat as names.
const RESERVED = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'function', 'class', 'new', 'typeof', 'instanceof', 'delete',
  'void', 'throw', 'try', 'catch', 'finally', 'import', 'export', 'from',
  'in', 'of', 'this', 'super', 'yield', 'async', 'await'
]);
