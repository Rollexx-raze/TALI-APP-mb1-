import { Injectable, inject, signal } from '@angular/core';
import type { Account } from './account.service';
import { loadBrowserData, saveBrowserData } from './browser-data.store';
import { NotificationService } from './notification.service';

export type PostAudience =
  | 'public'
  | 'friends'
  | 'friends-of-friends'
  | 'selected-friends'
  | 'hide-from'
  | 'only-me';

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
  parentCommentId?: string | null;
  likes?: number[];
  reposts?: number[];
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

export type NewPost = Omit<
  Post,
  'id' | 'createdAt' | 'likes' | 'comments' | 'reposts'
>;

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

    void loadBrowserData(
      postsStorageKey,
      posts,
      isStoredPostList,
      (error) => {
        browserLoadError = error;
      },
    ).then(
      (savedRecords) => {
        const indexedPosts = savedRecords
          .filter(isStoredPost)
          .map(restorePostDates);

        const savedPosts = mergePosts(posts, indexedPosts);
        const mergedPosts = this.changedBeforeHydration
          ? mergePosts(savedPosts, this.posts())
          : savedPosts;

        this.posts.set(this.removeExpiredTrash(mergedPosts));
        this.loading.set(false);

        if (
          (browserLoadError ?? this.localLoadError) !== undefined &&
          this.posts().length === 0
        ) {
          this.loadError.set(
            'Posts could not be loaded. Check your browser storage and try again.',
          );
        }

        if (
          this.changedBeforeHydration ||
          this.posts().length !== mergedPosts.length
        ) {
          this.persistPosts();
        }

        this.scheduleTrashCleanup();
      },
      () => {
        this.loading.set(false);
        this.loadError.set(
          'Posts could not be loaded. Check your browser storage and try again.',
        );
      },
    );
  }

  addPost(
    post: NewPost,
    actor?: Pick<Account, 'id' | 'name' | 'username'>,
    accounts: Account[] = [],
  ) {
    return this.publishPost(post, actor, accounts, false);
  }

  addGroupPost(
    post: NewPost,
    actor: Pick<Account, 'id' | 'name' | 'username'>,
    accounts: Account[] = [],
  ) {
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

    this.posts.update((items) => [publishedPost, ...items]);

    if (!this.persistPosts() && requirePersistence) {
      this.posts.set(previousPosts);
      throw new Error('The group post could not be saved in this browser.');
    }

    if (actor) {
      this.notificationService?.notifyMentions(
        actor,
        publishedPost.body,
        accounts,
        publishedPost.id,
        publishedPost.groupId,
      );
    }

    return publishedPost;
  }

  toggleLike(
    postId: string,
    actorOrId: number | Pick<Account, 'id' | 'name' | 'username'>,
  ) {
    const actor = typeof actorOrId === 'number' ? null : actorOrId;
    const accountId =
      typeof actorOrId === 'number' ? actorOrId : actorOrId.id;

    const post = this.posts().find((item) => item.id === postId);
    const alreadyLiked = post?.likes.includes(accountId) ?? false;

    this.posts.update((items) =>
      items.map((item) => {
        if (item.id !== postId) return item;

        const likes = item.likes.includes(accountId)
          ? item.likes.filter((id) => id !== accountId)
          : [...item.likes, accountId];

        return { ...item, likes };
      }),
    );

    this.persistPosts();

    if (post && actor && !alreadyLiked && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction(
        'like',
        actor,
        post.authorId,
        post.id,
        post.body,
        post.groupId,
      );
    }
  }

  addComment(
    postId: string,
    account: Pick<Account, 'id' | 'name' | 'username'>,
    body: string,
    accounts: Account[] = [],
    parentCommentId: string | null = null,
  ): PostComment | null {
    const post = this.posts().find((item) => item.id === postId);
    const text = body.trim();

    if (!post || post.trashedAt || !text || text.length > 500) return null;
    if (!isSettingEnabled('commentsEnabled', true)) return null;

    if (parentCommentId && !post.comments.some(
      (comment) => comment.id === parentCommentId,
    )) {
      return null;
    }

    const comment: PostComment = {
      id: `${Date.now()}-${++this.nextCommentId}`,
      authorId: account.id,
      authorName: account.name,
      authorUsername: account.username,
      body: text,
      createdAt: new Date(),
      parentCommentId,
      likes: [],
      reposts: [],
    };

    this.posts.update((items) =>
      items.map((item) =>
        item.id === postId
          ? { ...item, comments: [...item.comments, comment] }
          : item,
      ),
    );

    this.persistPosts();

    if (!post.notificationsDisabled) {
      this.notificationService?.notifyPostAction(
        'comment',
        account,
        post.authorId,
        post.id,
        text,
        post.groupId,
      );

      this.notificationService?.notifyMentions(
        account,
        text,
        accounts,
        post.id,
        post.groupId,
      );
    }

    return comment;
  }

  toggleCommentLike(
    postId: string,
    commentId: string,
    account: Account,
    accounts: Account[],
  ): boolean {
    return this.toggleCommentReaction(
      postId,
      commentId,
      account,
      accounts,
      'likes',
    );
  }

  toggleCommentRepost(
    postId: string,
    commentId: string,
    account: Account,
    accounts: Account[],
  ): boolean {
    return this.toggleCommentReaction(
      postId,
      commentId,
      account,
      accounts,
      'reposts',
    );
  }

  private toggleCommentReaction(
    postId: string,
    commentId: string,
    account: Account,
    accounts: Account[],
    kind: 'likes' | 'reposts',
  ): boolean {
    const post = this.posts().find((item) => item.id === postId);
    const comment = post?.comments.find((item) => item.id === commentId);

    if (!post || !comment || !this.canViewPost(post, account, accounts)) {
      return false;
    }

    const selected = comment[kind]?.includes(account.id) ?? false;

    if (
      kind === 'reposts' &&
      !selected &&
      !isSettingEnabled('sharingEnabled', true)
    ) {
      return false;
    }

    this.posts.update((items) =>
      items.map((item) => {
        if (item.id !== postId) return item;

        return {
          ...item,
          comments: item.comments.map((entry) => {
            if (entry.id !== commentId) return entry;

            const ids = entry[kind] ?? [];

            return {
              ...entry,
              [kind]: selected
                ? ids.filter((id) => id !== account.id)
                : [...ids, account.id],
            };
          }),
        };
      }),
    );

    this.persistPosts();
    return true;
  }

  toggleRepost(
    postId: string,
    actorOrId: number | Pick<Account, 'id' | 'name' | 'username'>,
  ) {
    const actor = typeof actorOrId === 'number' ? null : actorOrId;
    const accountId =
      typeof actorOrId === 'number' ? actorOrId : actorOrId.id;

    const post = this.posts().find((item) => item.id === postId);
    const alreadyReposted = post?.reposts.includes(accountId) ?? false;

    if (!alreadyReposted && !isSettingEnabled('sharingEnabled', true)) {
      return;
    }

    this.posts.update((items) =>
      items.map((item) => {
        if (item.id !== postId) return item;

        const reposts = item.reposts.includes(accountId)
          ? item.reposts.filter((id) => id !== accountId)
          : [...item.reposts, accountId];

        return { ...item, reposts };
      }),
    );

    this.persistPosts();

    if (post && actor && !alreadyReposted && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction(
        'repost',
        actor,
        post.authorId,
        post.id,
        post.body,
        post.groupId,
      );
    }
  }

  recordShare(
    postId: string,
    actor: Pick<Account, 'id' | 'name' | 'username'>,
  ) {
    if (!isSettingEnabled('sharingEnabled', true)) return;

    const post = this.posts().find((item) => item.id === postId);

    if (post && !post.notificationsDisabled) {
      this.notificationService?.notifyPostAction(
        'share',
        actor,
        post.authorId,
        post.id,
        post.body,
        post.groupId,
      );
    }
  }

  canViewPost(post: Post, viewer: Account | null, accounts: Account[]) {
    if (post.trashedAt) return false;
    if (post.archivedAt) return viewer?.id === post.authorId;
    if (viewer && post.authorId === viewer.id) return true;

    if (!viewer) {
      return post.audience === 'public' || post.audience === 'hide-from';
    }

    const author = accounts.find((account) => account.id === post.authorId);

    const areFriends = (first: Account, second: Account) =>
      first.followingIds.includes(second.id) &&
      second.followingIds.includes(first.id);

    if (
      author?.privacy === 'private' &&
      !areFriends(author, viewer)
    ) {
      return false;
    }

    switch (post.audience) {
      case 'public':
        return true;
      case 'friends':
        return Boolean(author && areFriends(author, viewer));
      case 'friends-of-friends':
        return Boolean(
          author &&
          accounts.some((friend) =>
            friend.id !== author.id &&
            friend.id !== viewer.id &&
            areFriends(author, friend) &&
            areFriends(friend, viewer),
          ),
        );
      case 'selected-friends':
        return post.audienceAccountIds.includes(viewer.id);
      case 'hide-from':
        return !post.audienceAccountIds.includes(viewer.id);
      case 'only-me':
        return false;
    }
  }

  updateAuthor(
    accountId: number,
    authorName: string,
    authorUsername: string,
  ) {
    this.posts.update((items) =>
      items.map((post) =>
        post.authorId === accountId
          ? { ...post, authorName, authorUsername }
          : post,
      ),
    );

    this.persistPosts();
  }

  updatePost(postId: string, ownerId: number, body: string) {
    let updated = false;

    this.posts.update((items) =>
      items.map((post) => {
        if (
          post.id !== postId ||
          post.authorId !== ownerId ||
          post.trashedAt
        ) {
          return post;
        }

        updated = true;
        return { ...post, body: body.trim() };
      }),
    );

    if (updated) this.persistPosts();
    return updated;
  }

  setPostNotifications(postId: string, ownerId: number, disabled: boolean) {
    this.updateOwnedPost(postId, ownerId, {
      notificationsDisabled: disabled,
    });
  }

  archivePost(postId: string, ownerId: number) {
    this.updateOwnedPost(postId, ownerId, { archivedAt: new Date() });
  }

  unarchivePost(postId: string, ownerId: number) {
    this.updateOwnedPost(postId, ownerId, { archivedAt: null });
  }

  trashPost(postId: string, ownerId: number) {
    if (this.updateOwnedPost(postId, ownerId, {
      trashedAt: new Date(),
      archivedAt: null,
    })) {
      this.scheduleTrashCleanup();
    }
  }

  restorePost(postId: string, ownerId: number) {
    let updated = false;

    this.posts.update((items) =>
      items.map((post) => {
        if (
          post.id !== postId ||
          post.authorId !== ownerId ||
          !post.trashedAt
        ) {
          return post;
        }

        updated = true;
        return { ...post, trashedAt: null };
      }),
    );

    if (updated) {
      this.persistPosts();
      this.scheduleTrashCleanup();
    }
  }

  private updateOwnedPost(
    postId: string,
    ownerId: number,
    changes: Partial<Post>,
  ) {
    let updated = false;

    this.posts.update((items) =>
      items.map((post) => {
        if (
          post.id !== postId ||
          post.authorId !== ownerId ||
          post.trashedAt
        ) {
          return post;
        }

        updated = true;
        return { ...post, ...changes };
      }),
    );

    if (updated) this.persistPosts();
    return updated;
  }

  permanentlyDeletePost(postId: string, ownerId: number) {
    const post = this.posts().find((item) => item.id === postId);

    if (!post || post.authorId !== ownerId || !post.trashedAt) return;

    this.posts.update((items) => items.filter((item) => item.id !== postId));
    this.persistPosts();
    this.scheduleTrashCleanup();
  }

  removeGroupPosts(groupId: string) {
    const existing = this.posts();
    const remaining = existing.filter((post) => post.groupId !== groupId);

    if (remaining.length === existing.length) return true;

    this.posts.set(remaining);

    if (!this.persistPosts(false)) {
      this.posts.set(existing);
      return false;
    }

    return true;
  }

  private loadPosts(): Post[] {
    if (typeof localStorage === 'undefined') return [];

    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(postsStorageKey) ?? '[]',
      );

      if (!Array.isArray(stored)) {
        this.localLoadError = new Error(
          'Saved post data in local storage is not a list.',
        );
        return [];
      }

      return this.removeExpiredTrash(
        stored.filter(isStoredPost).map(restorePostDates),
      );
    } catch (error) {
      this.localLoadError = error;
      return [];
    }
  }

  private persistPosts(updateTimestamps = true) {
    this.changedBeforeHydration = true;

    const updatedAt = new Date();
    const updated = updateTimestamps
      ? this.posts().map((post) => ({ ...post, updatedAt }))
      : this.posts();

    this.posts.set(updated);

    const snapshot = updated.map((post) => ({
      ...post,
      attachments: [...post.attachments],
      likes: [...post.likes],
      comments: post.comments.map((comment) => ({
        ...comment,
        likes: [...(comment.likes ?? [])],
        reposts: [...(comment.reposts ?? [])],
      })),
      reposts: [...post.reposts],
    }));

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(postsStorageKey, JSON.stringify(snapshot));
      } catch {
        return false;
      }
    }

    this.persistenceQueue = this.persistenceQueue.then(() =>
      saveBrowserData(postsStorageKey, snapshot),
    );

    return true;
  }

  private removeExpiredTrash(posts: Post[]) {
    const expiration = Date.now() - trashRetentionMs;

    return posts.filter((post) =>
      !post.trashedAt ||
      new Date(post.trashedAt).getTime() > expiration,
    );
  }

  private scheduleTrashCleanup() {
    if (typeof window === 'undefined') return;

    if (this.trashCleanupTimer !== undefined) {
      window.clearTimeout(this.trashCleanupTimer);
    }

    const nextExpiration = this.posts()
      .filter((post) => post.trashedAt)
      .reduce(
        (soonest, post) => Math.min(
          soonest,
          new Date(post.trashedAt!).getTime() + trashRetentionMs,
        ),
        Number.POSITIVE_INFINITY,
      );

    if (!Number.isFinite(nextExpiration)) return;

    const delay = Math.max(
      0,
      Math.min(nextExpiration - Date.now(), 24 * 60 * 60 * 1000),
    );

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
    return null;
  }
}

