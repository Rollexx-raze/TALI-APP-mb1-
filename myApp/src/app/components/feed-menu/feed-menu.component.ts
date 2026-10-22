import { Component, effect, inject } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  bookmarkOutline,
  chevronForwardOutline,
  closeOutline,
  heartOutline,
  optionsOutline,
  peopleOutline,
} from 'ionicons/icons';

import { AccountService } from '../../services/account.service';
import { Group, GroupService } from '../../services/group.service';
import { Post, PostService } from '../../services/post.service';
import { FeedLibraryService } from '../../services/feed-library.service';

type FeedView = 'menu' | 'reacted' | 'saved';

@Component({
  selector: 'app-feed-menu',
  standalone: true,
  imports: [IonIcon, IonModal],
  template: `
    <button
      class="feed-trigger"
      type="button"
      aria-label="Open feeds"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open"
      (click)="show($event)"
    >
      <ion-icon name="options-outline" aria-hidden="true"></ion-icon>
    </button>

    <ion-modal
      class="feeds-modal"
      [isOpen]="open"
      [backdropDismiss]="true"
      (didDismiss)="close()"
    >
      <ng-template>
        <section class="feeds-sheet" aria-label="Feeds">
          <header class="sheet-header">
            @if (view !== 'menu') {
              <button
                type="button"
                class="icon-button"
                aria-label="Back to feeds"
                (click)="back()"
              >
                <ion-icon name="arrow-back-outline"></ion-icon>
              </button>
            }

            <h2>{{ title }}</h2>

            <button
              type="button"
              class="icon-button"
              aria-label="Close feeds"
              (click)="close()"
            >
              <ion-icon name="close-outline"></ion-icon>
            </button>
          </header>

          <div class="sheet-body">
            @if (!accounts.selectedAccount()) {
              <p class="empty">
                Select an account to see your feeds.
              </p>
            } @else if (view === 'menu') {
              <div class="shortcuts">
                <button type="button" (click)="view = 'reacted'">
                  <ion-icon name="heart-outline"></ion-icon>
                  <span>Reacted posts</span>
                </button>

                <button type="button" (click)="view = 'saved'">
                  <ion-icon name="bookmark-outline"></ion-icon>
                  <span>Saved posts</span>
                </button>
              </div>

              @if (groups.loading()) {
                <p class="empty" role="status">Loading communities…</p>
              } @else if (groups.loadError()) {
                <p class="error" role="alert">
                  {{ groups.loadError() }}
                </p>
              } @else {
                <h3>Frequently visited</h3>

                <div class="community-list">
                  @for (group of library.frequentGroups; track group.id) {
                    <button
                      class="community-row"
                      type="button"
                      (click)="openGroup(group)"
                    >
                      <span class="community-image">
                        @if (group.photo) {
                          <img [src]="group.photo" alt="" />
                        } @else {
                          <ion-icon name="people-outline"></ion-icon>
                        }
                      </span>

                      <span class="community-copy">
                        <strong>{{ group.name }}</strong>
                        <small>
                          {{ group.memberIds.length }} members
                        </small>
                      </span>

                      <ion-icon
                        class="chevron"
                        name="chevron-forward-outline"
                      ></ion-icon>
                    </button>
                  } @empty {
                    <p class="empty">
                      Communities you visit will appear here.
                    </p>
                  }
                </div>

                <h3>Your communities</h3>

                <div class="community-list">
                  @for (group of library.joinedGroups; track group.id) {
                    <button
                      class="community-row"
                      type="button"
                      (click)="openGroup(group)"
                    >
                      <span class="community-image">
                        @if (group.photo) {
                          <img [src]="group.photo" alt="" />
                        } @else {
                          <ion-icon name="people-outline"></ion-icon>
                        }
                      </span>

                      <span class="community-copy">
                        <strong>{{ group.name }}</strong>
                        <small>Joined</small>
                      </span>

                      <ion-icon
                        class="chevron"
                        name="chevron-forward-outline"
                      ></ion-icon>
                    </button>
                  } @empty {
                    <p class="empty">
                      @if (library.frequentGroups.length) {
                        Other communities you join will appear here.
                      } @else {
                        You haven’t joined a community yet.
                      }
                    </p>
                  }
                </div>

                <button
                  class="explore-link"
                  type="button"
                  (click)="exploreGroups()"
                >
                  Explore communities
                  <ion-icon name="chevron-forward-outline"></ion-icon>
                </button>
              }
            } @else {
              @if (posts.loading()) {
                <p class="empty" role="status">Loading posts…</p>
              } @else if (posts.loadError()) {
                <p class="error" role="alert">
                  {{ posts.loadError() }}
                </p>
              } @else {
                <p class="list-description">
                  {{
                    view === 'reacted'
                      ? 'Posts you currently like.'
                      : 'Posts you saved for later.'
                  }}
                </p>

                @for (post of selectedPosts; track post.id) {
                  <article class="library-post">
                    <button
                      type="button"
                      class="post-preview"
                      (click)="openPost(post)"
                    >
                      <strong>{{ post.authorName }}</strong>
                      <small>{{ post.authorUsername }}</small>
                      <p>{{ post.body || 'View attached media' }}</p>

                      @if (previewImage(post); as image) {
                        <img
                          class="post-thumbnail"
                          [src]="image"
                          alt="Post image"
                        />
                      }
                    </button>

                    <div class="library-actions">
                      <button type="button" (click)="openPost(post)">
                        Open post
                        <ion-icon name="chevron-forward-outline"></ion-icon>
                      </button>

                      <button
                        type="button"
                        (click)="toggleSaved(post)"
                        [attr.aria-pressed]="library.isSaved(post.id)"
                      >
                        <ion-icon name="bookmark-outline"></ion-icon>
                        {{ library.isSaved(post.id) ? 'Unsave' : 'Save' }}
                      </button>
                    </div>
                  </article>
                } @empty {
                  <p class="empty">
                    {{
                      view === 'reacted'
                        ? 'No liked posts available yet.'
                        : 'No saved posts available yet.'
                    }}
                  </p>
                }
              }
            }

            @if (error) {
              <p class="error" role="alert">{{ error }}</p>
            }
          </div>
        </section>
      </ng-template>
    </ion-modal>
  `,
  styles: [`
    :host {
      display: block;
      width: 44px;
      height: 44px;
    }

    .feed-trigger {
      display: grid;
      width: 44px;
      height: 44px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: var(--radius-inner, 12px);
      background: transparent;
      color: var(--text, var(--app-text));
      cursor: pointer;
    }

    .feed-trigger ion-icon {
      font-size: var(--font-subheading, 20px);
    }

    .feeds-modal {
      --width: min(100%, 520px);
      --height: min(88dvh, 780px);
      --border-radius: 24px;
      --background: var(--bg, var(--app-background));
    }

    .feeds-sheet {
      display: flex;
      height: 100%;
      min-height: 0;
      flex-direction: column;
      background: var(--bg, var(--app-background));
      color: var(--text, var(--app-text));
    }

    .sheet-header {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 8px;
      padding: 18px 18px 8px;
    }

    h2 {
      flex: 1;
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -.5px;
    }

    .icon-button {
      display: grid;
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }

    .icon-button ion-icon {
      font-size: 23px;
    }

    .sheet-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px 18px calc(24px + env(safe-area-inset-bottom, 0px));
    }

    button {
      font: inherit;
    }

    .shortcuts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .shortcuts button {
      display: flex;
      min-height: 76px;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--border, var(--app-divider));
      border-radius: 16px;
      background: var(--surface, var(--app-surface));
      color: var(--text, var(--app-text));
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .shortcuts ion-icon {
      flex: 0 0 auto;
      color: var(--primary, var(--app-primary));
      font-size: 27px;
    }

    h3 {
      margin: 28px 2px 12px;
      font-size: 17px;
      font-weight: 650;
    }

    .community-list {
      overflow: hidden;
      border: 1px solid var(--border, var(--app-divider));
      border-radius: 18px;
      background: var(--surface, var(--app-surface));
    }

    .community-row {
      display: flex;
      width: 100%;
      min-height: 86px;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .community-row + .community-row {
      border-top: 1px solid var(--border, var(--app-divider));
    }

    .community-image {
      display: grid;
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      place-items: center;
      overflow: hidden;
      border-radius: 12px;
      background: var(--surface-alt, var(--app-surface-alt));
      color: var(--primary, var(--app-primary));
    }

    .community-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .community-image ion-icon {
      font-size: 25px;
    }

    .community-copy {
      display: grid;
      flex: 1;
      min-width: 0;
      gap: 5px;
    }

    .community-copy strong {
      overflow-wrap: anywhere;
      font-size: 15px;
      font-weight: 600;
    }

    small,
    .chevron,
    .empty,
    .list-description {
      color: var(--text-muted, var(--app-muted));
    }

    small {
      font-size: 12px;
    }

    .chevron {
      flex: 0 0 auto;
      font-size: 18px;
    }

    .empty {
      margin: 0;
      padding: 20px 16px;
      font-size: 14px;
      line-height: 1.5;
    }

    .explore-link {
      display: flex;
      min-height: 48px;
      align-items: center;
      gap: 6px;
      margin-top: 16px;
      padding: 0 2px;
      border: 0;
      background: transparent;
      color: var(--primary, var(--app-primary));
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .list-description {
      margin: 0 0 16px;
      font-size: 14px;
    }

    .library-post {
      overflow: hidden;
      margin-bottom: 14px;
      border: 1px solid var(--border, var(--app-divider));
      border-radius: 18px;
      background: var(--surface, var(--app-surface));
    }

    .post-preview {
      display: block;
      width: 100%;
      padding: 16px;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .post-preview strong,
    .post-preview small {
      display: block;
      overflow-wrap: anywhere;
    }

    .post-preview small {
      margin-top: 4px;
    }

    .post-preview p {
      display: -webkit-box;
      overflow: hidden;
      margin: 12px 0 0;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .post-thumbnail {
      display: block;
      width: 100%;
      max-height: 210px;
      margin-top: 12px;
      border-radius: 12px;
      object-fit: cover;
    }

    .library-actions {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 12px;
      border-top: 1px solid var(--border, var(--app-divider));
    }

    .library-actions button {
      display: flex;
      min-height: 44px;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border: 0;
      background: transparent;
      color: var(--primary, var(--app-primary));
      font-size: 13px;
      cursor: pointer;
    }

    .error {
      color: var(--danger, var(--ion-color-danger));
      font-size: 13px;
      line-height: 1.5;
    }

    button:focus-visible {
      outline: 2px solid var(--primary, var(--app-primary));
      outline-offset: -3px;
    }

    @media (max-width: 560px) {
      .feeds-modal {
        align-items: flex-end;
        --border-radius: 24px 24px 0 0;
      }
    }
  `],
})
export class FeedMenuComponent {
  readonly accounts = inject(AccountService);
  readonly groups = inject(GroupService);
  readonly posts = inject(PostService);
  readonly library = inject(FeedLibraryService);

