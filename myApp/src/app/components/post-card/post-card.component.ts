import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, chevronBackOutline, chevronForwardOutline, documentOutline, ellipsisHorizontal, heart, heartOutline, personCircleOutline, repeatOutline, shareOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { GroupService } from '../../services/group.service';
import { Post, PostService } from '../../services/post.service';
import { CommentsPage } from '../../pages/comments/comments.page';

interface PostBodySegment {
  text: string;
  url?: string;
}

@Component({
  selector: 'app-post-card',
  standalone: true,
  templateUrl: './post-card.component.html',
  styleUrls: ['./post-card.component.scss'],
  imports: [CommonModule, RouterLink, IonIcon, IonModal, CommentsPage],
})
export class PostCardComponent implements OnChanges {
  @Input({ required: true }) post!: Post;
  @Input() focusPostOnLoad = false;
  @Input() openCommentsOnLoad = false;
  @Input() focusRequestId = '';

  readonly accountService = inject(AccountService);
  private readonly groupService = inject(GroupService);
  private readonly postService = inject(PostService);
  commentsOpen = false;
  actionMessage = '';
  showMoreOptions = false;
  editingPost = false;
  editBody = '';

  constructor() {
    addIcons({ chatbubbleOutline, chevronBackOutline, chevronForwardOutline, documentOutline, ellipsisHorizontal, heart, heartOutline, personCircleOutline, repeatOutline, shareOutline });
  }

  get authorImage() {
    const author = this.accountService.accounts().find((account) => account.id === this.post.authorId);
    return author && this.accountService.canViewProfileImage(author, this.accountService.selectedAccount()) ? author.profileImage : undefined;
  }

  get groupName() {
    return this.post.groupId ? this.groupService.getGroupById(this.post.groupId)?.name : undefined;
  }

