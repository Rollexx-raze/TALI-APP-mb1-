import { Component, EventEmitter, Input, Output, inject } from '@angular/core';

import { AccountService } from '../../services/account.service';
import { FeedLibraryService } from '../../services/feed-library.service';

@Component({
  selector: 'app-post-save',
  standalone: true,
  template: `
    <button
      type="button"
      role="menuitem"
      (click)="toggle()"
    >
      <span>{{ library.isSaved(postId) ? 'Unsave post' : 'Save post' }}</span>

      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12v18l-6-4-6 4z"></path>
      </svg>
    </button>

    @if (error) {
      <p role="alert">{{ error }}</p>
    }
  `,
  styles: [`
    :host {
      display: block;
      border-bottom: 1px solid var(--post-menu-line);
    }

    button {
      display: flex;
      width: 100%;
      min-height: 52px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 0;
      padding: 12px 14px;
      border: 0;
      border-radius: 0;
      background: var(--post-menu-card);
      color: var(--post-menu-text);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
    }

    svg {
      width: 21px;
      height: 21px;
      flex: 0 0 21px;
      fill: none;
      stroke: var(--post-menu-accent);
      stroke-width: 1.65;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    button:hover {
      background: color-mix(
        in srgb,
        var(--post-menu-accent) 9%,
        var(--post-menu-card)
      );
    }

    button:focus-visible {
      outline: 2px solid var(--post-menu-accent);
      outline-offset: -3px;
    }

    p {
      margin: 0;
      padding: 8px 14px;
      color: var(--post-menu-danger);
      font-size: 12px;
    }
  `],
})
export class PostSaveComponent {
  @Input({ required: true }) postId!: string;
  @Output() changed = new EventEmitter<void>();

  readonly library = inject(FeedLibraryService);
  private readonly accounts = inject(AccountService);

  error = '';

  toggle() {
    if (!this.accounts.selectedAccount()) {
      this.error = 'Select an account to save posts.';
      return;
    }

    if (!this.library.toggleSaved(this.postId)) {
      this.error = 'Could not save this change in browser storage.';
      return;
    }

    this.error = '';
    this.changed.emit();
  }
}