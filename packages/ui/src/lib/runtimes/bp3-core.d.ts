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
  // Coerces numeric-string control values to numbers (vel/filterQ/…) while
  // leaving non-numeric strings (wave) and CV descriptor objects untouched.
  // Reused AS-IS by the Kronos audio adapter to build the WebAudio event.
  export function coerceControlValues(
    controls: Record<string, unknown> | null | undefined
  ): Record<string, unknown>;
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
