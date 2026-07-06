export type ActivityView =
  | 'files'
  | 'library'
  | 'resources'
  | 'search'
  | 'hardware'
  | 'git'
  | 'docs'
  | 'account';
export type RightPanelTab = 'actors' | 'scenes' | 'inspector';
export type BottomPanelTab = 'console' | 'text' | 'structure';
export type Theme = 'dark' | 'light';

const THEME_KEY = 'kanopi.theme';

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage unavailable (private mode, tests) — fall back to dark */
  }
  return 'dark';
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

class UiStore {
  activeActivityView = $state<ActivityView>('files');
  sidebarCollapsed = $state(false);
  rightPanelTab = $state<RightPanelTab>('actors');
  // KAN-21: Structure is the default bottom tab (the 'structure' production view).
  bottomPanelTab = $state<BottomPanelTab>('structure');
  bottomPanelHeight = $state(200);
  bottomPanelCollapsed = $state(false);
  paletteOpen = $state(false);
  sidebarWidth = $state(260);
  rightPanelWidth = $state(300);
  theme = $state<Theme>(loadTheme());

  constructor() {
    applyTheme(this.theme);
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    applyTheme(this.theme);
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch {
      /* best-effort persistence only */
    }
  }

  setSidebarWidth(n: number) {
    this.sidebarWidth = Math.max(160, Math.min(600, n));
  }
  setRightPanelWidth(n: number) {
    this.rightPanelWidth = Math.max(180, Math.min(600, n));
  }
  setBottomPanelHeight(n: number) {
    this.bottomPanelHeight = Math.max(80, Math.min(600, n));
  }

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

  setBottomPanel(t: BottomPanelTab) {
    this.bottomPanelTab = t;
    // Selecting a tab implies the panel should be visible.
    this.bottomPanelCollapsed = false;
  }

  toggleBottomPanel() {
    this.bottomPanelCollapsed = !this.bottomPanelCollapsed;
  }

  togglePalette() {
    this.paletteOpen = !this.paletteOpen;
  }
}

export const ui = new UiStore();
