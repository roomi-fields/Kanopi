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

// CV composition is Kronos's job (frontier R2: BPx distributes the raw facets,
// Kronos composes them into modulation bindings). We consume `composeLeafModulations`
// AS-IS and only carry its output onto the dispatch events.
import {
  composeLeafModulations,
  type ModulationBinding,
  type VoiceRef,
  type VoiceSegment,
  type Modulator
} from '@kronos/core';

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
  /** Kronos modulation bindings composed for this leaf (one per modulated input:
   *  cutoff/pan/…). Each carries a samplable `source` + its clock window. Driven
   *  by the Kronos audio path; the legacy path ignores it (it reads `{__cv}` off
   *  `controls`). Absent when the leaf has no modulated control. */
  modulations?: ModulationBinding[] | null;
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
            controls: node.controls && Object.keys(node.controls).length > 0 ? node.controls : null,
            // Kronos CV bindings stamped by `composeCvBindings` (before this flatten),
            // carried opaque to the Kronos audio path.
            modulations: (node as { __cvBindings?: ModulationBinding[] }).__cvBindings ?? null
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

// ── CV piloté par le SUJET (décision hub 2026-06-20) ──────────────────────────
// BPx (`resolveControls`) grave sur chaque feuille sonnante la valeur de contrôle
// qui pilote une modulation, dans une forme qui ENCODE le SUJET du branchement :
//
//   • chaîne nue nommant un modulateur déclaré (`cutoff: 'env1'`)      → SIGNAL,
//     l'enveloppe se déroule UNE fois sur la PHRASE (l'occurrence de règle) ;
//   • `{__subject:'*', value:'env1'}`                                   → PAR NOTE,
//     l'enveloppe repart à chaque note (acid bass) ;
//   • `{__cvRef:'voice', name, voiceIndex, …}` (sans `subject`)         → SIGNAL,
//     l'enveloppe suit le segment de la VOIX SŒUR qui couvre la note ;
//   • `{__cvRef:'voice', …, subject:'*'}`                              → PAR NOTE,
//     l'env de la voix sœur échantillonnée à l'attaque, retriggée par note.
//   • un terminal (`C2:cutoff: env1`) n'est gravé QUE sur les feuilles dont le
//     terminal correspond — BPx fait déjà le filtrage STRUCTUREL, la valeur
//     arrive donc en chaîne nue (cas SIGNAL) sur les seules feuilles concernées.
//
// BPx pose LE FIL ; c'est L'AVAL (ici) qui APPLIQUE les trois horloges. On
// réécrit chaque valeur de modulation en un DESCRIPTEUR UNIFORME que le transport
// webaudio comprend, AVANT que l'arbre n'atteigne `treeToDispatchEvents` :
//
//   par note :  { __cv:true, mod:'env1', clock:'note' }
//   signal   :  { __cv:true, mod:'env1', clock:'signal', startSec, durSec }
//
// startSec/durSec = la FENÊTRE d'horloge en SECONDES (la phrase, ou le segment de
// la voix sœur). TOUTES les coordonnées viennent des SPANS DE FEUILLE RÉALISÉES
// (`leaf.span.startMs/endMs`) — jamais des spans de nœud polymétrique/voix, qui
// portent une coordonnée pré-dilatation trompeuse.

/** Descripteur uniforme de modulation posé en valeur de contrôle pour le transport. */
export interface CvDescriptor {
  __cv: true;
  mod: string;
  clock: 'note' | 'signal';
  /** Fenêtre d'horloge (s) — présents pour `clock:'signal'` uniquement. */
  startSec?: number;
  durSec?: number;
}

/** Référence opaque de voix sœur posée par BPx en valeur de contrôle (NEW form:
 *  le sujet `'*'` / `'<terminal>'` vit désormais dans `controlSubjects`, plus dans
 *  la réf elle-même). */
interface CvVoiceRef {
  __cvRef: 'voice';
  name: string;
  sourceSymbolId: number;
  voiceIndex: number;
}

function isCvVoiceRef(v: unknown): v is CvVoiceRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { __cvRef?: unknown }).__cvRef === 'voice' &&
    typeof (v as CvVoiceRef).voiceIndex === 'number'
  );
}

