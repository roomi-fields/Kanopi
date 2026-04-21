<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Prec, type Extension } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { acceptCompletion, completionStatus } from '@codemirror/autocomplete';
  import { kanopiTheme, kanopiGlobalStyles } from './cm-theme';
  import { syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
  import { highlightFor } from './highlight-styles';
  import { ui } from '../../stores/ui.svelte';
  import { extractBlock } from '../../lib/runtimes/extract-block';
  import { languageFor } from './lang-resolver';
  import type { Runtime } from '../../lib/core-mock';
  import { core } from '../../lib/core';
  import { flash, flashField, flashTheme } from './eval-flash';
  import { rememberEval } from './eval-tracker';
  import { strudelExtras } from './strudel-extras';
  import { miniOverlay } from './mini-overlay';
  import { kanopiLinter } from './kanopi-lint';
  import { lintGutter } from '@codemirror/lint';
  import { patternHighlightExtension } from '../viz/pattern-highlight';
  import * as strudelCM from '@strudel/codemirror';
  import { registerStrudelEditorView, unregisterStrudelEditorView } from '../../lib/runtimes/strudel';
  // `widgetPlugin` is exported by @strudel/codemirror at runtime (widget.mjs)
  // but not surfaced in its .d.ts — hence the cast.
  const widgetPlugin = (strudelCM as unknown as { widgetPlugin: Extension[] }).widgetPlugin;
  import { extractBlocks } from '../../lib/blocks/extract-blocks';
  import { openBlocks } from '../../stores/blocks.svelte';

  type Props = {
    docId: string;
    fileName: string;
    doc: string;
    runtime: Runtime;
    onChange: (text: string) => void;
    onEval?: (code: string, docOffset: number, actorId?: string) => void | Promise<boolean | void>;
  };
  const { docId, fileName, doc, runtime, onChange, onEval }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let currentDocId: string | undefined;
  let strudelInstall: ((view: EditorView) => Promise<void>) | undefined;

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
  function blockAtOffset(docText: string, pos: number): { from: number; to: number; qualifiedName: string } | undefined {
    const blocks = extractBlocks(docText, runtime);
    const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
    for (const b of blocks) {
      if (pos >= b.from && pos <= b.to) {
        return { from: b.from, to: b.to, qualifiedName: `${base}.${b.name}` };
      }
    }
    return undefined;
  }

  function makeState(initial: string, lang: Runtime): EditorState {
    const strudel = strudelExtras(lang);
    strudelInstall = strudel.install;
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      bracketMatching(),
      indentOnInput(),
      languageFor(lang),
      syntaxHighlighting(highlightFor(lang), { fallback: true }),
      strudel.ext,
      ...((lang === 'strudel' || lang === 'tidal') ? [miniOverlay, patternHighlightExtension(() => fileName), ...widgetPlugin] : []),
      ...(lang === 'kanopi' ? [kanopiLinter, lintGutter()] : []),
      flashField,
      flashTheme,
      Prec.highest(keymap.of([
        { key: 'Mod-k', preventDefault: true, stopPropagation: true, run: () => { ui.togglePalette(); return true; } },
        { key: 'Mod-Shift-p', preventDefault: true, stopPropagation: true, run: () => { ui.togglePalette(); return true; } },
        { key: 'Mod-.', preventDefault: true, stopPropagation: true, run: () => { void core.hushAll(); return true; } },
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: (v) => {
            // In a .kanopi session, Mod-Enter launches the session:
            // activate the currently-active scene, or the first one otherwise.
            if (lang === 'kanopi') {
              const scenes = core.scenes.list();
              if (!scenes.length) return true;
              const target = scenes.find((s) => s.active) ?? scenes[0];
              core.scenes.activate(target.name);
              flash(v, 0, v.state.doc.length, 'ok');
              return true;
            }
            if (!onEval) return false;
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
            const code = extractBlock(docText, sel.from, sel.to);
            if (!code) return true;
            const blockStart = docText.indexOf(code);
            const range = blockStart >= 0 ? [blockStart, blockStart + code.length] : [sel.from, sel.to];
            runEval(code, v, range[0], range[1]);
            return true;
          }
        },
        {
          key: 'Shift-Enter',
          preventDefault: true,
          run: (v) => {
            if (!onEval) return false;
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
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ])),
      kanopiTheme,
      kanopiGlobalStyles,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString());
      })
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
    }
  });

  onDestroy(() => {
    if (runtime === 'strudel' || runtime === 'tidal') {
      unregisterStrudelEditorView(fileName);
    }
    view?.destroy();
    view = undefined;
  });

  // Swap state when the active doc changes (do NOT recreate the view)
  $effect(() => {
    if (!view) return;
    if (docId !== currentDocId) {
      currentDocId = docId;
      view.setState(makeState(doc, runtime));
      if (view && strudelInstall) void strudelInstall(view);
      if (runtime === 'strudel' || runtime === 'tidal') {
        registerStrudelEditorView(fileName, view);
      }
    }
  });
</script>

<div class="cm-host" bind:this={host}></div>

<style>
  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
  }
  .cm-host :global(.cm-editor) {
    flex: 1;
    height: 100%;
    outline: none;
  }
  .cm-host :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