  get bodySegments(): PostBodySegment[] {
    const segments: PostBodySegment[] = [];
    const linkPattern = /https?:\/\/[^\s<]+/gi;
    let lastIndex = 0;
    for (const match of this.post.body.matchAll(linkPattern)) {
      const index = match.index ?? 0;
      const rawUrl = match[0];
      const url = rawUrl.replace(/[),.!?;:]+$/g, '');
      if (!url) continue;
      if (index > lastIndex) segments.push({ text: this.post.body.slice(lastIndex, index) });
      segments.push({ text: url, url });
      const trailing = rawUrl.slice(url.length);
      if (trailing) segments.push({ text: trailing });
      lastIndex = index + rawUrl.length;
    }
    if (lastIndex < this.post.body.length) segments.push({ text: this.post.body.slice(lastIndex) });
    return segments.length ? segments : [{ text: this.post.body }];
  }

  get isLiked() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId !== undefined && this.post.likes.includes(accountId);
  }

  get isReposted() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId !== undefined && this.post.reposts.includes(accountId);
  }

  get isPostOwner() {
    return this.post.authorId !== null && this.post.authorId === this.accountService.selectedAccount()?.id;
  }

  get hideLikeCounts() { return this.settingIs('hideLikeCounts'); }
  get hideShareCounts() { return this.settingIs('hideShareCounts'); }
  get commentsEnabled() { return this.settingIs('commentsEnabled', true); }
  get sharingEnabled() { return this.settingIs('sharingEnabled', true); }
  get autoplayVideos() { return this.settingIs('autoplayVideos', true) && !this.settingIs('dataSaver'); }
  get dataSaver() { return this.settingIs('dataSaver'); }

  private settingIs(key: string, fallback = false) {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(`tali-setting-${key}`);
    return stored === null ? fallback : stored === 'true';
  }

  get trashDaysRemaining() {
    if (!this.post.trashedAt) return 0;
    const elapsed = Date.now() - new Date(this.post.trashedAt).getTime();
    return Math.max(0, Math.ceil((30 * 24 * 60 * 60 * 1000 - elapsed) / (24 * 60 * 60 * 1000)));
  }

  get timeAgo() {
    const seconds = Math.floor((Date.now() - new Date(this.post.createdAt).getTime()) / 1000);
    if (Number.isNaN(seconds)) return '';
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 7)}w`;
    return `${Math.floor(days / 365)}y`;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.post && typeof sessionStorage !== 'undefined') {
      try {
        const saved = JSON.parse(sessionStorage.getItem('tali-open-comments') ?? 'null') as { postId?: string; pathname?: string } | null;
        if (saved?.postId === this.post.id && saved.pathname === location.pathname) this.commentsOpen = true;
      } catch { /* Ignore invalid or unavailable session state. */ }
    }
    if (!this.focusPostOnLoad || (!changes['focusPostOnLoad'] && !changes['focusRequestId'])) return;
    setTimeout(() => {
      const postElement = document.getElementById(`post-${this.post.id}`);
      postElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      postElement?.classList.add('post-notification-focus');
      if (this.openCommentsOnLoad) this.openComments();
      setTimeout(() => postElement?.classList.remove('post-notification-focus'), 2200);
    });
  }

  scrollAttachments(event: WheelEvent) {
    const row = event.currentTarget as HTMLElement;
    if (row.scrollWidth <= row.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const nextScrollLeft = row.scrollLeft + delta;
    if (nextScrollLeft >= 0 && nextScrollLeft <= row.scrollWidth - row.clientWidth) {
      event.preventDefault();
      row.scrollLeft = nextScrollLeft;
    }
  }

  scrollAttachmentBy(event: MouseEvent, direction: -1 | 1) {
    const carousel = (event.currentTarget as HTMLElement).parentElement;
    const row = carousel?.querySelector<HTMLElement>('.post-attachments');
    const firstItem = row?.querySelector<HTMLElement>('.post-media, .post-file');
    if (!row || !firstItem) return;

    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: direction * (firstItem.offsetWidth + gap), behavior: 'smooth' });
  }

  get hasMultipleImages() {
    return this.post.attachments.filter((attachment) => attachment.type.startsWith('image/')).length > 1;
  }

  get hasVisualAttachments() {
    return this.post.attachments.some((attachment) => attachment.type.startsWith('image/') || attachment.type.startsWith('video/'));
  }

  openComments() {
    if (!this.commentsEnabled) return;
    this.commentsOpen = true;
    try { sessionStorage.setItem('tali-open-comments', JSON.stringify({ postId: this.post.id, pathname: location.pathname })); } catch { /* Modal still opens if storage is unavailable. */ }
  }

  closeComments() {
    this.commentsOpen = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem('tali-open-comments') ?? 'null') as { postId?: string } | null;
      if (saved?.postId === this.post.id) sessionStorage.removeItem('tali-open-comments');
    } catch { /* Ignore unavailable session state. */ }
  }

  startEditingPost() {
    if (!this.isPostOwner || this.post.trashedAt) return;
    this.editBody = this.post.body;
    this.editingPost = true;
    this.showMoreOptions = false;
  }

  saveEditedPost() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || (!this.editBody.trim() && this.post.attachments.length === 0)) {
      this.actionMessage = 'Keep post text or an attachment before saving this post.';
      return;
    }
    if (this.postService.updatePost(this.post.id, ownerId, this.editBody)) {
      this.editingPost = false;
      this.actionMessage = 'Post updated.';
    }
  }

  togglePostNotifications() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || !this.isPostOwner) return;
    const disabled = !this.post.notificationsDisabled;
    this.postService.setPostNotifications(this.post.id, ownerId, disabled);
    this.actionMessage = disabled ? 'Notifications turned off for this post.' : 'Notifications turned on for this post.';
    this.showMoreOptions = false;
  }

  togglePostArchive() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || !this.isPostOwner) return;
    if (this.post.archivedAt) {
      this.postService.unarchivePost(this.post.id, ownerId);
      this.actionMessage = 'Post moved back to your profile.';
    } else {
      this.postService.archivePost(this.post.id, ownerId);
      this.actionMessage = 'Post moved to your archive.';
    }
    this.showMoreOptions = false;
  }

  movePostToTrash() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || !this.isPostOwner) return;
    this.postService.trashPost(this.post.id, ownerId);
    this.actionMessage = 'Post moved to trash. You can restore it for 30 days.';
    this.showMoreOptions = false;
  }

  restorePost() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || !this.isPostOwner) return;
    this.postService.restorePost(this.post.id, ownerId);
    this.showMoreOptions = false;
  }

  deletePostPermanently() {
    const ownerId = this.accountService.selectedAccount()?.id;
    if (ownerId === undefined || !this.isPostOwner || !this.post.trashedAt) return;
    this.postService.permanentlyDeletePost(this.post.id, ownerId);
    this.showMoreOptions = false;
  }

  async copyPostLink() {
    const postUrl = new URL('/home', window.location.origin);
    postUrl.hash = `post-${this.post.id}`;
    try {
      await navigator.clipboard.writeText(postUrl.toString());
      this.actionMessage = 'Post link copied.';
    } catch {
      this.actionMessage = 'Could not copy the post link in this browser.';
    }
    this.showMoreOptions = false;
  }

  toggleLike() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();
    this.actionMessage = '';
    this.postService.toggleLike(this.post.id, account);
  }

  toggleRepost() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();
    this.actionMessage = '';
    this.postService.toggleRepost(this.post.id, account);
  }

  async sharePost() {
    if (!this.sharingEnabled) return;
    this.actionMessage = '';
    const postUrl = new URL(window.location.href);
    postUrl.hash = `post-${this.post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${this.post.authorName} on Tali`, text: this.post.body, url: postUrl.toString() });
        const account = this.accountService.selectedAccount();
        if (account) this.postService.recordShare(this.post.id, account);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl.toString());
        this.actionMessage = 'Link copied.';
        const account = this.accountService.selectedAccount();
        if (account) this.postService.recordShare(this.post.id, account);
      } else {
        this.actionMessage = 'Sharing is not available in this browser.';
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.actionMessage = 'Could not share this post.';
      }
    }
  }

  private requireAccount() {
    this.actionMessage = 'Select an account to interact with posts.';
  }
}
