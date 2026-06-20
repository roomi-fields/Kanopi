/**
 * Ambient types for the `packages/core` dispatcher / transport / resolver
 * consumed by the Bol Processor adapter. Core is plain JS with JSDoc but no
 * `.d.ts`; we type only the surface the adapter touches. Reused AS-IS — no
 * port. Wildcard specifiers match the relative `../../../../core/...` imports.
 */

declare module '*/core/src/dispatcher/dispatcher.js' {
  export class Dispatcher {
    constructor(audioCtx: AudioContext);
    addTransport(name: string, transport: unknown): void;
    load(timedTokens: Array<{ token: string; start: number; end: number }>): void;
    start(onEnd?: (() => void) | undefined, options?: { loop?: boolean }): void;
    stop(): void;
  }
}

declare module '*/core/src/dispatcher/transports/webaudio.js' {
  export class WebAudioTransport {
    constructor(audioCtx: AudioContext, options?: { resolver?: unknown });
  }
}

declare module '*/core/src/dispatcher/transports/midi.js' {
  export class MidiTransport {
    constructor(options?: { outputIndex?: number; resolver?: unknown });
    init(): Promise<void>;
  }
}

declare module '*/core/src/dispatcher/resolver.js' {
  export class Resolver {
    constructor(config?: unknown);
    resolve(token: string, direction?: string): unknown;
  }
}

declare module '*/core/src/dispatcher/scale.js' {
  // Concrete (normalized float) ratios for a `ratios`/`compose`+`junction` scale,
  // or null for a `degrees`-based mode (use the degrees+temperament path).
  export function resolveScaleRatios(
    name: string,
    scalesCatalog: Record<string, unknown>
  ): number[] | null;
}

declare module '*/core/src/dispatcher/cv-curve.js' {
  // Generic CV curve evaluator: a library `curve` block → the value-over-time the
  // transport applies to a CV input. `segments` → breakpoints; other kinds pass
  // through as a descriptor for the transport (oscillator / buffer / worklet).
  export function renderCVCurve(
    curve: unknown,
    params?: Record<string, unknown>,
    gateSec?: number
  ): {
    kind: string;
    points?: Array<{ tSec: number; value: number; shape: string }>;
    spec?: unknown;
    params?: Record<string, unknown>;
    gateSec?: number;
  };
}
