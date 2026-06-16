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
  clearCursor(): void;
  destroy(): void;
}
