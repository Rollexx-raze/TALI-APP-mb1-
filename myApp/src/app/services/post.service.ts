import { Injectable, inject, signal } from '@angular/core';
import type { Account } from './account.service';
import { loadBrowserData, saveBrowserData } from './browser-data.store';
import { NotificationService } from './notification.service';

export type PostAudience = 'public' | 'friends' | 'friends-of-friends' | 'selected-friends' | 'hide-from' | 'only-me';

export interface PostAttachment {
  name: string;
  type: string;
  dataUrl: string;
}

export interface PostComment {
  id: string;
  authorId: number;
  authorName: string;
  authorUsername: string;
  body: string;
  createdAt: Date;
}

export interface Post {
  id: string;
  authorId: number | null;
  groupId?: string;
  authorName: string;
  authorUsername: string;
  body: string;
  attachments: PostAttachment[];
  audience: PostAudience;
  audienceAccountIds: number[];
  likes: number[];
  comments: PostComment[];
  reposts: number[];
  createdAt: Date;
  archivedAt?: Date | null;
  trashedAt?: Date | null;
  notificationsDisabled?: boolean;
  updatedAt?: Date;
}

export type NewPost = Omit<Post, 'id' | 'createdAt' | 'likes' | 'comments' | 'reposts'>;

const postsStorageKey = 'tali-posts';
const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly notificationService = optionalNotificationService();
  readonly posts = signal<Post[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  private localLoadError: unknown;
  private nextId = 0;
  private nextCommentId = 0;
  private changedBeforeHydration = false;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private trashCleanupTimer: number | undefined;

  constructor() {
    const posts = this.loadPosts();
    this.posts.set(posts);
    let browserLoadError: unknown;
    void loadBrowserData(postsStorageKey, posts, isStoredPostList, (error) => {
      browserLoadError = error;
      console.error('Could not load saved posts from browser storage.', error);
    }).then((savedRecords) => {
      const indexedPosts = savedRecords.filter(isStoredPost).map(restorePostDates);
      // Merge the synchronous backup with IndexedDB so a partial/failed
      // browser database write cannot make older valid posts disappear.
      const savedPosts = mergePosts(posts, indexedPosts);
      const mergedPosts = this.changedBeforeHydration
        ? mergePosts(savedPosts, this.posts())
        : savedPosts;
      this.posts.set(this.removeExpiredTrash(mergedPosts));
      this.loading.set(false);
      if ((browserLoadError ?? this.localLoadError) !== undefined && this.posts().length === 0) {
        this.loadError.set('Posts could not be loaded. Check your browser storage and try again.');
      }
      if (this.changedBeforeHydration || this.posts().length !== mergedPosts.length) this.persistPosts();
      this.scheduleTrashCleanup();
    }, (error: unknown) => {
      console.error('Could not load saved posts.', error);
      this.loading.set(false);
      this.loadError.set('Posts could not be loaded. Check your browser storage and try again.');
    });
  }

  addPost(post: NewPost, actor?: Pick<Account, 'id' | 'name' | 'username'>, accounts: Account[] = []) {
    return this.publishPost(post, actor, accounts, false);
  }

  addGroupPost(post: NewPost, actor: Pick<Account, 'id' | 'name' | 'username'>, accounts: Account[] = []) {
    return this.publishPost(post, actor, accounts, true);
  }

  private publishPost(
    post: NewPost,
    actor: Pick<Account, 'id' | 'name' | 'username'> | undefined,
    accounts: Account[],
    requirePersistence: boolean,
  ) {
    const previousPosts = this.posts();
    const publishedPost: Post = {
      ...post,
      id: `${Date.now()}-${++this.nextId}`,
      likes: [],
      comments: [],
      reposts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      trashedAt: null,
      notificationsDisabled: false,
    };

    this.posts.update((posts) => [publishedPost, ...posts]);
    if (!this.persistPosts() && requirePersistence) {
      this.posts.set(previousPosts);
      throw new Error('The group post could not be saved in this browser.');
    }
    if (actor) this.notificationService?.notifyMentions(actor, publishedPost.body, accounts, publishedPost.id, publishedPost.groupId);
    return publishedPost;
  }

  toggleLike(postId: string, actorOrId: number | Pick<Account, 'id' | 'name' | 'username'>) {
    const actor = typeof actorOrId === 'number' ? null : actorOrId;
    const accountId = typeof actorOrId === 'number' ? actorOrId : actorOrId.id;
    const post = this.posts().find((item) => item.id === postId);
    const alreadyLiked = post?.likes.includes(accountId) ?? false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId) return post;
      const likes = post.likes.includes(accountId)
        ? post.likes.filter((id) => id !== accountId)
        : [...post.likes, accountId];
      return { ...post, likes };
    }));
    this.persistPosts();
    if (post && actor && !alreadyLiked && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction('like', actor, post.authorId, post.id, post.body, post.groupId);
    }
  }

  addComment(
    postId: string,
    account: Pick<Account, 'id' | 'name' | 'username'>,
    body: string,
    accounts: Account[] = [],
  ) {
    const post = this.posts().find((item) => item.id === postId);
    const comment: PostComment = {
      id: `${Date.now()}-${++this.nextCommentId}`,
      authorId: account.id,
      authorName: account.name,
      authorUsername: account.username,
      body: body.trim(),
      createdAt: new Date(),
    };
    this.posts.update((posts) => posts.map((post) =>
      post.id === postId ? { ...post, comments: [...post.comments, comment] } : post,
    ));
    this.persistPosts();
    if (post && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction('comment', account, post.authorId, post.id, body, post.groupId);
      this.notificationService?.notifyMentions(account, body, accounts, post.id, post.groupId);
    }
    return comment;
  }

  toggleRepost(postId: string, actorOrId: number | Pick<Account, 'id' | 'name' | 'username'>) {
    const actor = typeof actorOrId === 'number' ? null : actorOrId;
    const accountId = typeof actorOrId === 'number' ? actorOrId : actorOrId.id;
    const post = this.posts().find((item) => item.id === postId);
    const alreadyReposted = post?.reposts.includes(accountId) ?? false;
    if (!alreadyReposted && !isSettingEnabled('sharingEnabled', true)) return;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId) return post;
      const reposts = post.reposts.includes(accountId)
        ? post.reposts.filter((id) => id !== accountId)
        : [...post.reposts, accountId];
      return { ...post, reposts };
    }));
    this.persistPosts();
    if (post && actor && !alreadyReposted && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction('repost', actor, post.authorId, post.id, post.body, post.groupId);
    }
  }

  recordShare(postId: string, actor: Pick<Account, 'id' | 'name' | 'username'>) {
    if (!isSettingEnabled('sharingEnabled', true)) return;
    const post = this.posts().find((item) => item.id === postId);
    if (post && !post.notificationsDisabled) this.notificationService?.notifyPostAction('share', actor, post.authorId, post.id, post.body, post.groupId);
  }

  canViewPost(post: Post, viewer: Account | null, accounts: Account[]) {
    if (post.trashedAt) return false;
    if (post.archivedAt) return viewer?.id === post.authorId;
    if (viewer && post.authorId === viewer.id) return true;
    if (!viewer) return post.audience === 'public' || post.audience === 'hide-from';

    const author = accounts.find((account) => account.id === post.authorId);
    const areFriends = (first: Account, second: Account) =>
      first.followingIds.includes(second.id) && second.followingIds.includes(first.id);

    if (author?.privacy === 'private' && (!viewer || !areFriends(author, viewer))) return false;

    switch (post.audience) {
      case 'public':
        return true;
      case 'friends':
        return Boolean(author && areFriends(author, viewer));
      case 'friends-of-friends':
        return Boolean(author && accounts.some((friend) =>
          friend.id !== author.id && friend.id !== viewer.id &&
          areFriends(author, friend) && areFriends(friend, viewer),
        ));
      case 'selected-friends':
        return post.audienceAccountIds.includes(viewer.id);
      case 'hide-from':
        return !post.audienceAccountIds.includes(viewer.id);
      case 'only-me':
        return false;
    }
  }

  updateAuthor(accountId: number, authorName: string, authorUsername: string) {
    this.posts.update((posts) => posts.map((post) => post.authorId === accountId
      ? { ...post, authorName, authorUsername }
      : post));
    this.persistPosts();
  }

  updatePost(postId: string, ownerId: number, body: string) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || post.trashedAt) return post;
      updated = true;
      return { ...post, body: body.trim() };
    }));
    if (updated) this.persistPosts();
    return updated;
  }

  setPostNotifications(postId: string, ownerId: number, disabled: boolean) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || post.trashedAt) return post;
      updated = true;
      return { ...post, notificationsDisabled: disabled };
    }));
    if (updated) this.persistPosts();
  }

  archivePost(postId: string, ownerId: number) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || post.trashedAt) return post;
      updated = true;
      return { ...post, archivedAt: new Date() };
    }));
    if (updated) this.persistPosts();
  }

  unarchivePost(postId: string, ownerId: number) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || post.trashedAt) return post;
      updated = true;
      return { ...post, archivedAt: null };
    }));
    if (updated) this.persistPosts();
  }

  trashPost(postId: string, ownerId: number) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || post.trashedAt) return post;
      updated = true;
      return { ...post, trashedAt: new Date(), archivedAt: null };
    }));
    if (updated) { this.persistPosts(); this.scheduleTrashCleanup(); }
  }

  restorePost(postId: string, ownerId: number) {
    let updated = false;
    this.posts.update((posts) => posts.map((post) => {
      if (post.id !== postId || post.authorId !== ownerId || !post.trashedAt) return post;
      updated = true;
      return { ...post, trashedAt: null };
    }));
    if (updated) { this.persistPosts(); this.scheduleTrashCleanup(); }
  }

  permanentlyDeletePost(postId: string, ownerId: number) {
    const existing = this.posts().find((post) => post.id === postId);
    if (!existing || existing.authorId !== ownerId || !existing.trashedAt) return;
    this.posts.update((posts) => posts.filter((post) => post.id !== postId));
    this.persistPosts();
    this.scheduleTrashCleanup();
  }

  removeGroupPosts(groupId: string) {
    const existingPosts = this.posts();
    const remainingPosts = existingPosts.filter((post) => post.groupId !== groupId);
    if (remainingPosts.length === existingPosts.length) return true;
    this.posts.set(remainingPosts);
    if (!this.persistPosts(false)) {
      this.posts.set(existingPosts);
      return false;
    }
    return true;
  }

  private loadPosts(): Post[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(postsStorageKey) ?? '[]') as unknown;
      if (!Array.isArray(stored)) {
        this.localLoadError = new Error('Saved post data in local storage is not a list.');
        console.error('Could not read saved posts from local storage.', this.localLoadError);
        return [];
      }
      return this.removeExpiredTrash(stored.filter(isStoredPost).map(restorePostDates));
    } catch (error) {
      this.localLoadError = error;
      console.error('Could not read saved posts from local storage.', error);
      return [];
    }
  }

  private persistPosts(updateTimestamps = true) {
    this.changedBeforeHydration = true;
    const updatedAt = new Date();
    const updatedPosts = updateTimestamps
      ? this.posts().map((post) => ({ ...post, updatedAt }))
      : this.posts();
    this.posts.set(updatedPosts);
    const snapshot = updatedPosts.map((post) => ({ ...post, attachments: [...post.attachments], likes: [...post.likes], comments: [...post.comments], reposts: [...post.reposts] }));
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(postsStorageKey, JSON.stringify(snapshot));
      } catch (error) {
        console.error('Could not save posts to local storage.', error);
        return false;
      }
    }
    this.persistenceQueue = this.persistenceQueue.then(() => saveBrowserData(postsStorageKey, snapshot));
    return true;
  }

  private removeExpiredTrash(posts: Post[]) {
    const expiration = Date.now() - trashRetentionMs;
    return posts.filter((post) => !post.trashedAt || new Date(post.trashedAt).getTime() > expiration);
  }

  private scheduleTrashCleanup() {
    if (typeof window === 'undefined') return;
    if (this.trashCleanupTimer !== undefined) window.clearTimeout(this.trashCleanupTimer);
    const nextExpiration = this.posts()
      .filter((post) => post.trashedAt)
      .reduce((soonest, post) => Math.min(soonest, new Date(post.trashedAt!).getTime() + trashRetentionMs), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextExpiration)) return;

    // Recheck at least once a day so no browser timer needs to span 30 days.
    const delay = Math.max(0, Math.min(nextExpiration - Date.now(), 24 * 60 * 60 * 1000));
    this.trashCleanupTimer = window.setTimeout(() => {
      const remaining = this.removeExpiredTrash(this.posts());
      if (remaining.length !== this.posts().length) {
        this.posts.set(remaining);
        this.persistPosts();
      }
      this.scheduleTrashCleanup();
    }, delay);
  }
}

