import { Injectable, signal } from '@angular/core';

export type AppearanceMode = 'system' | 'light' | 'dark';

const appearanceStorageKey = 'tali-setting-appearance';
const legacyAppearanceStorageKey = 'tali-setting-darkMode';

@Injectable({ providedIn: 'root' })
export class AppearanceService {
  readonly mode = signal<AppearanceMode>(this.readMode());

  constructor() {
    this.applyMode(this.mode());
  }

  setMode(mode: AppearanceMode) {
    const changed = this.mode() !== mode;
    this.mode.set(mode);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(appearanceStorageKey, mode);
        if (mode === 'system') localStorage.removeItem(legacyAppearanceStorageKey);
        else localStorage.setItem(legacyAppearanceStorageKey, String(mode === 'dark'));
      }
    } catch {
      // Keep the selected appearance applied for this session if storage is unavailable.
    }
    if (changed && typeof document !== 'undefined' && typeof window !== 'undefined') {
      const root = document.documentElement;
      root.classList.add('app-theme-transition');
      void root.offsetWidth;
      this.applyMode(mode);
      window.setTimeout(() => root.classList.remove('app-theme-transition'), 300);
    } else {
      this.applyMode(mode);
    }
  }

  private readMode(): AppearanceMode {
    try {
      if (typeof localStorage === 'undefined') return 'system';
      const savedMode = localStorage.getItem(appearanceStorageKey);
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') return savedMode;
      const legacyMode = localStorage.getItem(legacyAppearanceStorageKey);
      if (legacyMode !== null) return legacyMode === 'true' ? 'dark' : 'light';
      return 'system';
    } catch {
      return 'system';
    }
  }

  private applyMode(mode: AppearanceMode) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('app-dark', mode === 'dark');
    root.classList.toggle('app-light', mode === 'light');
    root.style.colorScheme = mode === 'system' ? 'light dark' : mode;
  }
}
