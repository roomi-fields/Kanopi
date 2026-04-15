import { ui } from '../../stores/ui.svelte';
import { clock } from '../../stores/clock.svelte';
import { core } from '../core';

export function isMod(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

function inEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
}

export function handleGlobalKey(e: KeyboardEvent) {
  // Cmd/Ctrl + K (primary) or Cmd/Ctrl + Shift + P (alt) → open palette
  if (isMod(e) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  if (isMod(e) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  // Cmd/Ctrl + . → hush all (Tidal convention)
  if (isMod(e) && !e.shiftKey && !e.altKey && e.key === '.') {
    e.preventDefault();
    void core.hushAll();
    return;
  }
  // Space toggles play/stop only if not editing
  if (e.code === 'Space' && !inEditableTarget(e) && !isMod(e) && !e.altKey) {
    e.preventDefault();
    clock.toggle();
  }
}

export function installGlobalKeybindings() {
  window.addEventListener('keydown', handleGlobalKey);
  return () => window.removeEventListener('keydown', handleGlobalKey);
}
