import { core } from '../lib/core';
import type { Actor } from '../lib/core';

class ActorsStore {
  list = $state<Actor[]>(core.actors.list());

  constructor() {
    core.actors.subscribe((a) => {
      this.list = a;
    });
  }

  toggle(name: string) { core.actors.toggle(name); }
  toggleMute(name: string) { core.actors.toggleMute(name); }
  unmuteAll() { core.actors.unmuteAll(); }
}

export const actors = new ActorsStore();
