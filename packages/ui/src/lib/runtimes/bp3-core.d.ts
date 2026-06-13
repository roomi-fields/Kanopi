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

declare module '*/core/src/dispatcher/resolver.js' {
  export class Resolver {
    constructor(config?: unknown);
    resolve(token: string, direction?: string): unknown;
  }
}