function isSettingEnabled(key: string, fallback: boolean) {
  if (typeof localStorage === 'undefined') return fallback;

  const value = localStorage.getItem(`tali-setting-${key}`);
  return value === null ? fallback : value !== 'false';
}

function isStoredPostList(value: unknown): value is Post[] {
  return Array.isArray(value);
}

function mergePosts(savedPosts: Post[], currentPosts: Post[]): Post[] {
  const merged = new Map(savedPosts.map((post) => [post.id, post]));

  for (const post of currentPosts) {
    const saved = merged.get(post.id);
    const savedTime =
      saved?.updatedAt?.getTime() ?? saved?.createdAt.getTime() ?? 0;
    const currentTime =
      post.updatedAt?.getTime() ?? post.createdAt.getTime() ?? 0;

    if (!saved || currentTime >= savedTime) merged.set(post.id, post);
  }

  return [...merged.values()].sort((first, second) =>
    new Date(second.createdAt).getTime() -
    new Date(first.createdAt).getTime(),
  );
}

function restorePostDates(post: Post): Post {
  return {
    ...post,
    createdAt: new Date(post.createdAt),
    archivedAt: post.archivedAt ? new Date(post.archivedAt) : null,
    trashedAt: post.trashedAt ? new Date(post.trashedAt) : null,
    updatedAt: post.updatedAt ? new Date(post.updatedAt) : undefined,
    comments: post.comments.map((comment) => ({
      ...comment,
      createdAt: new Date(comment.createdAt),
      parentCommentId: comment.parentCommentId ?? null,
      likes: [...(comment.likes ?? [])],
      reposts: [...(comment.reposts ?? [])],
    })),
  };
}

