// Type surface for the vendored `timeline.js` (Canvas 2D piano-roll). Only the
// methods Kanopi's wrapper uses are declared; the vendored file is plain JS and
// must not be edited beyond its header comment.

export interface TimelineToken {
  token: string;
  start: number;
  end: number;
  type?: string;
  actor?: string | null;
}

export interface TimelineLoadOptions {
  cvTable?: unknown;
  controlTable?: unknown;
  source?: string;
}

// A head-rule section drawn as a labeled band along the timeline (times in ms),
// independent of polymetric structure.
export interface TimelineSection {
  name: string;
  startMs: number;
  endMs: number;
}

export interface TimelineOptions {
  onSelect?: (note: unknown, voiceIndex: number, blockIndex: number) => void;
  onSeek?: (ms: number) => void;
  onResize?: (...args: unknown[]) => void;
  onSelectGroup?: (...args: unknown[]) => void;
  onResizeGroup?: (...args: unknown[]) => void;
}

export class Timeline {
  constructor(canvas: HTMLCanvasElement, options?: TimelineOptions);
  load(tokens: TimelineToken[], options?: TimelineLoadOptions): void;
  resize(): void;
  render(): void;
  setCursor(ms: number): void;
  /** Set the cursor and paint synchronously (no deferred rAF) — for callers
   *  already inside their own coalescing rAF that must not lag a frame behind. */
  setCursorNow(ms: number): void;
  clearCursor(): void;
  setSections(sections: TimelineSection[]): void;
  destroy(): void;
}
