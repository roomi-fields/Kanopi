import { core } from '../lib/core';
import type { Mapping } from '../lib/core';

class InspectorStore {
  mappings = $state<Mapping[]>(core.maps.list());

  constructor() {
    core.maps.subscribe((m) => {
      this.mappings = m;
    });
  }
}

export const inspector = new InspectorStore();