function isStoredPost(value: unknown): value is Post {
  if (typeof value !== 'object' || value === null) return false;

  const post = value as Partial<Post>;

  const validIds = (items: unknown): boolean =>
    Array.isArray(items) &&
    items.every((id) => Number.isSafeInteger(id));

  const validAttachments = (items: unknown): boolean =>
    Array.isArray(items) && items.every((attachment) => {
      if (typeof attachment !== 'object' || attachment === null) {
        return false;
      }

      const item = attachment as Partial<PostAttachment>;

      return typeof item.name === 'string' &&
        typeof item.type === 'string' &&
        typeof item.dataUrl === 'string';
    });

  const validComments = (items: unknown): boolean =>
    Array.isArray(items) && items.every((comment) => {
      if (typeof comment !== 'object' || comment === null) return false;

      const item = comment as Partial<PostComment>;

      return typeof item.id === 'string' &&
        Number.isSafeInteger(item.authorId) &&
        typeof item.authorName === 'string' &&
        typeof item.authorUsername === 'string' &&
        typeof item.body === 'string' &&
        isValidDateValue(item.createdAt) &&
        (
          item.parentCommentId === undefined ||
          item.parentCommentId === null ||
          typeof item.parentCommentId === 'string'
        ) &&
        (item.likes === undefined || validIds(item.likes)) &&
        (item.reposts === undefined || validIds(item.reposts));
    });

  return typeof post.id === 'string' &&
    (typeof post.authorId === 'number' || post.authorId === null) &&
    typeof post.authorName === 'string' &&
    typeof post.authorUsername === 'string' &&
    typeof post.body === 'string' &&
    validAttachments(post.attachments) &&
    validIds(post.audienceAccountIds) &&
    validIds(post.likes) &&
    validComments(post.comments) &&
    validIds(post.reposts) &&
    [
      'public', 'friends', 'friends-of-friends',
      'selected-friends', 'hide-from', 'only-me',
    ].includes(String(post.audience)) &&
    isValidDateValue(post.createdAt) &&
    (post.updatedAt === undefined || isValidDateValue(post.updatedAt)) &&
    (
      post.archivedAt === undefined ||
      post.archivedAt === null ||
      isValidDateValue(post.archivedAt)
    ) &&
    (
      post.trashedAt === undefined ||
      post.trashedAt === null ||
      isValidDateValue(post.trashedAt)
    ) &&
    (
      post.notificationsDisabled === undefined ||
      typeof post.notificationsDisabled === 'boolean'
    );
}

function isValidDateValue(value: unknown): value is string | Date {
  if (!(typeof value === 'string' || value instanceof Date)) return false;
  return Number.isFinite(new Date(value).getTime());
}