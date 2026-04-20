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
   * Select which viz is showing in the right-panel Viz tab. Unlike the
   * inline block widgets (`._pianoroll()` etc., rendered by @strudel/codemirror
   * as CM6 decorations), the right panel is an always-on global overview.
   * Kept as an opt-in surface — no auto-reveal.
   */
  showViz(which: VizTab) {
    this.vizTab = which;
  }

  togglePalette() {
    this.paletteOpen = !this.paletteOpen;
  }
}

export const ui = new UiStore();
