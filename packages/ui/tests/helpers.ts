import type { Page, ConsoleMessage } from '@playwright/test';

/**
 * Patch `AudioContext` so every instance gets an `AnalyserNode` tapped onto
 * every node that connects to that context's destination. The tap exposes a
 * global `__getKanopiRMS()` that returns the current RMS of the active
 * context's output, sampled via `getByteTimeDomainData()`.
 *
 * Implementation: rather than wrapping each createX() factory (which misses
 * `new AudioWorkletNode(...)` paths used by Csound), we patch
 * `AudioNode.prototype.connect` once. That single hook catches every node —
 * factory-created or constructed — regardless of which adapter built it.
 *
 * MUST be invoked BEFORE `page.goto()` so the constructor patch is in place
 * before any Kanopi adapter (Strudel, Tone.js inside Mercury, Csound) opens
 * its own context.
 */
export async function setupAudioCapture(page: Page): Promise<{
  getRMS: () => Promise<number>;
  getMaxRMS: (sampleMs: number) => Promise<number>;
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

    // Wrap the constructor: one fresh AnalyserNode per AudioContext, plus a
    // back-reference (`__kAnalyser`) the connect patch can find on the
    // context of any node that calls .connect(destination).
    const NativeCtor = Native as unknown as new (options?: AudioContextOptions) => AudioContext;
    const Patched = function (this: AudioContext, options?: AudioContextOptions) {
      const inst = new NativeCtor(options);
      try {
        const analyser = inst.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0;
        analysers.push(analyser);
        (inst as unknown as { __kAnalyser?: AnalyserNode }).__kAnalyser = analyser;
      } catch {
        /* best-effort */
      }
      return inst;
    } as unknown as typeof AudioContext;
    Patched.prototype = NativeCtor.prototype;
    w.AudioContext = Patched;
    if (w.webkitAudioContext) w.webkitAudioContext = Patched;

    // Patch AudioNode.prototype.connect — catches every node (including
    // AudioWorkletNode, which Csound builds via `new AudioWorkletNode(...)`
    // and that a createX-factory wrap would miss).
    const ANP = (window as unknown as { AudioNode: { prototype: AudioNode } }).AudioNode.prototype;
    const origConnect = ANP.connect;
    (ANP as unknown as { connect: AudioNode['connect'] }).connect = function (
      this: AudioNode,
      dst: AudioNode | AudioParam,
      ...rest: unknown[]
    ) {
      const ctx = (this as AudioNode & { context: AudioContext }).context;
      const tap = (ctx as AudioContext & { __kAnalyser?: AnalyserNode }).__kAnalyser;
      const isDest = tap && dst && (dst as AudioNode) === (ctx.destination as AudioNode);
      if (isDest && this !== (tap as unknown as AudioNode)) {
        try {
          (origConnect as unknown as (this: AudioNode, dst: AudioNode) => AudioNode).call(
            this,
            tap as AudioNode
          );
        } catch {
          /* tap is best-effort */
        }
      }
      return (origConnect as unknown as (...args: unknown[]) => AudioNode).apply(this, [
        dst,
        ...rest
      ]);
    } as AudioNode['connect'];

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
    },
    // Sample RMS over a time window and return the peak. Live audio with
    // envelopes (Mercury notes, Strudel single hits) has instants of silence
    // between trigger envelopes — point-in-time sampling races against zero
    // crossings of the envelope. A window of ~1-2 seconds at ~50ms intervals
    // is plenty to catch the loudest moment.
    getMaxRMS: async (sampleMs: number) => {
      return await page.evaluate(async (ms: number) => {
        const w = window as unknown as { __getKanopiRMS?: () => number };
        if (typeof w.__getKanopiRMS !== 'function') return 0;
        const intervalMs = 50;
        const samples = Math.max(1, Math.ceil(ms / intervalMs));
        let max = 0;
        for (let i = 0; i < samples; i++) {
          const v = w.__getKanopiRMS();
          if (v > max) max = v;
          await new Promise((r) => setTimeout(r, intervalMs));
        }
        return max;
      }, sampleMs);
    }
  };
}

/**
 * Inject a fake Web MIDI access so runtime-midi's `MidiSink.init()` finds an
 * output port in headless Chromium (which has no real MIDI hardware). The fake
 * output's `send(bytes, ts)` pushes a copy of the raw MIDI bytes into a global
 * `__kanopiMidiBytes` array the test can read back.
 *
 * MUST be invoked BEFORE `page.goto()` so the override is in place before any
 * adapter calls `navigator.requestMIDIAccess()` (after the user gesture).
 */