  private readonly router = inject(Router);

  open = false;
  view: FeedView = 'menu';
  error = '';
  private actorId: number | null = null;

  constructor() {
    addIcons({
      arrowBackOutline,
      bookmarkOutline,
      chevronForwardOutline,
      closeOutline,
      heartOutline,
      optionsOutline,
      peopleOutline,
    });

    effect(() => {
      const id = this.accounts.selectedAccount()?.id ?? null;

      if (this.open && id !== this.actorId) {
        this.close();
      }
    });
  }

  get title() {
    return this.view === 'reacted'
      ? 'Reacted posts'
      : this.view === 'saved'
        ? 'Saved posts'
        : 'Feeds';
  }

  get selectedPosts() {
    return this.view === 'reacted'
      ? this.library.reactedPosts
      : this.library.savedPosts;
  }

  show(event: MouseEvent) {
    (event.currentTarget as HTMLElement).blur();
    this.actorId = this.accounts.selectedAccount()?.id ?? null;
    this.view = 'menu';
    this.error = '';
    this.open = true;
  }

  close() {
    this.open = false;
    this.error = '';
  }

  back() {
    this.view = 'menu';
    this.error = '';
  }

  previewImage(post: Post) {
    return post.attachments.find(
      (attachment) => attachment.type.startsWith('image/'),
    )?.dataUrl;
  }

  toggleSaved(post: Post) {
    this.error = this.library.toggleSaved(post.id)
      ? ''
      : 'Could not update saved posts. Check browser storage.';
  }

  async openGroup(group: Group) {
    this.close();

    await this.router.navigate(['/groups', group.id]);
  }

  async exploreGroups() {
    this.close();

    await this.router.navigate(['/groups']);
  }

  async openPost(post: Post) {
    if (!this.library.canAccessPost(post)) {
      this.error = 'This post is no longer available.';
      return;
    }

    this.close();

    await this.router.navigate(['/home'], {
      queryParams: {
        postId: post.id,
        openComments: 'true',
      },
    });
  }
}