import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonAvatar, IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, cameraOutline, chatbubbleOutline, checkmarkCircle, chevronBackOutline, createOutline, ellipsisHorizontal, gridOutline, homeOutline, notificationsOutline, personCircleOutline, repeatOutline, settingsOutline, trendingUpOutline, videocamOutline } from 'ionicons/icons';
import { PostCardComponent } from '../../components/post-card/post-card.component';
import { Account, AccountService } from '../../services/account.service';
import { PostService } from '../../services/post.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { MessageService } from '../../services/message.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [CommonModule, RouterLink, IonAvatar, IonButton, IonContent, IonIcon, PostCardComponent],
})
export class ProfilePage {
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly location = inject(Location);
  readonly viewState = inject(ViewStateService);
  activeSection: 'posts' | 'videos' | 'reposts' = 'posts';
  coverImageError = '';
  viewingProfilePhoto = '';
  connectionsView: 'followers' | 'following' | null = null;
  confirmingUnfollow = false;

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  constructor() {
    addIcons({ addCircle, cameraOutline, chatbubbleOutline, checkmarkCircle, chevronBackOutline, createOutline, ellipsisHorizontal, gridOutline, homeOutline, notificationsOutline, personCircleOutline, repeatOutline, settingsOutline, trendingUpOutline, videocamOutline });
    const saved = this.viewState.read<Partial<{ activeSection: 'posts' | 'photos' | 'videos' | 'reposts' | 'archive' | 'trash'; connectionsView: 'followers' | 'following' | null }>>(this.profileStateKey, {});
    if (saved.activeSection && saved.activeSection !== 'archive' && saved.activeSection !== 'trash' && saved.activeSection !== 'photos') this.activeSection = saved.activeSection;
    this.connectionsView = saved.connectionsView ?? null;
  }

  get profileStateKey() {
    return `tali-view-profile:${this.route.snapshot.paramMap.get('accountId') ?? 'current'}`;
  }

  setProfileSection(section: 'posts' | 'videos' | 'reposts') {
    this.activeSection = section;
    this.saveProfileViewState();
  }

  setConnectionsView(view: 'followers' | 'following' | null) {
    this.connectionsView = view;
    this.saveProfileViewState();
  }

  private saveProfileViewState() {
    this.viewState.write(this.profileStateKey, { activeSection: this.activeSection, connectionsView: this.connectionsView });
  }

  get profileAccount() {
    const accountId = this.route.snapshot.paramMap.get('accountId');
    if (accountId === null) return this.accountService.selectedAccount();
    return this.accountService.accounts().find((account) => account.id === Number(accountId)) ?? null;
  }

  canViewProfileImage(profile: Account) {
    return this.accountService.canViewProfileImage(profile, this.accountService.selectedAccount());
  }

  get isOwnProfile() {
    const profileId = this.profileAccount?.id;
    return profileId !== undefined && profileId === this.accountService.selectedAccount()?.id;
  }

  get ownPosts() {
    const profile = this.profileAccount;
    const viewer = this.accountService.selectedAccount();
    const accounts = this.accountService.accounts();
    return profile
      ? this.postService.posts().filter((post) => post.authorId === profile.id && !post.archivedAt && !post.trashedAt && this.postService.canViewPost(post, viewer, accounts))
      : [];
  }

  formatProfileCount(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} Million`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return String(value);
  }

  profileInitials(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  }

  formatWebsite(value: string) {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  get profileVideos() {
    return this.ownPosts.flatMap((post) => post.attachments
      .filter((attachment) => attachment.type.startsWith('video/'))
      .map((attachment) => ({ source: attachment.dataUrl, type: attachment.type, name: attachment.name })));
  }

  get repostedPosts() {
    const profile = this.profileAccount;
    if (!profile) return [];
    const viewer = this.accountService.selectedAccount();
    const accounts = this.accountService.accounts();
    const visibility = profile.repostVisibility ?? 'public';
    const isFriend = !!viewer && profile.followingIds.includes(viewer.id) && viewer.followingIds.includes(profile.id);
    if (!this.isOwnProfile && (visibility === 'only-me' || (visibility === 'friends' && !isFriend))) return [];
    return this.postService.posts().filter((post) => post.reposts.includes(profile.id) && this.postService.canViewPost(post, viewer, accounts));
  }

  get followers() {
    const accountId = this.profileAccount?.id;
    return accountId === undefined ? [] : this.accountService.getFollowers(accountId);
  }

  get following() {
    const accountId = this.profileAccount?.id;
    return accountId === undefined ? [] : this.accountService.getFollowing(accountId);
  }

  get isFollowingProfile() {
    const profileId = this.profileAccount?.id;
    return profileId !== undefined && (this.accountService.selectedAccount()?.followingIds.includes(profileId) ?? false);
  }

  toggleFollowProfile() {
    const profileId = this.profileAccount?.id;
    if (profileId === undefined || this.isOwnProfile) return;
    if (this.isFollowingProfile) this.confirmingUnfollow = true;
    else this.accountService.followAccount(profileId);
  }

  confirmUnfollowProfile() {
    const profileId = this.profileAccount?.id;
    if (profileId !== undefined && !this.isOwnProfile && this.isFollowingProfile) {
      this.accountService.unfollowAccount(profileId);
    }
    this.confirmingUnfollow = false;
  }

  messageProfile() {
    const viewer = this.accountService.selectedAccount();
    const profile = this.profileAccount;
    if (!viewer || !profile || profile.id === viewer.id) return;
    const conversation = this.messageService.openDirectConversation(viewer.id, profile.id);
    void this.router.navigate(['/messages'], { queryParams: { conversationId: conversation.id } });
  }

  onCoverImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.coverImageError = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.coverImageError = 'Choose an image file for your cover.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.coverImageError = 'Choose a cover image smaller than 5 MB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.accountService.updateCoverImage(String(reader.result ?? ''));
    reader.onerror = () => this.coverImageError = 'The cover image could not be read. Please try again.';
    reader.readAsDataURL(file);
  }

  openProfilePhoto(profile: Account) {
    if (this.canViewProfileImage(profile)) this.viewingProfilePhoto = profile.profileImage ?? '';
  }

  goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/home']);
    }
  }

}