export async function setupFakeMidi(page: Page): Promise<{
  getSent: () => Promise<number[][]>;
}> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __kanopiMidiBytes?: number[][];
      navigator: Navigator & {
        requestMIDIAccess?: (opts?: unknown) => Promise<unknown>;
      };
    };
    const sent: number[][] = [];
    w.__kanopiMidiBytes = sent;

    const fakeOutput = {
      id: 'kanopi-fake-out',
      name: 'Kanopi Fake MIDI Out',
      manufacturer: 'kanopi-test',
      type: 'output',
      state: 'connected',
      connection: 'open',
      // Web MIDI signature: send(data, timestamp?). runtime-midi passes raw
      // status/data byte arrays; copy them so later mutation can't corrupt the
      // capture.
      send: (data: number[] | Uint8Array) => {
        sent.push(Array.from(data));
      },
      clear: () => {},
      open: () => Promise.resolve(fakeOutput),
      close: () => Promise.resolve(fakeOutput),
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const outputsMap = new Map<string, typeof fakeOutput>([[fakeOutput.id, fakeOutput]]);
    const fakeAccess = {
      inputs: new Map(),
      outputs: outputsMap,
      sysexEnabled: false,
      onstatechange: null,
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    w.navigator.requestMIDIAccess = () => Promise.resolve(fakeAccess);
  });

  return {
    getSent: async () =>
      page.evaluate(() => {
        const w = window as unknown as { __kanopiMidiBytes?: number[][] };
        return w.__kanopiMidiBytes ?? [];
      })
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
  // Position the cursor via CM's view API. In current @codemirror/view, the
  // EditorView lives at `.cm-content`.cmTile.root.view (the `.cm-editor`'s
  // `cmView` shortcut is gone). Without this, the click-only path leaves the
  // cursor wherever the click landed (mid-file for tall fixtures), which
  // breaks runtimes whose extractor cares about cursor position — Csound
  // refuses to compileCSD unless the cursor is on `<CsoundSynthesizer>`.
  await page.evaluate((targetLine) => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { line: (n: number) => { from: number } } };
                dispatch: (tr: { selection: { anchor: number } }) => void;
              };
            };
          };
        })
      | null;
    const view = content?.cmTile?.root?.view;
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

/**
 * Read the non-black pixel count from a `<canvas>` matching `selector`,
 * sampling a centred WxH region. Performs the readback inside a
 * `requestAnimationFrame` callback so we capture pixels BEFORE the next
 * back-buffer swap clears them — without this, every WebGL canvas reads as
 * all zeros (the default `preserveDrawingBuffer: false` wipes after present).
 */
export async function readCanvasLitPixels(
  page: Page,
  selector: string,
  sampleW = 64,
  sampleH = 64,
  threshold = 16
): Promise<number> {
  return await page.evaluate(
    ({ sel, w, h, thr }) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const c = document.querySelector(sel) as HTMLCanvasElement | null;
          if (!c) {
            resolve(-1);
            return;
          }
          const gl =
            (c.getContext('webgl2') as WebGL2RenderingContext | null) ||
            (c.getContext('webgl') as WebGLRenderingContext | null);
          if (!gl) {
            resolve(-2);
            return;
          }
          const x = Math.max(0, Math.floor(c.width / 2) - w / 2);
          const y = Math.max(0, Math.floor(c.height / 2) - h / 2);
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let lit = 0;
          for (let i = 0; i < buf.length; i += 4) {
            if (buf[i] > thr || buf[i + 1] > thr || buf[i + 2] > thr) lit++;
          }
          resolve(lit);
        });
      }),
    { sel: selector, w: sampleW, h: sampleH, thr: threshold }
  );
}

// Patterns that we never count as real errors. Strudel logs "user gesture
// required" through console.error in some browsers before its first eval, and
// vite-plugin-pwa prints info about the service worker that some browsers
// elevate to error severity in headless mode.
const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /user gesture/i,
  /service worker/i,
  /favicon/i,
  /workbox/i,
  // GL_CLOSE_PATH_NV ReadPixels stall — emitted by Chromium when we
  // readPixels from a hi-DPI WebGL context. Performance hint, not an error.
  /GPU stall due to ReadPixels/i,
  // WebMIDI permission denied — mercury-engine asks for MIDI access on init;
  // we don't grant it in tests. Engine works fine without it.
  /WebMIDI not enabled/i,
  // Canvas 2D readback perf hint when we drawImage→getImageData a WebGL canvas.
  /willReadFrequently/i
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
