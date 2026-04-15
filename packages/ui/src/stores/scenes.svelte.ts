import { core } from '../lib/core';
import type { Scene } from '../lib/core';

class ScenesStore {
  list = $state<Scene[]>(core.scenes.list());

  constructor() {
    core.scenes.subscribe((s) => {
      this.list = s;
    });
  }

  activate(name: string) { core.scenes.activate(name); }

  get active(): Scene | undefined {
    return this.list.find((s) => s.active);
  }
}

export const scenes = new ScenesStore();
