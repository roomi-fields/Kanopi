import { core } from '../lib/core';
import type { ClockState } from '../lib/core';

class ClockStore {
  state = $state<ClockState>(core.clock.state);

  constructor() {
    core.clock.subscribe((s) => {
      this.state = s;
    });
  }

  play() { core.clock.play(); }
  stop() { core.clock.stop(); }
  toggle() { core.clock.toggle(); }
  setBpm(n: number) { core.clock.setBpm(n); }
  setTimeSignature(bpb: number) { core.clock.setTimeSignature(bpb); }
  tap() { core.clock.tap(); }
}

export const clock = new ClockStore();
