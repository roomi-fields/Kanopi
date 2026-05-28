import type { Page, ConsoleMessage } from '@playwright/test';

/**
 * Patch `AudioContext` so every instance gets an `AnalyserNode` tapped between
 * the original destination and a shadow `GainNode`. The tap exposes a global
 * `__getKanopiRMS()` that returns the current RMS of the active context's
 * output, sampled via `getByteTimeDomainData()`.
 *
 * MUST be invoked BEFORE `page.goto()` so the constructor patch is in place
 * before any Kanopi adapter (Strudel, Tone.js inside Mercury, Csound) opens
 * its own context. Idempotent: a second call replaces the previous tap.
 */
export async function setupAudioCapture(page: Page): Promise<{
  getRMS: () => Promise<number>;
}> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
      __kanopiAnalysers?: AnalyserNode[];
      __getKanopiRMS?: () => number;
    };
    const Native = w.AudioContext ?? w.webkitAudioContext;
    if (!Native) return;
    const analysers: AnalyserNode[] = [];
    w.__kanopiAnalysers = analysers;

    // Wrap the constructor: every newly created AudioContext gets its own
    // AnalyserNode pushed into the registry. The connect-time patch below
    // tees the analyser into any node that connects to this context's
    // destination — that's our observation point on the master output.
    const NativeCtor = Native as unknown as new (options?: AudioContextOptions) => AudioContext;
    const Patched = function (this: AudioContext, options?: AudioContextOptions) {
      const inst = new NativeCtor(options);
      try {
        const analyser = inst.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0;
        analysers.push(analyser);
      } catch {
        /* best-effort */
      }
      return inst;
    } as unknown as typeof AudioContext;
    Patched.prototype = NativeCtor.prototype;
    w.AudioContext = Patched;
    if (w.webkitAudioContext) w.webkitAudioContext = Patched;

    // Monkey-patch every node creation factory to tap output into the analyser.
    // Each AudioContext exposes the same set of factories; iterate via prototype.
    const proto = Native.prototype as unknown as Record<string, unknown>;
    const factoryNames = Object.getOwnPropertyNames(proto).filter(
      (n) =>
        n.startsWith('create') &&
        n !== 'createScriptProcessor' &&
        typeof (proto as Record<string, unknown>)[n] === 'function'
    );
    for (const name of factoryNames) {
      const orig = (proto as Record<string, (...args: unknown[]) => unknown>)[name];
      (proto as Record<string, unknown>)[name] = function (this: AudioContext, ...args: unknown[]) {
        const node = orig.apply(this, args) as AudioNode;
        // Don't try to tap the analyser into itself, nor input nodes (which
        // wouldn't accept a connection from another node).
        if (node && typeof (node as AudioNode).connect === 'function') {
          const myAnalyser = analysers[analysers.length - 1];
          if (myAnalyser && node !== (myAnalyser as unknown as AudioNode)) {
            const origConnect = node.connect.bind(node);
            (node as unknown as { connect: AudioNode['connect'] }).connect = ((
              dst: AudioNode | AudioParam,
              ...rest: unknown[]
            ) => {
              // Tee into the analyser whenever the node connects to the
              // context's destination — that's the audible-output boundary.
              if (dst === this.destination) {
                try {
                  origConnect(myAnalyser);
                } catch {
                  /* tap is best-effort */
                }
              }
              return (origConnect as (...a: unknown[]) => AudioNode)(dst, ...rest);
            }) as AudioNode['connect'];
          }
        }
        return node;
      };
    }

    w.__getKanopiRMS = () => {
      const list = w.__kanopiAnalysers ?? [];
      let max = 0;
      for (const an of list) {
        try {
          const buf = new Uint8Array(an.fftSize);
          an.getByteTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          if (rms > max) max = rms;
        } catch {
          /* skip */
        }
      }
      return max;
    };
  });

  return {
    getRMS: async () => {
      return await page.evaluate(() => {
        const w = window as unknown as { __getKanopiRMS?: () => number };
        return typeof w.__getKanopiRMS === 'function' ? w.__getKanopiRMS() : 0;
      });
    }
  };
}

/**
 * Move the CodeMirror cursor to `line` (1-indexed), trigger `Ctrl/Meta+Enter`
 * to evaluate the surrounding block, and wait for the green/red eval flash to
 * appear and clear. Returns once the flash has been removed (so callers can
 * proceed with assertions on post-eval state).
 */
export async function evalBlockAt(page: Page, line: number): Promise<void> {
  // Locate the focused CodeMirror editor. CM6 always renders a `.cm-content`
  // div with `contenteditable=true`; clicking it focuses the editor and a
  // subsequent keyboard event drives the keymap.
  const content = page.locator('.cm-content').first();
  await content.click();
  // Position the cursor: dispatch through CM's view API rather than synthetic
  // arrow-key presses (faster, deterministic, no off-by-one on long lines).
  await page.evaluate((targetLine) => {
    const root = document.querySelector('.cm-editor') as
      | (HTMLElement & { cmView?: { view?: unknown } })
      | null;
    const view = root?.cmView?.view as
      | {
          state: { doc: { line: (n: number) => { from: number } } };
          dispatch: (tr: { selection: { anchor: number } }) => void;
        }
      | undefined;
    if (!view) return;
    const lineInfo = view.state.doc.line(targetLine);
    view.dispatch({ selection: { anchor: lineInfo.from } });
  }, line);
  // Modifier+Enter — on Linux/Win that's Control+Enter, on macOS Meta+Enter.
  // Playwright's `ControlOrMeta` modifier resolves per-OS automatically.
  await page.keyboard.press('ControlOrMeta+Enter');
  // Wait for the flash to appear, then disappear. The eval-flash decorations
  // are tagged with `.cm-flash-ok` / `.cm-flash-err` (cf eval-flash.ts:12-13)
  // and removed by a timeout of 350ms (eval-flash.ts:54). Allow generous
  // budgets so a slow Strudel boot doesn't fail the wait spuriously.
  try {
    await page
      .locator('.cm-flash-ok, .cm-flash-err')
      .first()
      .waitFor({ state: 'attached', timeout: 4000 });
  } catch {
    /* flash may have come and gone faster than we polled — that's still ok */
  }
  await page
    .locator('.cm-flash-ok, .cm-flash-err')
    .first()
    .waitFor({ state: 'detached', timeout: 4000 })
    .catch(() => {
      /* same as above */
    });
}

// Patterns that we never count as real errors. Strudel logs "user gesture
// required" through console.error in some browsers before its first eval, and
// vite-plugin-pwa prints info about the service worker that some browsers
// elevate to error severity in headless mode.
const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /user gesture/i,
  /service worker/i,
  /favicon/i,
  /workbox/i
];

/**
 * Start collecting `console.error` events from the page. Returns a thunk that,
 * when called, asserts no non-benign error was logged since the helper was set up.
 * Throws with the full list of unexpected errors if any.
 */
export function expectNoConsoleErrors(page: Page): () => void {
  const errors: string[] = [];
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN_ERROR_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  };
  page.on('console', handler);
  return () => {
    page.off('console', handler);
    if (errors.length > 0) {
      throw new Error(
        `expected no console.error, got ${errors.length}:\n - ${errors.join('\n - ')}`
      );
    }
  };
}
