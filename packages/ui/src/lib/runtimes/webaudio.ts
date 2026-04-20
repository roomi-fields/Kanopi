import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

let ctx: AudioContext | undefined;
const sources = new Map<string, () => void>();
const adapterEvents: EventBus = createEventBus();

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function srcKey(s: EvalSource): string {
  return s.actorId ?? `block:${s.fileId}`;
}

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'js',
    source: fileId,
    t: performance.now(),
    name
  });
}

export const jsAdapter: RuntimeAdapter = {
  id: 'js',
  events: adapterEvents,
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    try {
      // stop previous instance for this source
      sources.get(srcKey(src))?.();
      sources.delete(srcKey(src));

      const audio = getCtx();
      const stoppers: Array<() => void> = [];
      const helpers = {
        register: (stop: () => void) => stoppers.push(stop)
      };
      // eslint-disable-next-line no-new-func
      const fn = new Function('audio', 'helpers', code);
      fn(audio, helpers);
      sources.set(srcKey(src), () => stoppers.forEach((s) => s()));
      log({ runtime: 'js', level: 'info', msg: `eval ok (${code.length}b)` });
      emitLifecycle('eval', src.fileId);
    } catch (err) {
      log({ runtime: 'js', level: 'error', msg: String(err) });
      throw err;
    }
  },
  async stop(src: EvalSource, log: LogPush) {
    sources.get(srcKey(src))?.();
    sources.delete(srcKey(src));
    log({ runtime: 'js', level: 'info', msg: `stop ${srcKey(src)}` });
    emitLifecycle('stop', src.fileId);
  },
  async dispose() {
    sources.forEach((s) => s());
    sources.clear();
    await ctx?.close();
    ctx = undefined;
  }
};
