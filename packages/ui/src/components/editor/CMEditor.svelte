<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Prec, type Extension } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
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

  type Props = {
    docId: string;
    doc: string;
    runtime: Runtime;
    onChange: (text: string) => void;
    onEval?: (code: string) => void | Promise<boolean | void>;
  };
  const { docId, doc, runtime, onChange, onEval }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let currentDocId: string | undefined;
  let strudelInstall: ((view: EditorView) => Promise<void>) | undefined;

  // Wrapped as a pure Promise chain (no async/await touching $props — Svelte 5
  // mangles those). onEval now throws on any eval error; we catch and mark err.
  // Pure Promise chain — Svelte 5 mangles await on $props.
  function runEval(code: string, v: EditorView, from: number, to: number) {
    if (!onEval) return;
    rememberEval(v, from, to);
    Promise.resolve()
      .then(() => onEval(code))
      .then(
        () => flash(v, from, to, 'ok'),
        () => flash(v, from, to, 'err')
      );
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
      ...((lang === 'strudel' || lang === 'tidal') ? [miniOverlay] : []),
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
  });

  onDestroy(() => {
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
