// Pure adapter: BPx derivation tree (`derive({ output: 'complete' }).tree`) →
// the ordered event list the dispatcher schedules.
//
// WHY the tree, not the flat `.tokens`: the flat timed-token list carries
// `actor: null` on every entry (BPx emits it that way — verified in BPx
// `emit/timedTokens`), and simultaneous polymetric leaves are FUSED. The payload
// that the per-actor routing needs — `{ nature:'sounding', actor, params }` on a
// note, and the control-marker payload on a control — lives ONLY on the tree
// nodes (`OccupyingNode.payload` / `ControlNode.payload`). So we flatten the tree
// in derivation order and carry each node's own payload onto its event.
//
// Names: a leaf node carries only `symbolId`, not the terminal text. We resolve
// it from `symbolNames` (`symbolId → name`, read off the grammar's own symbol
// table at derive time — deterministic, no collision). When the table lacks an
// id we emit a stable `#<symbolId>` placeholder.
//
// Ordering: DFS yields voice-major order within a polymetric block; the
// dispatcher re-sorts events by `startSec` on load, so the only contract here is
// that every node appears with its correct span — not a globally sorted list.

/** A control-marker payload as it lives on a `ControlNode` (opaque to BPx). */
export interface ControlMarkerPayload {
  role?: string;
  // The inner marker payload: `{ kind, nature?, pairs?, flux?, ... }`.
  payload?: {
    kind?: string;
    nature?: string;
    pairs?: Array<{ key: string; value: unknown }>;
    flux?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** A note payload as it lives on an `OccupyingNode` (opaque to BPx). */
export interface NotePayload {
  nature?: string;
  actor?: string | null;
  params?: Record<string, unknown>;
  [k: string]: unknown;
}

/** One dispatch event flattened off the tree, times in SECONDS. */
export interface DispatchEvent {
  token: string;
  startSec: number;
  durSec: number;
  type: 'note' | 'control' | 'rest';
  /** The node's own opaque payload (note → actor/params, control → marker). */
  payload?: NotePayload | ControlMarkerPayload | null;
  /** AST nature scellée on a control node (`transport-control` | `instant` |
   *  `engine-control`), exposed so the dispatcher routes on it directly. */
  nature?: string;
  /** E-016 sealed per-leaf runtime state (`{ vel?, transpose?, chan?, … }`),
   *  stamped on each SOUNDING leaf by BPx's `buildTree` (tree-builder.ts:487 /
   *  node.ts:213 `runtimeQualifiers`). Carried onto the event so the unified
   *  payload-routing path folds it over controlState exactly as the flat
   *  `dispatcher.load()` path did off `token.runtimeQualifiers`. */
  rq?: Record<string, number> | null;
  /** RESOLVED non-temporal controls (`{ wave:'sawtooth', vel:'30', … }`) off the
   *  leaf's CANONICAL `controls` channel (BPx `resolveControls`: containment ⊕
   *  flux ⊕ note-override, precedence applied — AST_SPEC §4.1). VERBATIM values
   *  (string or number); the dispatcher coerces types and routes them. */
  controls?: Record<string, unknown> | null;
}

// Minimal structural shapes we read off the tree. Mirrors BPx's `TreeNode`
// (`src/types/node.ts`) but only the fields this flattener touches.
interface Span {
  startMs: number;
  endMs: number;
}
type TreeNode =
  | { type: 'sequence'; children: TreeNode[]; span?: Span }
  | { type: 'polymetric'; voices: TreeNode[]; span?: Span }
  | { type: 'voice'; children: TreeNode[]; span?: Span }
  | {
      type: 'occupying';
      symbolId: number;
      role: 'leaf' | 'rest' | 'prolongation';
      payload?: unknown;
      runtimeQualifiers?: Record<string, number>;
      // BPx's `resolveControls` pass grafts the RESOLVED non-temporal controls
      // (containment ⊕ flux ⊕ note-override, precedence already applied) onto each
      // sounding leaf as an opaque `{ wave:'sawtooth', vel:30, … }` map. Verbatim
      // values (string OR number). Absent if nothing governs the leaf.
      controls?: Record<string, unknown>;
      span: Span;
    }
  | { type: 'control'; symbolId: number; payload?: unknown; nature?: string; span: Span }
  | { type: 'event'; symbolId: number; payload?: unknown; span: Span };

type TreeRoot = { root?: TreeNode } | TreeNode | null | undefined;

/**
 * Flatten a BPx derivation tree to dispatch events carrying per-node payload.
 *
 * @param tree        `derive({ output: 'complete' }).tree` (or its `.root`).
 * @param symbolNames `symbolId → name` from the grammar's symbol table.
 */
export function treeToDispatchEvents(
  tree: TreeRoot,
  symbolNames: Record<number, string> = {}
): DispatchEvent[] {
  const root = resolveRoot(tree);
  if (!root) return [];

  const out: DispatchEvent[] = [];
  const nameOf = (symbolId: number): string =>
    symbolNames[symbolId] !== undefined ? symbolNames[symbolId] : `#${symbolId}`;

  const visit = (node: TreeNode): void => {
    switch (node.type) {
      case 'sequence':
        for (const c of node.children) visit(c);
        return;
      case 'polymetric':
        for (const v of node.voices) visit(v);
        return;
      case 'voice':
        for (const c of node.children) visit(c);
        return;
      case 'occupying': {
        const startSec = (node.span?.startMs ?? 0) / 1000;
        const durSec = Math.max(0, (node.span?.endMs ?? 0) - (node.span?.startMs ?? 0)) / 1000;
        if (node.role === 'rest' || node.role === 'prolongation') {
          out.push({ token: node.role === 'rest' ? '-' : '_', startSec, durSec, type: 'rest' });
        } else {
          out.push({
            token: nameOf(node.symbolId),
            startSec,
            durSec,
            type: 'note',
            payload: (node.payload as NotePayload) ?? null,
            // E-016: carry the leaf's sealed runtime state so the dispatcher's
            // unified routing folds vel/transpose/chan exactly as the old flat
            // `token.runtimeQualifiers` path did.
            rq: node.runtimeQualifiers ?? null,
            // CANONICAL channel (AST_SPEC §4.1): the resolved non-temporal controls
            // ride DIRECTLY on the leaf's `controls`. Carried verbatim — the
            // dispatcher coerces types and routes them.
            controls: node.controls && Object.keys(node.controls).length > 0 ? node.controls : null
          });
        }
        return;
      }
      case 'control': {
        const startSec = (node.span?.startMs ?? 0) / 1000;
        out.push({
          token: nameOf(node.symbolId),
          startSec,
          durSec: 0,
          type: 'control',
          payload: (node.payload as ControlMarkerPayload) ?? null,
          nature: node.nature
        });
        return;
      }
      case 'event':
        // Zero-duration non-control events aren't notes for the dispatcher; skip.
        return;
    }
  };

  visit(root);
  return out;
}

function resolveRoot(tree: TreeRoot): TreeNode | null {
  if (!tree) return null;
  if (typeof tree === 'object' && 'root' in tree && tree.root) return tree.root as TreeNode;
  if (typeof tree === 'object' && 'type' in tree) return tree as TreeNode;
  return null;
}