function optionalNotificationService(): NotificationService | null {
  try {
    return inject(NotificationService);
  } catch {
    // Keep direct construction working in unit tests and non-Angular utilities.
    return null;
  }
}

function isSettingEnabled(key: string, fallback: boolean) {
  if (typeof localStorage === 'undefined') return fallback;
  return localStorage.getItem(`tali-setting-${key}`) !== 'false';
}

function isStoredPostList(value: unknown): value is Post[] {
  // Keep valid rows even if one old/corrupt record cannot be decoded.
  return Array.isArray(value);
}

function mergePosts(savedPosts: Post[], currentPosts: Post[]): Post[] {
  const merged = new Map(savedPosts.map((post) => [post.id, post]));
  for (const post of currentPosts) {
    const saved = merged.get(post.id);
    const savedTime = saved?.updatedAt?.getTime() ?? saved?.createdAt.getTime() ?? 0;
    const currentTime = post.updatedAt?.getTime() ?? post.createdAt.getTime() ?? 0;
    if (!saved || currentTime >= savedTime) merged.set(post.id, post);
  }
  return [...merged.values()].sort((first, second) =>
    new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function restorePostDates(post: Post): Post {
  return {
    ...post,
    createdAt: new Date(post.createdAt),
    archivedAt: post.archivedAt ? new Date(post.archivedAt) : null,
    trashedAt: post.trashedAt ? new Date(post.trashedAt) : null,
    updatedAt: post.updatedAt ? new Date(post.updatedAt) : undefined,
    comments: post.comments.map((comment) => ({ ...comment, createdAt: new Date(comment.createdAt) })),
  };
}

function isStoredPost(value: unknown): value is Post {
  if (typeof value !== 'object' || value === null) return false;
  const post = value as Partial<Post>;
  const validIdList = (items: unknown) => Array.isArray(items) && items.every((id) => Number.isSafeInteger(id));
  const validAttachmentList = (items: unknown) => Array.isArray(items) && items.every((attachment) => {
    if (typeof attachment !== 'object' || attachment === null) return false;
    const item = attachment as Partial<PostAttachment>;
    return typeof item.name === 'string' && typeof item.type === 'string' && typeof item.dataUrl === 'string';
  });
  const validCommentList = (items: unknown) => Array.isArray(items) && items.every((comment) => {
    if (typeof comment !== 'object' || comment === null) return false;
    const item = comment as Partial<PostComment>;
    return typeof item.id === 'string' && Number.isSafeInteger(item.authorId) &&
      typeof item.authorName === 'string' && typeof item.authorUsername === 'string' &&
      typeof item.body === 'string' && isValidDateValue(item.createdAt);
  });
  return typeof post.id === 'string' &&
    (typeof post.authorId === 'number' || post.authorId === null) &&
    typeof post.authorName === 'string' &&
    typeof post.authorUsername === 'string' &&
    typeof post.body === 'string' &&
    validAttachmentList(post.attachments) &&
    validIdList(post.audienceAccountIds) &&
    validIdList(post.likes) &&
    validCommentList(post.comments) &&
    validIdList(post.reposts) &&
    ['public', 'friends', 'friends-of-friends', 'selected-friends', 'hide-from', 'only-me'].includes(String(post.audience)) &&
    isValidDateValue(post.createdAt) &&
    (post.updatedAt === undefined || isValidDateValue(post.updatedAt)) &&
    (post.archivedAt === undefined || post.archivedAt === null || isValidDateValue(post.archivedAt)) &&
    (post.trashedAt === undefined || post.trashedAt === null || isValidDateValue(post.trashedAt)) &&
    (post.notificationsDisabled === undefined || typeof post.notificationsDisabled === 'boolean');
}

function isValidDateValue(value: unknown): value is string | Date {
  if (!(typeof value === 'string' || value instanceof Date)) return false;
  return Number.isFinite(new Date(value).getTime());
}
