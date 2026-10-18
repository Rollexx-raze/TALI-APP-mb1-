import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonTextarea, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, chevronBackOutline, chevronForwardOutline, closeOutline, heart, heartOutline, imageOutline, personCircleOutline, repeatOutline, shareOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { Post, PostAttachment, PostService } from '../../services/post.service';

@Component({
  selector: 'app-comments',
  standalone: true,
  templateUrl: './comments.page.html',
  styleUrls: ['./comments.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonButton, IonContent, IonIcon, IonTextarea],
})
export class CommentsPage implements OnChanges {
  @Input({ required: true }) postId!: string;

  private readonly accountService = inject(AccountService);
  private readonly postService = inject(PostService);
  private readonly modalController = inject(ModalController);

  commentDraft = '';
  commentError = '';
  actionMessage = '';
  selectedMediaIndex = 0;

  constructor() {
    addIcons({ chatbubbleOutline, chevronBackOutline, chevronForwardOutline, closeOutline, heart, heartOutline, imageOutline, personCircleOutline, repeatOutline, shareOutline });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['postId'] || !this.postId) return;
    const saved = this.readDraft();
    this.commentDraft = saved?.commentDraft ?? '';
    this.selectedMediaIndex = saved?.selectedMediaIndex ?? 0;
  }

  saveDraft() {
    try {
      sessionStorage.setItem(this.draftKey, JSON.stringify({ commentDraft: this.commentDraft, selectedMediaIndex: this.selectedMediaIndex }));
    } catch { /* The comment box remains usable if session storage is unavailable. */ }
  }

  private get draftKey() { return `tali-comment-draft:${this.postId}`; }

  private readDraft(): { commentDraft: string; selectedMediaIndex: number } | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(this.draftKey) ?? 'null') as Partial<{ commentDraft: string; selectedMediaIndex: number }> | null;
      return value && typeof value.commentDraft === 'string' && Number.isInteger(value.selectedMediaIndex)
        ? value as { commentDraft: string; selectedMediaIndex: number } : null;
    } catch { return null; }
  }

  get post(): Post | null {
    const post = this.postService.posts().find((item) => item.id === this.postId);
    if (!post) return null;
    return this.postService.canViewPost(post, this.accountService.selectedAccount(), this.accountService.accounts()) ? post : null;
  }

  get commentsEnabled() {
    return this.readSetting('commentsEnabled', true);
  }

  get isLiked() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId !== undefined && (this.post?.likes.includes(accountId) ?? false);
  }

  get isReposted() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId !== undefined && (this.post?.reposts.includes(accountId) ?? false);
  }

  get hideLikeCounts() { return this.readSetting('hideLikeCounts', false); }
  get hideShareCounts() { return this.readSetting('hideShareCounts', false); }
  get sharingEnabled() { return this.readSetting('sharingEnabled', true); }

  toggleLike() {
    const account = this.accountService.selectedAccount();
    if (!account) { this.actionMessage = 'Select an account to interact with posts.'; return; }
    this.actionMessage = '';
    this.postService.toggleLike(this.postId, account);
  }

  toggleRepost() {
    const account = this.accountService.selectedAccount();
    if (!account) { this.actionMessage = 'Select an account to interact with posts.'; return; }
    if (!this.sharingEnabled && !this.isReposted) return;
    this.actionMessage = '';
    this.postService.toggleRepost(this.postId, account);
  }

  async sharePost() {
    if (!this.sharingEnabled) return;
    const currentPost = this.post;
    if (!currentPost) return;
    const url = new URL(window.location.href);
    url.hash = `post-${currentPost.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${currentPost.authorName} on Tali`, text: currentPost.body, url: url.toString() });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        this.actionMessage = 'Post link copied.';
      } else this.actionMessage = 'Sharing is not available in this browser.';
      const account = this.accountService.selectedAccount();
      if (account) this.postService.recordShare(currentPost.id, account);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.actionMessage = 'Could not share this post.';
    }
  }

  get visibleComments() {
    const comments = this.post?.comments ?? [];
    if (!this.readSetting('hiddenWordsEnabled', false) || typeof localStorage === 'undefined') return comments;
    const words = (localStorage.getItem('tali-hidden-words') ?? '')
      .split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
    if (!words.length) return comments;
    return comments.filter((comment) => !words.some((word) => comment.body.toLowerCase().includes(word)));
  }

  private readSetting(key: string, fallback: boolean) {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(`tali-setting-${key}`);
    return stored === null ? fallback : stored === 'true';
  }

  get mediaAttachments(): PostAttachment[] {
    return this.post?.attachments.filter((attachment) => attachment.type.startsWith('image/') || attachment.type.startsWith('video/')) ?? [];
  }

  get selectedMedia(): PostAttachment | null {
    const media = this.mediaAttachments;
    if (!media.length) return null;
    this.selectedMediaIndex = Math.min(this.selectedMediaIndex, media.length - 1);
    return media[this.selectedMediaIndex];
  }

  get authorImage() {
    const author = this.accountService.accounts().find((account) => account.id === this.post?.authorId);
    return author && this.accountService.canViewProfileImage(author, this.accountService.selectedAccount()) ? author.profileImage : undefined;
  }

  commentAuthorImage(authorId: number) {
    const author = this.accountService.accounts().find((account) => account.id === authorId);
    return author && this.accountService.canViewProfileImage(author, this.accountService.selectedAccount()) ? author.profileImage : undefined;
  }

  moveMedia(direction: number) {
    const count = this.mediaAttachments.length;
    if (!count) return;
    this.selectedMediaIndex = (this.selectedMediaIndex + direction + count) % count;
    this.saveDraft();
  }

  close() {
    this.modalController.dismiss();
  }

  submitComment() {
    if (!this.commentsEnabled) {
      this.commentError = 'Comments are turned off for this account.';
      return;
    }
    const account = this.accountService.selectedAccount();
    const post = this.post;
    const body = this.commentDraft.trim();
    if (!post || !body) return;
    if (!account) {
      this.commentError = 'Select an account to comment.';
      return;
    }

    this.postService.addComment(post.id, account, body, this.accountService.accounts());
    this.commentDraft = '';
    this.commentError = '';
    this.saveDraft();
  }
}
