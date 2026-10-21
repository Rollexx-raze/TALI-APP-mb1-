import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonIcon, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chatbubbleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  heart,
  heartOutline,
  personCircleOutline,
  repeatOutline,
  shareOutline,
} from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import {
  Post,
  PostAttachment,
  PostComment,
  PostService,
} from '../../services/post.service';

interface CommentRow {
  comment: PostComment;
  depth: number;
}

@Component({
  selector: 'app-comments',
  standalone: true,
  templateUrl: './comments.page.html',
  styleUrls: ['./comments.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonIcon],
  host: {
    class: 'ion-page tali-comments-page',
  },
})
export class CommentsPage implements OnChanges, OnDestroy {
  @Input({ required: true }) postId!: string;

  @ViewChild('composerInput')
  private composerInput?: ElementRef<HTMLTextAreaElement>;

  readonly accountService = inject(AccountService);
  private readonly posts = inject(PostService);
  private readonly modal = inject(ModalController);

  commentDraft = '';
  commentError = '';
  actionMessage = '';
  selectedMediaIndex = 0;
  replyToId: string | null = null;

  private noticeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({
      chatbubbleOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      heart,
      heartOutline,
      personCircleOutline,
      repeatOutline,
      shareOutline,
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['postId'] || !this.postId) return;

    this.commentDraft = '';
    this.replyToId = null;
    this.selectedMediaIndex = 0;
    this.commentError = '';
    this.actionMessage = '';

    try {
      const draft = JSON.parse(
        sessionStorage.getItem(`tali-comment-draft:${this.postId}`) ??
        'null',
      );

      if (typeof draft?.commentDraft === 'string') {
        this.commentDraft = draft.commentDraft.slice(0, 500);
      }

      if (Number.isInteger(draft?.selectedMediaIndex)) {
        this.selectedMediaIndex = Math.max(0, draft.selectedMediaIndex);
      }

      if (typeof draft?.replyToId === 'string') {
        this.replyToId = draft.replyToId;
      }
    } catch {
      // Keep the composer usable when storage is unavailable.
    }
  }

  ngOnDestroy() {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
  }

  get post(): Post | null {
    const post = this.posts.posts().find((item) => item.id === this.postId);

    return post && this.posts.canViewPost(
      post,
      this.accountService.selectedAccount(),
      this.accountService.accounts(),
    ) ? post : null;
  }

  get loading() {
    return this.posts.loading();
  }

  get commentsEnabled() {
    return this.setting('commentsEnabled', true);
  }

  get sharingEnabled() {
    return this.setting('sharingEnabled', true);
  }

  get hideLikeCounts() {
    return this.setting('hideLikeCounts', false);
  }

  get hideShareCounts() {
    return this.setting('hideShareCounts', false);
  }

  get isLiked() {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && !!this.post?.likes.includes(id);
  }

  get isReposted() {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && !!this.post?.reposts.includes(id);
  }

  get visibleComments(): PostComment[] {
    const comments = this.post?.comments ?? [];

    if (!this.setting('hiddenWordsEnabled', false)) return comments;

    let words: string[] = [];

    try {
      words = (localStorage.getItem('tali-hidden-words') ?? '')
        .split(',')
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
    } catch {
      return comments;
    }

    const hidden = new Set(
      comments
        .filter((comment) =>
          words.some((word) => comment.body.toLowerCase().includes(word)),
        )
        .map((comment) => comment.id),
    );

    let changed = true;

    while (changed) {
      changed = false;

      for (const comment of comments) {
        if (
          comment.parentCommentId &&
          hidden.has(comment.parentCommentId) &&
          !hidden.has(comment.id)
        ) {
          hidden.add(comment.id);
          changed = true;
        }
      }
    }

    return comments.filter((comment) => !hidden.has(comment.id));
  }

  get commentRows(): CommentRow[] {
    const comments = this.visibleComments;
    const ids = new Set(comments.map((comment) => comment.id));
    const children = new Map<string, PostComment[]>();

    for (const comment of comments) {
      if (comment.parentCommentId && ids.has(comment.parentCommentId)) {
        const list = children.get(comment.parentCommentId) ?? [];
        list.push(comment);
        children.set(comment.parentCommentId, list);
      }
    }

    const roots = comments.filter((comment) =>
      !comment.parentCommentId || !ids.has(comment.parentCommentId),
    );

    const rows: CommentRow[] = [];
    const visited = new Set<string>();

    const append = (root: PostComment) => {
      const stack: CommentRow[] = [{ comment: root, depth: 0 }];

      while (stack.length) {
        const row = stack.pop()!;

        if (visited.has(row.comment.id)) continue;

        visited.add(row.comment.id);
        rows.push(row);

        const replies = children.get(row.comment.id) ?? [];

        for (let index = replies.length - 1; index >= 0; index--) {
          stack.push({
            comment: replies[index],
            depth: Math.min(row.depth + 1, 2),
          });
        }
      }
    };

    roots.forEach(append);

    // Keep older malformed threads visible without looping forever.
    comments.forEach((comment) => {
      if (!visited.has(comment.id)) append(comment);
    });

    return rows;
  }

  get replyTarget() {
    return this.visibleComments.find(
      (comment) => comment.id === this.replyToId,
    ) ?? null;
  }

  get mediaAttachments(): PostAttachment[] {
    return this.post?.attachments.filter((attachment) =>
      attachment.type.startsWith('image/') ||
      attachment.type.startsWith('video/'),
    ) ?? [];
  }

  get selectedMedia(): PostAttachment | null {
    const media = this.mediaAttachments;
    const index = Math.min(this.selectedMediaIndex, media.length - 1);
    return media[Math.max(0, index)] ?? null;
  }

  get mediaNumber() {
    return Math.min(this.selectedMediaIndex + 1, this.mediaAttachments.length);
  }

  get authorImage() {
    const id = this.post?.authorId;
    return id === null || id === undefined ? undefined : this.imageFor(id);
  }

  get selectedAccountImage() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? undefined : this.imageFor(id);
  }

  imageFor(id: number) {
    const author = this.accountService.accounts().find(
      (account) => account.id === id,
    );

    return author && this.accountService.canViewProfileImage(
      author,
      this.accountService.selectedAccount(),
    ) ? author.profileImage : undefined;
  }

  private setting(key: string, fallback: boolean) {
    try {
      const value = localStorage.getItem(`tali-setting-${key}`);
      return value === null ? fallback : value === 'true';
    } catch {
      return fallback;
    }
  }

  timeAgo(value: Date) {
    const elapsed = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(elapsed)) return '';

    const minutes = Math.max(0, Math.floor(elapsed / 60000));
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    return `${Math.floor(hours / 24)}d`;
  }

  saveDraft() {
    this.commentError = '';

    try {
      sessionStorage.setItem(
        `tali-comment-draft:${this.postId}`,
        JSON.stringify({
          commentDraft: this.commentDraft,
          selectedMediaIndex: this.selectedMediaIndex,
          replyToId: this.replyToId,
        }),
      );
    } catch {
      // Storage failures must not prevent typing.
    }
  }

  moveMedia(direction: number) {
    const count = this.mediaAttachments.length;
    if (!count) return;

    this.selectedMediaIndex =
      (this.selectedMediaIndex + direction + count) % count;

    this.saveDraft();
  }

  notice(text: string) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);

    this.actionMessage = text;
    this.noticeTimer = setTimeout(() => {
      this.actionMessage = '';
    }, 3000);
  }

  toggleLike() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.notice('Select an account first.');
    if (!this.post) return;

    this.posts.toggleLike(this.postId, account);
  }

  toggleRepost() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.notice('Select an account first.');
    if (!this.post || (!this.sharingEnabled && !this.isReposted)) return;

    this.posts.toggleRepost(this.postId, account);
  }

  commentLiked(comment: PostComment) {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && !!comment.likes?.includes(id);
  }

  commentReposted(comment: PostComment) {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && !!comment.reposts?.includes(id);
  }

  likeComment(comment: PostComment) {
    const account = this.accountService.selectedAccount();
    if (!account) return this.notice('Select an account first.');

    this.posts.toggleCommentLike(
      this.postId,
      comment.id,
      account,
      this.accountService.accounts(),
    );
  }

  repostComment(comment: PostComment) {
    const account = this.accountService.selectedAccount();
    if (!account) return this.notice('Select an account first.');

    const success = this.posts.toggleCommentRepost(
      this.postId,
      comment.id,
      account,
      this.accountService.accounts(),
    );

    if (success) {
      this.notice(
        this.commentReposted(comment)
          ? 'Comment repost removed.'
          : 'Comment marked as reposted.',
      );
    }
  }

  replyCount(comment: PostComment) {
    return this.visibleComments.filter(
      (entry) => entry.parentCommentId === comment.id,
    ).length;
  }

  beginReply(comment: PostComment) {
    if (!this.commentsEnabled) return;
    if (!this.accountService.selectedAccount()) {
      return this.notice('Select an account first.');
    }

    this.replyToId = comment.id;
    this.saveDraft();
    this.composerInput?.nativeElement.focus();
  }

  cancelReply() {
    this.replyToId = null;
    this.saveDraft();
  }

  submitComment() {
    const account = this.accountService.selectedAccount();
    const post = this.post;
    const body = this.commentDraft.trim();

    if (!this.commentsEnabled) {
      this.commentError = 'Comments are turned off for this account.';
      return;
    }

    if (!account) {
      this.commentError = 'Select an account to comment.';
      return;
    }

    if (!post || !body) return;

    if (this.replyToId && !this.replyTarget) {
      this.commentError = 'The comment you are replying to is unavailable.';
      return;
    }

    const comment = this.posts.addComment(
      post.id,
      account,
      body,
      this.accountService.accounts(),
      this.replyToId,
    );

    if (!comment) {
      this.commentError = 'Could not add this comment.';
      return;
    }

    this.commentDraft = '';
    this.replyToId = null;
    this.saveDraft();

    if (!this.visibleComments.some((entry) => entry.id === comment.id)) {
      this.notice('Comment added. Your hidden-word filter hides it.');
    }
  }

  async sharePost() {
    await this.share();
  }

  async shareComment(comment: PostComment) {
    await this.share(comment);
  }

  private async share(comment?: PostComment) {
    const post = this.post;
    if (!post || !this.sharingEnabled) return;

    const url = new URL('/home', window.location.origin);
    url.hash = `post-${post.id}`;

    const text = comment
      ? `${comment.authorName}: ${comment.body}`
      : post.body;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.authorName} on Tali`,
          text,
          url: url.toString(),
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          comment ? `${text}\n${url.toString()}` : url.toString(),
        );
        this.notice(comment ? 'Comment and post link copied.' : 'Post link copied.');
      } else {
        this.notice('Sharing is unavailable in this browser.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.notice('Could not share. Please try again.');
      }
    }
  }

  close() {
    void this.modal.dismiss();
  }
}