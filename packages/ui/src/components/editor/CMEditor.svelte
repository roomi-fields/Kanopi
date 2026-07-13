<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Prec, type Extension } from '@codemirror/state';
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    drawSelection
  } from '@codemirror/view';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import {
    acceptCompletion,
    completionStatus,
    autocompletion,
    completionKeymap
  } from '@codemirror/autocomplete';
  import { kanopiTheme, kanopiGlobalStyles, kanopiHighlight } from './cm-theme';
  import { syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
  import { ui } from '../../stores/ui.svelte';
  import { extractBlock } from '../../lib/runtimes/extract-block';
  import { languageFor } from './lang-resolver';
  import type { Runtime } from '../../lib/core-mock';
  import { core } from '../../lib/core';
  import { flash, flashField, flashTheme } from './eval-flash';
  import { rememberEval } from './eval-tracker';
  import { strudelExtras } from './strudel-extras';
  import { miniOverlay } from './mini-overlay';
  import {
    widgetPlugin,
    registerStrudelEditorView,
    unregisterStrudelEditorView
  } from 'runtime-codevoices';
  import { extractBlocks, qualifyBlock } from '../../lib/blocks/extract-blocks';
  import { openBlocks } from '../../stores/blocks.svelte';
  import { isNonProgramFile } from '../../lib/workspace/types';

  type Props = {
    docId: string;
    fileName: string;
    /** Full workspace path (not just the basename) — used ONLY to recognize a
     * data file (`libraries/…` or `resources/…` JSON catalog) and skip the
     * BPScript language/lint extension on it (not a program; see `makeState`). */
    path?: string;
    doc: string;
    runtime: Runtime;
    readOnly?: boolean;
    onChange: (text: string) => void;
    onEval?: (code: string, docOffset: number, actorId?: string) => void | Promise<boolean | void>;
  };
  const {
    docId,
    fileName,
    path,
    doc,
    runtime,
    readOnly = false,
    onChange,
    onEval
  }: Props = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement | undefined = $state();
  let view: EditorView | undefined;
  let currentDocId: string | undefined;
  // The fileName currently registered as the Strudel inline-widget target, so a
  // doc swap can unregister the PREVIOUS file before registering the new one
  // (else the old fileName→view mapping leaks and dispatches onto a replaced view).
  let registeredFileName: string | undefined;
  let strudelInstall: ((view: EditorView) => Promise<void>) | undefined;

  const isStrudelLike = $derived(runtime === 'strudel' || runtime === 'tidal');

  // Wrapped as a pure Promise chain (no async/await touching $props — Svelte 5
  // mangles those). onEval now throws on any eval error; we catch and mark err.
  // Pure Promise chain — Svelte 5 mangles await on $props.
  function runEval(code: string, v: EditorView, from: number, to: number, actorId?: string) {
    if (!onEval) return;
    rememberEval(v, from, to);
    Promise.resolve()
      .then(() => onEval(code, from, actorId))
      .then(
        () => flash(v, from, to, 'ok'),
        () => flash(v, from, to, 'err')
      );
  }

  // Find the detected block that contains the given doc offset, if any.
  // Returns the block + qualifiedName used as slot id so Ctrl+Enter lands in
  // the block's own slot (not the whole-file slot).
  function blockAtOffset(
    docText: string,
    pos: number
  ): { from: number; to: number; qualifiedName: string } | undefined {
    const blocks = extractBlocks(docText, runtime);
    for (const b of blocks) {
      if (pos >= b.from && pos <= b.to) {
        return { from: b.from, to: b.to, qualifiedName: qualifyBlock(fileName, b) };
      }
    }
    return undefined;
  }

  function makeState(initial: string, lang: Runtime): EditorState {
    const strudel = strudelExtras(lang);
    strudelInstall = strudel.install;
    // A data file (`libraries/…` personal catalog OR `resources/…` factory
    // catalog entry) is a JSON catalog, not a program: no extension declares
    // `.json`, so `runtime` falls back to 'bpscript' — but running the BPScript
    // language/lint extension on it would underline the JSON as parse errors
    // (decision 2026-07-13-invocation-librairies-factory-mine.md). Skip the
    // language extension there; plain-text editing only.
    const isDataFile = isNonProgramFile(path);
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      bracketMatching(),
      indentOnInput(),
      ...(isDataFile ? [] : [languageFor(lang)]),
      // Completion popup engine. Languages opt in via `languageData.autocomplete`
      // (BPScript wires its reference-backed source in lang-resolver). Without this
      // extension that source is never consulted and no popup ever shows.
      autocompletion(),
      syntaxHighlighting(kanopiHighlight, { fallback: true }),
      strudel.ext,
      ...(lang === 'strudel' || lang === 'tidal' ? [miniOverlay, ...widgetPlugin] : []),
      flashField,
      flashTheme,
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-k',
            preventDefault: true,
            stopPropagation: true,
            run: () => {
              ui.togglePalette();
              return true;
            }
          },
          {
            key: 'Mod-Shift-p',
            preventDefault: true,
            stopPropagation: true,
            run: () => {
              ui.togglePalette();
              return true;
            }
          },
          {
            key: 'Mod-.',
            preventDefault: true,
            stopPropagation: true,
            run: () => {
              void core.hushAll();
              return true;
            }
          },
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: (v) => {
              if (!onEval || isDataFile) return false;
              const sel = v.state.selection.main;
              const docText = v.state.doc.toString();
              // Prefer the block-level detector: it knows about `$:`, assignments
              // and positional fallback, and gives us a qualifiedName to arm.
              // Fall back to the line-paragraph heuristic if the detector hits
              // runtime it doesn't handle (.scd still unsupported runs etc).
              const block = blockAtOffset(docText, sel.head);
              if (block) {
                const code = docText.slice(block.from, block.to);
                if (!code.trim()) return true;
                // Arm the block (UI LED lights up) and eval it in its own slot.
                if (!openBlocks.isArmed(block.qualifiedName)) {
                  // Arm without re-evaluating (runEval below does the eval itself).
                  const next = new Set(openBlocks.armed);
                  next.add(block.qualifiedName);
                  openBlocks.armed = next;
                }
                runEval(code, v, block.from, block.to, block.qualifiedName);
                return true;
              }
              const code = extractBlock(docText, sel.from, sel.to, runtime);
              if (!code) return true;
              const blockStart = docText.indexOf(code);
              const range =
                blockStart >= 0 ? [blockStart, blockStart + code.length] : [sel.from, sel.to];
              runEval(code, v, range[0], range[1]);
              return true;
            }
          },
          {
            key: 'Shift-Enter',
            preventDefault: true,
            run: (v) => {
              if (!onEval || isDataFile) return false;
              const sel = v.state.selection.main;
              const line = v.state.doc.lineAt(sel.head);
              const code = line.text.trim();
              if (!code) return true;
              runEval(code, v, line.from, line.to);
              return true;
            }
          },
          {
            key: 'Tab',
            run: (v) => (completionStatus(v.state) === 'active' ? acceptCompletion(v) : false)
          },
          indentWithTab,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap
        ])
      ),
      kanopiTheme,
      kanopiGlobalStyles,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString());
      }),
      // Reference data (resource-library entries) opens read-only: block edits
      // at the state level and drop the editable affordance (no caret/typing).
      ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [])
    ];
    return EditorState.create({ doc: initial, extensions });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(doc, runtime), parent: host });
    currentDocId = docId;
    if (view && strudelInstall) void strudelInstall(view);
    // Register this view as the target for Strudel's inline widgets
    // (_pianoroll, _scope, _spectrum). Keyed by fileName so the dispatch
    // lands on the right editor when several Strudel files are open.
    if (runtime === 'strudel' || runtime === 'tidal') {
      registerStrudelEditorView(fileName, view);
      registeredFileName = fileName;
    }
  });

  onDestroy(() => {
    if (registeredFileName !== undefined) {
      unregisterStrudelEditorView(registeredFileName);
      registeredFileName = undefined;
    }
    view?.destroy();
    view = undefined;
  });

  // Swap state when the active doc changes (do NOT recreate the view); and
  // reconcile an EXTERNAL content change for the SAME file into the view.
  $effect(() => {
    if (!view) return;
    if (docId !== currentDocId) {
      currentDocId = docId;
      view.setState(makeState(doc, runtime));
      if (view && strudelInstall) void strudelInstall(view);
      // Unregister the PREVIOUS file's view before (re)registering, so a doc swap
      // doesn't leak a stale fileName→view mapping in the widget dispatch registry.
      if (registeredFileName !== undefined && registeredFileName !== fileName) {
        unregisterStrudelEditorView(registeredFileName);
        registeredFileName = undefined;
      }
      if (runtime === 'strudel' || runtime === 'tidal') {
        registerStrudelEditorView(fileName, view);
        registeredFileName = fileName;
      }
      return;
    }
    // Same file, but `doc` changed from OUTSIDE the editor (e.g. the tempo knob
    // rewrote `@mm`): push it into the view so the editor reflects it. A user
    // keystroke does NOT reach here — onChange already set the store to the view's
    // own text, so `doc === current` and nothing is dispatched (no echo loop).
    const current = view.state.doc.toString();
    if (doc !== current) {
      const sel = view.state.selection.main;
      const anchor = Math.min(sel.anchor, doc.length);
      const head = Math.min(sel.head, doc.length);
      view.dispatch({
        changes: { from: 0, to: current.length, insert: doc },
        selection: { anchor, head }
      });
    }
  });

  // Size the pre-injected #test-canvas to the editor box with DPR scaling, so
  // @strudel/draw's getDrawContext() picks up our canvas (see strudel.ts and
  // node_modules/@strudel/draw/draw.mjs:9) and .pianoroll() / .scope() /
  // .spectrum() render inside the editor area instead of a fullscreen overlay.
  // Phase 2.1 task 1.2.
  $effect(() => {
    if (!canvas || !host) return;
    const el = canvas;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(host.clientWidth * dpr));
      el.height = Math.max(1, Math.round(host.clientHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    return () => ro.disconnect();
  });
</script>

<div class="cm-host" bind:this={host}>
  {#if isStrudelLike}
    <canvas id="test-canvas" bind:this={canvas} aria-hidden="true"></canvas>
  {/if}
</div>

<style>
  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    position: relative;
  }
  .cm-host :global(.cm-editor) {
    flex: 1;
    height: 100%;
    outline: none;
  }
  .cm-host :global(.cm-editor.cm-focused) {
    outline: none;
  }
  /* Pre-injected Strudel draw target. `#test-canvas` is the default id that
     @strudel/draw's getDrawContext() queries for. Phase 2.1 task 1.2. */
  .cm-host > canvas#test-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
  }
</style>
