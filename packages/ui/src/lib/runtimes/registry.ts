import type { Runtime } from '../core-mock';
import type { RuntimeAdapter } from './adapter';
import { strudelAdapter, tidalAdapter } from './strudel';
import { hydraAdapter } from './hydra';
import { p5Adapter } from './p5';
import { jsAdapter } from './webaudio';

const adapters = new Map<Runtime, RuntimeAdapter>([
  ['strudel', strudelAdapter],
  ['tidal', tidalAdapter],
  ['hydra', hydraAdapter],
  ['p5', p5Adapter],
  ['js', jsAdapter]
]);

export function getAdapter(runtime: Runtime): RuntimeAdapter | undefined {
  return adapters.get(runtime);
}

export function listRuntimes(): Runtime[] {
  return [...adapters.keys()];
}
