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
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class Hydra {
    constructor(opts: HydraOptions);
  }
  export default Hydra;
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
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  export const Mercury: new (opts?: MercuryOptions) => MercuryInstance;
}
