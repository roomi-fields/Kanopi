declare module '@strudel/codemirror' {
  import type { Extension } from '@codemirror/state';
  export const highlightExtension: Extension;
  export const flashField: Extension;
  export const extensions: Record<string, (value: unknown) => Extension>;
  export function isFlashEnabled(enabled: boolean): Extension;
  export function isPatternHighlightingEnabled(enabled: boolean, ...args: unknown[]): Extension;
  export function flash(view: unknown, duration?: number): void;
  export function setFlash(enabled: boolean): Extension;
  export function highlightMiniLocations(view: unknown, atTime: number, haps: unknown[]): void;
  export function setMiniLocations(view: unknown, locations: unknown[]): void;
  export const theme: unknown;
  export const themes: Record<string, unknown>;
  export function activateTheme(name: string): void;
}

declare module '@strudel/mini' {
  export function mini(strings: TemplateStringsArray | string, ...values: unknown[]): unknown;
}
