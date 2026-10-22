import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AccountService } from './account.service';
import { Group, GroupService } from './group.service';
import { Post, PostService } from './post.service';

interface GroupVisit {
  groupId: string;
  count: number;
  lastVisited: number;
}

interface FeedLibrary {
  savedIds: string[];
  visits: GroupVisit[];
}

type LibraryStore = Record<string, FeedLibrary>;

const storageKey = 'tali-feed-library-v1';

@Injectable({ providedIn: 'root' })
export class FeedLibraryService {
  private readonly accounts = inject(AccountService);
  private readonly posts = inject(PostService);
  private readonly groups = inject(GroupService);
  private readonly router = inject(Router);

  private readonly store = signal<LibraryStore>(this.readStore());
  private lastGroupLocation = '';

  constructor() {
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          void this.trackGroupLocation(event.urlAfterRedirects);
        }
      });

    void this.trackGroupLocation(this.router.url);
  }

  get current(): FeedLibrary {
    const id = this.accounts.selectedAccount()?.id;

    return id === undefined
      ? { savedIds: [], visits: [] }
      : this.store()[String(id)] ?? { savedIds: [], visits: [] };
  }

  isSaved(postId: string) {
    return this.current.savedIds.includes(postId);
  }

  canAccessPost(post: Post) {
    const account = this.accounts.selectedAccount();

    if (!account || post.trashedAt || post.archivedAt) return false;

    return post.groupId
      ? this.groups.canViewGroupPost(post.groupId, account.id)
      : this.posts.canViewPost(
          post,
          account,
          this.accounts.accounts(),
        );
  }

  get reactedPosts() {
    const id = this.accounts.selectedAccount()?.id;

    if (id === undefined) return [];

    return this.posts.posts()
      .filter((post) =>
        post.likes.includes(id) && this.canAccessPost(post),
      )
      .sort((a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime(),
      );
  }

  get savedPosts() {
    const postsById = new Map(
      this.posts.posts().map((post) => [post.id, post]),
    );

    return this.current.savedIds.flatMap((id): Post[] => {
      const post = postsById.get(id);

      return post && this.canAccessPost(post) ? [post] : [];
    });
  }

  toggleSaved(postId: string): boolean {
    const account = this.accounts.selectedAccount();

    if (!account) return false;

    const current = this.current;
    const saved = current.savedIds.includes(postId);

    if (!saved) {
      const post = this.posts.posts().find((item) => item.id === postId);

      if (!post || !this.canAccessPost(post)) return false;
    }

    return this.writeAccount(account.id, {
      ...current,
      savedIds: saved
        ? current.savedIds.filter((id) => id !== postId)
        : [postId, ...current.savedIds],
    });
  }

  get frequentGroups(): Group[] {
    const account = this.accounts.selectedAccount();

    if (!account) return [];

    return [...this.current.visits]
      .sort((a, b) =>
        b.count - a.count || b.lastVisited - a.lastVisited,
      )
      .flatMap((visit): Group[] => {
        const group = this.groups.getGroupById(visit.groupId);

        return group &&
          this.groups.canViewGroupPost(group.id, account.id)
          ? [group]
          : [];
      })
      .slice(0, 5);
  }

  get joinedGroups(): Group[] {
    const account = this.accounts.selectedAccount();

    if (!account) return [];

    const frequentIds = new Set(
      this.frequentGroups.map((group) => group.id),
    );

    return this.groups.groups()
      .filter((group) =>
        group.memberIds.includes(account.id) &&
        !frequentIds.has(group.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async trackGroupLocation(url: string) {
    const pathname = url.split(/[?#]/, 1)[0];
    const match = pathname.match(/^\/groups\/([^/]+)\/?$/);
    const accountId = this.accounts.selectedAccount()?.id;

    if (!match || accountId === undefined) {
      this.lastGroupLocation = '';
      return;
    }

    let groupId: string;

    try {
      groupId = decodeURIComponent(match[1]);
    } catch {
      return;
    }

    const locationKey = `${accountId}:${groupId}`;

    if (locationKey === this.lastGroupLocation) return;

    this.lastGroupLocation = locationKey;

    await this.groups.groupsHydrated;

    if (
      this.accounts.selectedAccount()?.id !== accountId ||
      this.lastGroupLocation !== locationKey
    ) {
      return;
    }

    const group = this.groups.getGroupById(groupId);

    if (
      !group ||
      !this.groups.canViewGroupPost(groupId, accountId)
    ) {
      this.lastGroupLocation = '';
      return;
    }

    const current = this.current;
    const previous = current.visits.find(
      (visit) => visit.groupId === groupId,
    );

    this.writeAccount(accountId, {
      ...current,
      visits: [
        {
          groupId,
          count: (previous?.count ?? 0) + 1,
          lastVisited: Date.now(),
        },
        ...current.visits.filter(
          (visit) => visit.groupId !== groupId,
        ),
      ].slice(0, 100),
    });
  }

  private writeAccount(accountId: number, library: FeedLibrary) {
    const next = {
      ...this.store(),
      [String(accountId)]: library,
    };

    try {
      if (typeof localStorage === 'undefined') return false;

      localStorage.setItem(storageKey, JSON.stringify(next));
      this.store.set(next);
      return true;
    } catch {
      return false;
    }
  }

  private readStore(): LibraryStore {
    try {
      if (typeof localStorage === 'undefined') return {};

      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? '{}',
      );

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }

      const result: LibraryStore = {};

      for (const [accountId, entry] of Object.entries(value)) {
        if (
          !/^\d+$/.test(accountId) ||
          !entry ||
          typeof entry !== 'object'
        ) {
          continue;
        }

        const record = entry as Partial<FeedLibrary>;

        const savedIds = Array.isArray(record.savedIds)
          ? record.savedIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];

        const visits = Array.isArray(record.visits)
          ? record.visits.filter((visit) =>
              visit &&
              typeof visit.groupId === 'string' &&
              Number.isSafeInteger(visit.count) &&
              visit.count > 0 &&
              Number.isFinite(visit.lastVisited),
            )
          : [];

        result[accountId] = {
          savedIds: [...new Set(savedIds)],
          visits: visits.slice(0, 100),
        };
      }

      return result;
    } catch {
      return {};
    }
  }
}