import { Injectable, signal } from '@angular/core';

export type AppearanceMode = 'light' | 'dark';

const appearanceStorageKey = 'tali-setting-darkMode';

@Injectable({ providedIn: 'root' })
export class AppearanceService {
  readonly mode = signal<AppearanceMode>(this.readMode());

  constructor() {
    this.applyMode(this.mode());
  }

  setMode(mode: AppearanceMode) {
    this.mode.set(mode);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(appearanceStorageKey, String(mode === 'dark'));
      }
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
    this.applyMode(mode);
  }

  private readMode(): AppearanceMode {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(appearanceStorageKey) === 'true'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  }

  private applyMode(mode: AppearanceMode) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isDark = mode === 'dark';
    root.classList.toggle('app-dark', isDark);
    root.classList.toggle('app-light', !isDark);
    root.style.colorScheme = mode;
  }
}
