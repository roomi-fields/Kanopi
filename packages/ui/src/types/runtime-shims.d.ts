declare module '@strudel/web' {
  export function initStrudel(opts?: Record<string, unknown>): Promise<unknown>;
  export function evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  export function hush(): void;
  export function samples(url: string | Record<string, unknown>, base?: string): Promise<unknown>;
}

declare module 'hydra-synth' {
  interface HydraOptions {
    canvas: HTMLCanvasElement;
    detectAudio?: boolean;
    makeGlobal?: boolean;
    enableStreamCapture?: boolean;
    autoLoop?: boolean;
  }
  class Hydra {
    constructor(opts: HydraOptions);
  }
  export default Hydra;
}

declare module '@hlolli/codemirror-lang-csound' {
  // Upstream ships types at dist/index.d.ts but the package.json `typings`
  // field points at the non-existent root-level index.d.ts. This shim
  // mirrors the public surface we actually use — upgrade if the package
  // fixes its `typings` field.
  import type { LRLanguage, LanguageSupport } from '@codemirror/language';
  interface CsoundModeOptions {
    enableCompletion?: boolean;
    enableSynopsis?: boolean;
    enableDefaultTheme?: boolean;
    fileType?: 'csd' | 'orc' | 'sco';
  }
  export const csdLanguage: LRLanguage;
  export const orcLanguage: LRLanguage;
  export const scoLanguage: LRLanguage;
  export function csoundMode(options?: CsoundModeOptions): LanguageSupport;
}

declare module 'mercury-engine' {
  // Minimal surface the Kanopi adapter consumes. Upstream `Mercury`
  // exposes far more (addBuffers, addMeter, resume, …) — extend here as
  // Kanopi wires additional features. Philosophy 2 (§KANOPI_PRINCIPLES
  // principle 3 corollary): `hydra` and `p5canvas` options are
  // intentionally absent because the adapter never passes them.
  interface MercuryOptions {
    onload?: () => void;
    onmidi?: (evt: unknown) => void;
  }
  interface MercuryInstance {
    code: (str: string) => { errors?: unknown[] };
    resume: () => void;
    silence: () => void;
    setBPM: (bpm: number, ramp?: number) => void;
  }
  export const Mercury: new (opts?: MercuryOptions) => MercuryInstance;
}
