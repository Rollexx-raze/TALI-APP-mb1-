import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BottomNavVisibilityService {
  private readonly hiddenState = signal(false);

  readonly hidden = this.hiddenState.asReadonly();

  hide() {
    this.hiddenState.set(true);
  }

  show() {
    this.hiddenState.set(false);
  }
}