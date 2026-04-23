---
name: svelte-5-patterns
description: Authoritative guide to Svelte 5 runes ($state, $derived, $effect, $props, $bindable) and the compiler quirks that bite in Kanopi's Svelte 5 + CodeMirror 6 codebase. Use this skill whenever Claude creates or modifies a `.svelte` file, introduces reactive state, adds effects, integrates a CodeMirror extension into a component, or sees/writes old Svelte 4 syntax ("export let", "$:" labels, $$props, $$restProps). Also use when debugging "my reactive thing isn't reactive", "the $effect loops", "the await broke", or anything that looks like a Svelte compiler surprise.
---

# Svelte 5 Patterns for Kanopi

Kanopi's UI is Svelte 5 + TypeScript + CodeMirror 6. The Svelte 5 compiler is aggressive — it rewrites your source — so a lot of "it should work" patterns from Svelte 4 silently break. This skill captures the rules that avoid the traps we've actually hit in this repo.

## The core runes — what each one is for

| Rune         | Use for                                                    | Do NOT use for                              |
|--------------|------------------------------------------------------------|---------------------------------------------|
| `$state`     | Mutable reactive state owned by this component             | Values derived from other state             |
| `$derived`   | Pure synchronous computation from reactive inputs          | Side effects, async work, DOM access        |
| `$derived.by` | Same as `$derived` but with a function body (multiple statements) | Anything async                         |
| `$effect`    | Side effects (DOM, subscriptions, CM6 lifecycle, logging)  | Computing a value you want to read elsewhere |
| `$effect.pre` | Side effect that must run *before* DOM updates            | General-purpose work                        |
| `$props`     | Read incoming props, destructured at top of `<script>`     | Anything else                               |
| `$bindable` | Mark a prop as two-way bindable from the parent            | One-way-in props                            |

**The single most important rule:** a value you want to *read* is `$derived`; a thing you want to *happen* is `$effect`. People who use `$effect` to "compute" a value end up with infinite loops. People who use `$derived` to "do" something (fetch, subscribe, attach) get silent non-execution.

## Syntax to banish on sight

If you see any of these in a `.svelte` file, it's legacy Svelte 4 and will either warn or misbehave under Svelte 5's runes mode:

```svelte
<script>
  export let foo;              // → let { foo } = $props();
  export let bar = 1;          // → let { bar = 1 } = $props();
  $: double = foo * 2;         // → const double = $derived(foo * 2);
  $: { console.log(foo); }     // → $effect(() => { console.log(foo); });
  let items = [];              // (if mutated reactively) → let items = $state([]);
</script>
```

`$$props` and `$$restProps` are also gone — use `let { ...rest } = $props();`.

## Props, typed

```svelte
<script lang="ts">
  type Props = {
    value: string;
    onChange?: (next: string) => void;
    count?: number;
  };
  let { value, onChange, count = 0 }: Props = $props();
</script>
```

For two-way binding:

```svelte
<script lang="ts">
  let { value = $bindable('') }: { value?: string } = $props();
</script>
<!-- parent: <Child bind:value={text} /> -->
```

## `$derived` vs `$effect` — the trap

```svelte
<!-- WRONG: $effect used to compute -->
<script>
  let count = $state(0);
  let doubled = $state(0);
  $effect(() => { doubled = count * 2; });  // infinite loop risk, extra tick
</script>

<!-- RIGHT: $derived -->
<script>
  let count = $state(0);
  const doubled = $derived(count * 2);
</script>
```

```svelte
<!-- WRONG: $derived used for side effects -->
<script>
  const log = $derived(console.log(count));  // runs unpredictably, may not run at all
</script>

<!-- RIGHT: $effect -->
<script>
  $effect(() => { console.log(count); });
</script>
```

## The `await` trap — the one that keeps biting us

The Svelte 5 compiler rewrites reactive bodies. Putting `await` inside `$derived`, `$effect`, or a reactive closure can change semantics in surprising ways: the reactive graph sees the *promise*, not the resolved value, and re-runs can interleave unexpectedly.

Safe pattern for async work driven by reactive inputs:

```svelte
<script lang="ts">
  let query = $state('');
  let result = $state<Result | null>(null);

  $effect(() => {
    const q = query;               // snapshot the reactive read synchronously
    let cancelled = false;
    (async () => {
      const next = await doFetch(q);
      if (!cancelled) result = next;
    })();
    return () => { cancelled = true; };  // cleanup on re-run/destroy
  });
</script>
```

Key points:
- Read reactive inputs *synchronously* at the top of the effect (before any `await`).
- Do the async work in an inner IIFE that the effect does not await.
- Use a `cancelled` flag returned from the cleanup to avoid stale writes.

## CodeMirror 6 inside Svelte 5

CM6's `EditorView` is imperative and long-lived. It does not belong in `$state` (don't make it reactive-tracked), but its *configuration* usually does.

```svelte
<script lang="ts">
  import { EditorView } from '@codemirror/view';
  import { EditorState, Compartment } from '@codemirror/state';

  let { doc = $bindable('') }: { doc?: string } = $props();
  let host: HTMLElement;
  let view: EditorView | undefined;   // plain let — not $state
  const themeCompartment = new Compartment();
  let dark = $state(true);

  $effect(() => {
    view = new EditorView({
      state: EditorState.create({ doc, extensions: [themeCompartment.of(dark ? darkTheme : lightTheme)] }),
      parent: host,
    });
    return () => view?.destroy();
  });

  // Reconfigure when `dark` changes — no full re-create
  $effect(() => {
    view?.dispatch({ effects: themeCompartment.reconfigure(dark ? darkTheme : lightTheme) });
  });
</script>
<div bind:this={host}></div>
```

Rules:
- One `$effect` to **construct** the view + cleanup on destroy.
- Separate `$effect`s per **reconfigurable** concern, each dispatching through a `Compartment`. Do not rebuild the view on theme/keymap/language swap.
- Do not put the `EditorView` instance itself in `$state` — it's not a value you want deep-reactive; it's a long-lived imperative object.

## Reactive containers — arrays, maps, sets

Svelte 5 proxies `$state` arrays/objects, so mutation works:

```svelte
let items = $state<Item[]>([]);
items.push(newItem);         // reactive ✓
items[0].name = 'x';          // reactive ✓ (deep proxy)
```

But **destructured bindings lose reactivity**:

```svelte
let user = $state({ name: 'a', age: 1 });
const { name } = user;        // name is a plain string — not reactive
const name2 = $derived(user.name);  // reactive ✓
```

`SvelteMap` / `SvelteSet` from `svelte/reactivity` are needed if you want reactive map/set semantics.

## When to check reality, not source

The compiler is smart. Reading your `.svelte` source and reasoning about it is not the same as knowing what runs. When in doubt:

1. Open `packages/ui/dist/` or the browser devtools source panel — look at the *compiled* output.
2. Use `$inspect(value)` to log reactive reads automatically.
3. Invoke the `live-coding-verify` skill and actually run the thing in the browser.

## Quick review checklist for any new `.svelte` file

- [ ] Uses `$props()` with destructuring, no `export let`.
- [ ] Every reactive-mutated variable is `$state(...)`.
- [ ] Every derived value is `$derived(...)` (no `$effect` computing values).
- [ ] Every effect that reads reactive inputs snapshots them synchronously before any `await`.
- [ ] CodeMirror views/instances are plain `let`, reconfigured via `Compartment`, destroyed in cleanup.
- [ ] Two-way props are marked `$bindable()`.
- [ ] TypeScript types are on `$props()` and function signatures.