// Loose node shape — the raw BPx tree carries `sourceSymbolId` on voice nodes,
// `ruleRef` on leaves (the rule occurrence), and `controls`/`span` on leaves; the
// strict `TreeNode` union above only models what the flattener reads, so we widen.
interface RuleRef {
  subgrammarIndex?: number;
  ruleIndex?: number;
  lhsSymbolId?: number;
}
interface RawNode {
  type?: string;
  role?: string;
  symbolId?: number;
  sourceSymbolId?: number;
  controls?: Record<string, unknown>;
  // NEW BPx control form (EX5): the subject ('*' per-note | '<terminal>' | absent
  // signal) and the clock window live in PARALLEL maps beside `controls`, no longer
  // embedded in the value (which is now a bare modulator name or voice ref).
  controlSubjects?: Record<string, string>;
  controlScopes?: Record<string, { kind: 'rule' | 'group' | 'voice'; startMs: number; endMs: number }>;
  ruleRef?: RuleRef;
  span?: Span;
  children?: RawNode[];
  voices?: RawNode[];
  /** Kronos bindings stamped by `composeCvBindings` and read back in the flatten. */
  __cvBindings?: ModulationBinding[];
}

/** Collect a subtree's SOUNDING leaves (role === 'leaf') in DFS order (children
 *  before voices) — the SAME order `treeToDispatchEvents` flattens in, so the
 *  contiguous-run phrase grouping below matches derivation order. */
function collectSoundingLeaves(node: RawNode | undefined, acc: RawNode[]): RawNode[] {
  if (!node || typeof node !== 'object') return acc;
  if (node.role === 'leaf') acc.push(node);
  if (Array.isArray(node.children)) for (const c of node.children) collectSoundingLeaves(c, acc);
  if (Array.isArray(node.voices)) for (const v of node.voices) collectSoundingLeaves(v, acc);
  return acc;
}

/** Two rule occurrences are the SAME phrase iff their `ruleRef` triplet matches. */
function sameRuleRef(a: RuleRef | undefined, b: RuleRef | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.subgrammarIndex === b.subgrammarIndex &&
    a.ruleIndex === b.ruleIndex &&
    a.lhsSymbolId === b.lhsSymbolId
  );
}

// ── Kronos CV composition (the AUDIO path) ───────────────────────────────────
// BPx distributes three orthogonal facets per controlled input on each sounding
// leaf (`controls` = what, `controlSubjects` = clock, `controlScopes` = window);
// Kronos's `composeLeafModulations` assembles them into samplable bindings. We
// only wire the host glue: a voice resolver (sibling-voice ref → its sounding
// segments) and the per-leaf call. The composed bindings are stamped on each
// leaf (`__cvBindings`) so the flatten carries them onto the dispatch events.

/** Build the `resolveVoice` callback Kronos needs: a sibling-voice ref → the
 *  sounding segments of that voice (each leaf → `{window, modulator name}`).
 *  Only leaves whose terminal is a DECLARED modulator (env1/env2/…) become
 *  segments — that's what `VoiceModulation` samples to follow env1→env2→env3. */
function makeVoiceResolver(
  root: RawNode,
  nameOf: (symbolId: number) => string | undefined,
  registry: Readonly<Record<string, Modulator>>
): (ref: VoiceRef) => readonly VoiceSegment[] {
  const blocks: RawNode[] = [];
  const gather = (n: RawNode | undefined): void => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'polymetric') blocks.push(n);
    if (Array.isArray(n.children)) for (const c of n.children) gather(c);
    if (Array.isArray(n.voices)) for (const v of n.voices) gather(v);
  };
  gather(root);
  return (ref: VoiceRef): readonly VoiceSegment[] => {
    for (const block of blocks) {
      const voices = (block.voices ?? block.children) as RawNode[] | undefined;
      if (!Array.isArray(voices) || voices.length === 0) continue;
      // Prefer the indexed voice; fall back to matching by sourceSymbolId when the
      // index disagrees (synthetic scaling voices can shift positions).
      let voice = voices[ref.voiceIndex];
      if (
        !voice ||
        (voice.sourceSymbolId !== undefined && voice.sourceSymbolId !== ref.sourceSymbolId)
      ) {
        const byId = voices.find((v) => v.sourceSymbolId === ref.sourceSymbolId);
        if (byId) voice = byId;
      }
      if (!voice) continue;
      const segments: VoiceSegment[] = [];
      for (const leaf of collectSoundingLeaves(voice, [])) {
        if (typeof leaf.symbolId !== 'number' || leaf.symbolId < 0) continue;
        const name = nameOf(leaf.symbolId);
        if (!name || registry[name] === undefined) continue; // not a declared modulator
        segments.push({
          startScene: (leaf.span?.startMs ?? 0) / 1000,
          endScene: (leaf.span?.endMs ?? 0) / 1000,
          modulator: name
        });
      }
      if (segments.length > 0) return segments;
    }
    return []; // unresolvable ref → no segments (compose then drops the binding)
  };
}

