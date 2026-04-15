<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, type Extension } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { kanopiTheme } from './cm-theme';
  import { ui } from '../../stores/ui.svelte';
  import { extractBlock } from '../../lib/runtimes/extract-block';

  type Props = {
    docId: string;
    doc: string;
    onChange: (text: string) => void;
    onEval?: (code: string) => void;
  };
  const { docId, doc, onChange, onEval }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let currentDocId: string | undefined;

  function makeState(initial: string): EditorState {
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        { key: 'Mod-k', preventDefault: true, run: () => { ui.togglePalette(); return true; } },
        { key: 'Mod-Shift-p', preventDefault: true, run: () => { ui.togglePalette(); return true; } },
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: (v) => {
            if (!onEval) return false;
            const sel = v.state.selection.main;
            const code = extractBlock(v.state.doc.toString(), sel.from, sel.to);
            if (code) onEval(code);
            return true;
          }
        },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ]),
      kanopiTheme,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString());
      })
    ];
    return EditorState.create({ doc: initial, extensions });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(doc), parent: host });
    currentDocId = docId;
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
      view.setState(makeState(doc));
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
