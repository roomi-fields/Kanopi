export type ActivityView = 'files' | 'library' | 'search' | 'hardware' | 'git' | 'docs' | 'account';
export type RightPanelTab = 'actors' | 'scenes' | 'inspector' | 'console' | 'viz';
export type VizTab = 'pianoroll' | 'scope' | 'spectrum';

class UiStore {
  activeActivityView = $state<ActivityView>('files');
  sidebarCollapsed = $state(false);
  rightPanelTab = $state<RightPanelTab>('actors');
  vizTab = $state<VizTab>('pianoroll');
  paletteOpen = $state(false);
  sidebarWidth = $state(260);
  rightPanelWidth = $state(300);

  setSidebarWidth(n: number) { this.sidebarWidth = Math.max(160, Math.min(600, n)); }
  setRightPanelWidth(n: number) { this.rightPanelWidth = Math.max(180, Math.min(600, n)); }

  setActivity(v: ActivityView) {
    if (this.activeActivityView === v && !this.sidebarCollapsed) {
      this.sidebarCollapsed = true;
    } else {
      this.activeActivityView = v;
      this.sidebarCollapsed = false;
    }
  }

  setRightPanel(t: RightPanelTab) {
    this.rightPanelTab = t;
  }

  /**
   * Route a code-driven viz hint to the right panel. Called by the Strudel
   * adapter when the evaluated code contains `.scope()`, `.pianoroll()` or
   * similar — the panel auto-reveals with the requested viz selected.
   * Mirrors the Strudel REPL convention: `$: s("bd").scope()` opens a scope.
   */
  showViz(which: VizTab) {
    this.vizTab = which;
    this.rightPanelTab = 'viz';
  }

  togglePalette() {
    this.paletteOpen = !this.paletteOpen;
  }
}

export const ui = new UiStore();
