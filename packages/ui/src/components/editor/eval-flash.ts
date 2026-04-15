import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export type FlashKind = 'ok' | 'err';

export const setFlashEffect = StateEffect.define<{ from: number; to: number; kind: FlashKind } | null>();

const okMark = Decoration.mark({ class: 'cm-flash-ok' });
const errMark = Decoration.mark({ class: 'cm-flash-err' });

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFlashEffect)) {
        if (e.value === null) return Decoration.none;
        const mark = e.value.kind === 'ok' ? okMark : errMark;
        return Decoration.set([mark.range(e.value.from, e.value.to)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

export const flashTheme = EditorView.baseTheme({
  '.cm-flash-ok': {
    backgroundColor: 'rgba(126, 200, 115, 0.22)',
    transition: 'background-color 0.4s ease-out',
    boxShadow: 'inset 0 0 0 1px rgba(126, 200, 115, 0.4)'
  },
  '.cm-flash-err': {
    backgroundColor: 'rgba(200, 107, 107, 0.22)',
    transition: 'background-color 0.4s ease-out',
    boxShadow: 'inset 0 0 0 1px rgba(200, 107, 107, 0.5)'
  }
});

export function flash(view: EditorView, from: number, to: number, kind: FlashKind, durationMs = 350) {
  view.dispatch({ effects: setFlashEffect.of({ from, to, kind }) });
  setTimeout(() => {
    if (view.state) view.dispatch({ effects: setFlashEffect.of(null) });
  }, durationMs);
}
