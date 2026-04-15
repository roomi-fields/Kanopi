import { core } from '../lib/core';
import type { LogEntry } from '../lib/core';

class ConsoleStore {
  entries = $state<LogEntry[]>(core.console.entries());

  constructor() {
    core.console.subscribe((e) => {
      this.entries = e;
    });
  }

  clear() { core.console.clear(); }
}

export const consoleLog = new ConsoleStore();