/**
 * Compose Kronos modulation bindings for every sounding leaf and stamp them on the
 * leaf (`__cvBindings`). Reads the NEW BPx facets (`controls` ⊕ `controlSubjects` ⊕
 * `controlScopes`) — call this BEFORE `resolveCvControls` (which rewrites
 * `controls` for the legacy path). Bindings are consumed by the Kronos audio path.
 *
 * @param tree     `derive({ output: 'complete' }).tree` (or its `.root`).
 * @param nameOf   `symbolId → terminal name` (grammar's symbol table).
 * @param registry Kronos modulator registry (`buildModulators(ast.cvInstances, mod)`).
 */
export function composeCvBindings(
  tree: unknown,
  nameOf: (symbolId: number) => string | undefined,
  registry: Readonly<Record<string, Modulator>>
): void {
  const root = resolveRoot(tree as TreeRoot) as RawNode | null;
  if (!root) return;
  const resolveVoice = makeVoiceResolver(root, nameOf, registry);
  const visit = (node: RawNode | undefined): void => {
    if (!node || typeof node !== 'object') return;
    if (node.role === 'leaf' && node.controls && node.span) {
      const bindings = composeLeafModulations(
        {
          controls: node.controls as Record<string, number | string | VoiceRef>,
          controlSubjects: node.controlSubjects,
          controlScopes: node.controlScopes
        },
        registry,
        {
          onsetScene: (node.span.startMs ?? 0) / 1000,
          durationScene: Math.max(0, (node.span.endMs ?? 0) - (node.span.startMs ?? 0)) / 1000
        },
        { resolveVoice }
      );
      if (bindings.length > 0) node.__cvBindings = bindings;
    }
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
    if (Array.isArray(node.voices)) for (const v of node.voices) visit(v);
  };
  visit(root);
}

/**
 * Resolve every SUBJECT-driven modulation control on the tree's sounding leaves
 * into the uniform `{__cv:true, …}` descriptor the webaudio transport applies,
 * mutating `leaf.controls` in place (clone-swap — BPx froze the map).
 *
 * Reads the NEW BPx facets: the value sits bare in `controls`, the subject ('*' |
 * '<terminal>' | absent) in `controlSubjects`, the clock window in `controlScopes`.
 * For each sounding leaf and each control whose VALUE drives modulation:
 *  - plain string naming a declared modulator (`modNames`), no subject (or a
 *    terminal subject) → SIGNAL over the declared scope window (`controlScopes`),
 *    falling back to the phrase span when no scope is present;
 *  - same string with subject `'*'`                         → PER-NOTE (retrigger);
 *  - `{__cvRef:'voice', …}`, no subject (or terminal)       → SIGNAL on the sibling
 *    voice SEGMENT covering this leaf's attack (`span.startMs`);
 *  - `{__cvRef:'voice', …}` with subject `'*'`              → PER-NOTE, mod = the
 *    sibling env sounding at the attack.
 * Every other control (numbers, `wave:'sawtooth'`, strings NOT in `modNames`) is
 * a normal control — left untouched. A `mod` name absent from the registry is
 * still emitted (the transport simply won't modulate); a sibling ref that can't
 * be resolved (no segment / no name) has its key DROPPED. Never throws.
 *
 * COORDINATES: all spans are realized LEAF spans. Sibling notes spanning two
 * segments use the segment covering their START (single-segment limitation).
 *
 * @param tree     `derive({ output: 'complete' }).tree` (or its `.root`).
 * @param nameOf   `symbolId → terminal name` (e.g. `bpx.grammar.symbols.getName`).
 * @param modNames names of the declared modulators (`Object.keys(registry)`) — a
 *                 plain-string value counts as a SIGNAL branchement iff in this set.
 */
