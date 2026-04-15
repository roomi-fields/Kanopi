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
