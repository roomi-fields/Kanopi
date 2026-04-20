// Runtime-agnostic pattern highlight for CodeMirror.
// Subscribes to core.events ('token'), decorates the matching source range
// for the duration of the event, and auto-dismisses. Works for any runtime
// that emits KanopiEvent.token with `locations` containing the active fileId.
//
// See docs/design/EVENTS.md for the event contract.

import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { core } from '../../lib/core';
import type { TokenEvent } from '../../lib/events/types';

interface ActivePulse {
  from: number;
  to: number;
  startAt: number; // wall-clock ms — don't show before this time
  until: number; // wall-clock ms — dismiss at/after this time
}

const setActivePulses = StateEffect.define<ActivePulse[]>();

const pulseMark = Decoration.mark({ class: 'cm-pattern-pulse' });

const pulseField = StateField.define<ActivePulse[]>({
  create: () => [],
  update(value, tr) {
    // Remap ranges through document changes so highlights stay on the right
    // token even if the user types while the pattern plays.
    let next = value;
    if (tr.docChanged) {
      next = value
        .map((p) => ({
          from: tr.changes.mapPos(p.from),
          to: tr.changes.mapPos(p.to),
          startAt: p.startAt,
          until: p.until
        }))
        .filter((p) => p.from < p.to);
    }
    for (const e of tr.effects) {
      if (e.is(setActivePulses)) return e.value;
    }
    return next;
  }
});

const pulsesToDecorations = EditorView.decorations.compute(
  [pulseField],
  (state) => {
    const pulses = state.field(pulseField, false) ?? [];
    const docLen = state.doc.length;
    const now = performance.now();
    const b = new RangeSetBuilder<Decoration>();
    // Only show pulses whose startAt has been reached. Pulses scheduled in the
    // future sit in the field but stay invisible until the frame tick catches
    // up — this aligns the visual flash with the audible onset rather than
    // firing at event-receive time (scheduler lookahead ~100ms).
    const visible = pulses.filter((p) => p.startAt <= now);
    const sorted = [...visible].sort((a, b) => a.from - b.from || a.to - b.to);
    let lastFrom = -1;
    let lastTo = -1;
    for (const p of sorted) {
      const from = Math.max(0, Math.min(p.from, docLen));
      const to = Math.max(0, Math.min(p.to, docLen));
      if (to <= from) continue;
      if (from === lastFrom && to === lastTo) continue;
      if (from < lastFrom) continue;
      b.add(from, to, pulseMark);
      lastFrom = from;
      lastTo = to;
    }
    return b.finish();
  }
);

export const patternHighlightTheme = EditorView.baseTheme({
  '.cm-pattern-pulse': {
    backgroundColor: 'rgba(232, 156, 62, 0.25)',
    boxShadow: 'inset 0 0 0 1px rgba(232, 156, 62, 0.7)',
    borderRadius: '2px',
    transition: 'background-color 0.15s ease-out'
  }
});

// ViewPlugin subscribes to core.events for this editor's fileId, collects
// token pulses in a rAF-batched queue, and dispatches a single effect per
// frame. This keeps the CM transaction count bounded even under 60+ haps/sec.
export function patternHighlightPlugin(getFileId: () => string) {
  return ViewPlugin.fromClass(
    class {
      private pending: ActivePulse[] = [];
      private active: ActivePulse[] = [];
      private rafId = 0;
      private unsubscribe?: () => void;
      private view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
        this.frame = this.frame.bind(this);
        this.unsubscribe = core.events.on('token', (e: TokenEvent) => {
          if (!e.locations?.length) return;
          const fileId = getFileId();
          if (!fileId) return;
          // `e.t` is wall-clock ms of the audible onset (converted from the
          // Strudel scheduler's audio-clock lookahead). Using it as `startAt`
          // keeps the flash visually aligned with the sound instead of firing
          // at event-receive time (which would be ~100ms ahead).
          const startAt = e.t;
          const until = Math.max(startAt + 80, startAt + Math.max(60, e.duration));
          for (const [from, to, locFileId] of e.locations) {
            if (locFileId !== fileId) continue;
            if (typeof from !== 'number' || typeof to !== 'number') continue;
            if (to <= from) continue;
            this.pending.push({ from, to, startAt, until });
          }
          if (this.pending.length && !this.rafId) {
            this.rafId = requestAnimationFrame(this.frame);
          }
        });
      }

      private frame() {
        this.rafId = 0;
        const now = performance.now();
        // Drop expired pulses and merge pending in one pass.
        const kept = this.active.filter((p) => p.until > now);
        const next = kept.concat(this.pending);
        this.pending = [];
        this.active = next;
        this.view.dispatch({ effects: setActivePulses.of(next) });
        // Re-schedule while there's any pulse that still needs to flip
        // state — either waiting to start (startAt in the future) or to end
        // (until in the future). Avoids staying silent during the lookahead
        // window before any pulse has crossed its startAt.
        if (next.some((p) => p.until > now)) {
          this.rafId = requestAnimationFrame(this.frame);
        } else if (next.length > 0) {
          this.rafId = requestAnimationFrame(this.frame);
        }
      }

      destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.unsubscribe?.();
      }
    }
  );
}

export function patternHighlightExtension(getFileId: () => string) {
  return [pulseField, pulsesToDecorations, patternHighlightTheme, patternHighlightPlugin(getFileId)];
}
