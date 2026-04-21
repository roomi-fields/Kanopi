/**
 * Single-source proxy for @strudel/codemirror.
 *
 * @strudel/codemirror ships module-level state (widgetElements map, StateField
 * identifiers, StateEffect tokens) that only works if every caller resolves to
 * the same module instance. Two independent imports = two maps, and widget
 * dispatch silently drops because `setWidget(id, el)` writes to graph A while
 * `BlockWidget.toDOM()` reads from graph B.
 *
 * All Kanopi code MUST import from this file, not from `@strudel/codemirror`.
 * ESLint rule enforcement is pending — for now grep:
 *   grep -rn "from '@strudel/codemirror'" src/
 * must return only this file.
 *
 * Vite's `resolve.dedupe` is configured for @strudel/codemirror in parallel
 * (see vite.config.ts) so even third-party imports coming via @strudel/web
 * resolve to the same chunk.
 */
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import * as cm from '@strudel/codemirror';

// @strudel/codemirror's .d.ts only surfaces a subset of its runtime exports.
// The bits Kanopi actually consumes (widgetPlugin, updateWidgets, setWidget,
// addWidget, extensions, highlightExtension, highlightMiniLocations) are
// present at runtime but absent from the type declaration, so we cast once.
type StrudelCM = {
  widgetPlugin: Extension[];
  updateWidgets: (view: EditorView, widgets: unknown[]) => void;
  setWidget: (id: string, el: HTMLElement) => void;
  addWidget: (view: EditorView, widget: unknown) => void;
  extensions: Record<string, (v: unknown) => Extension>;
  highlightExtension: Extension;
  highlightMiniLocations: (view: EditorView, time: number, haps: unknown[]) => void;
};

const cmAny = cm as unknown as StrudelCM;

export const widgetPlugin: Extension[] = cmAny.widgetPlugin;
export const updateWidgets = cmAny.updateWidgets;
export const setWidget = cmAny.setWidget;
export const addWidget = cmAny.addWidget;
export const extensions = cmAny.extensions;
export const highlightExtension = cmAny.highlightExtension;
export const highlightMiniLocations = cmAny.highlightMiniLocations;