export function resolveCvControls(
  tree: unknown,
  nameOf: (symbolId: number) => string | undefined,
  modNames: ReadonlySet<string>
): void {
  const root = resolveRoot(tree as TreeRoot) as RawNode | null;
  if (!root) return;

  // Global sounding-leaf order (derivation order) + index map — the phrase span
  // of a declared-modulator SIGNAL is the maximal contiguous run sharing ruleRef.
  const order = collectSoundingLeaves(root, []);
  const indexOf = new Map<RawNode, number>();
  order.forEach((l, i) => indexOf.set(l, i));
  const phraseSpan = (leaf: RawNode): { startMs: number; endMs: number } => {
    const i = indexOf.get(leaf);
    const own = { startMs: leaf.span?.startMs ?? 0, endMs: leaf.span?.endMs ?? 0 };
    if (i === undefined || !leaf.ruleRef) return own;
    let lo = i;
    let hi = i;
    while (lo > 0 && sameRuleRef(order[lo - 1].ruleRef, leaf.ruleRef)) lo--;
    while (hi < order.length - 1 && sameRuleRef(order[hi + 1].ruleRef, leaf.ruleRef)) hi++;
    return {
      startMs: order[lo].span?.startMs ?? own.startMs,
      endMs: order[hi].span?.endMs ?? own.endMs
    };
  };

  // Cache of sibling-voice sounding leaves per (block, voiceIndex) so repeated
  // refs across a voice's notes don't re-walk the sibling each time.
  const leafCache = new Map<RawNode, Map<number, RawNode[]>>();
  const siblingLeaves = (block: RawNode, ref: CvVoiceRef): RawNode[] | null => {
    let byIndex = leafCache.get(block);
    if (!byIndex) {
      byIndex = new Map();
      leafCache.set(block, byIndex);
    }
    const cached = byIndex.get(ref.voiceIndex);
    if (cached) return cached;
    const voices = (block.voices ?? block.children) as RawNode[] | undefined;
    if (!Array.isArray(voices) || voices.length === 0) return null;
    // Prefer the indexed voice; fall back to matching by sourceSymbolId when the
    // index disagrees (synthetic scaling voices can shift positions).
    let voice = voices[ref.voiceIndex];
    if (!voice || (voice.sourceSymbolId !== undefined && voice.sourceSymbolId !== ref.sourceSymbolId)) {
      const byId = voices.find((v) => v.sourceSymbolId === ref.sourceSymbolId);
      if (byId) voice = byId;
    }
    if (!voice) return null;
    const leaves = collectSoundingLeaves(voice, []);
    byIndex.set(ref.voiceIndex, leaves);
    return leaves;
  };

  // Resolve a sibling-voice ref at a leaf's attack → { name, segment span } or null.
  const resolveSibling = (
    block: RawNode | undefined,
    ref: CvVoiceRef,
    attackMs: number
  ): { name: string; startMs: number; endMs: number } | null => {
    if (!block) return null;
    const leaves = siblingLeaves(block, ref);
    const seg = leaves?.find(
      (l) => (l.span?.startMs ?? 0) <= attackMs && attackMs < (l.span?.endMs ?? 0)
    );
    if (!seg || typeof seg.symbolId !== 'number' || seg.symbolId < 0) return null;
    const name = nameOf(seg.symbolId);
    if (name === undefined || name === null) return null;
    return { name, startMs: seg.span?.startMs ?? 0, endMs: seg.span?.endMs ?? 0 };
  };

  const signalDesc = (mod: string, startMs: number, endMs: number): CvDescriptor => ({
    __cv: true,
    mod,
    clock: 'signal',
    startSec: startMs / 1000,
    durSec: Math.max(0, endMs - startMs) / 1000
  });

  const polyStack: RawNode[] = [];
  const visit = (node: RawNode | undefined): void => {
    if (!node || typeof node !== 'object') return;
    const isPoly = node.type === 'polymetric';
    if (isPoly) polyStack.push(node);

    if (node.role === 'leaf' && node.controls && typeof node.controls === 'object') {
      const controls = node.controls;
      const subjects = node.controlSubjects ?? {};
      const block = polyStack[polyStack.length - 1];
      const attack = node.span?.startMs ?? 0;
      // Only rebuild when at least one value drives modulation; otherwise leave
      // the frozen original in place (cheaper, no needless clone).
      const needsRewrite = Object.values(controls).some(
        (v) => isCvVoiceRef(v) || (typeof v === 'string' && modNames.has(v))
      );
      if (needsRewrite) {
        const next: Record<string, unknown> = {};
        for (const key of Object.keys(controls)) {
          const val = controls[key];
          const subject = subjects[key]; // '*' | '<terminal>' | undefined
          if (isCvVoiceRef(val)) {
            const sib = resolveSibling(block, val, attack);
            // Unresolvable sibling (no segment / no name) → DROP the key.
            if (!sib) continue;
            next[key] =
              subject === '*'
                ? ({ __cv: true, mod: sib.name, clock: 'note' } as CvDescriptor)
                : signalDesc(sib.name, sib.startMs, sib.endMs);
          } else if (typeof val === 'string' && modNames.has(val)) {
            if (subject === '*') {
              // Declared modulator, PER NOTE — retriggered each note.
              next[key] = { __cv: true, mod: val, clock: 'note' } as CvDescriptor;
            } else {
              // SIGNAL — window = the phrase (the rule occurrence's contiguous leaf
              // run, via `ruleRef`). NOT `controlScopes`: BPx's scope for a terminal
              // subject (`C2:cutoff:`) currently bleeds into the previous rule, so the
              // ruleRef phrase span stays the correct, tighter window here.
              const ph = phraseSpan(node);
              next[key] = signalDesc(val, ph.startMs, ph.endMs);
            }
          } else {
            next[key] = val; // normal control — untouched
          }
        }
        node.controls = next;
      }
    }

    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
    if (Array.isArray(node.voices)) for (const v of node.voices) visit(v);

    if (isPoly) polyStack.pop();
  };

  visit(root);
}
