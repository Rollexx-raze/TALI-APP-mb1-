import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonAvatar, IonBackButton, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonTextarea, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, archiveOutline, chatbubbleOutline, createOutline, ellipsisHorizontal, homeOutline, imageOutline, notificationsOutline, personCircleOutline, repeatOutline, settingsOutline, trashOutline, trendingUpOutline, videocamOutline } from 'ionicons/icons';
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
  imports: [CommonModule, FormsModule, RouterLink, IonAvatar, IonBackButton, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonTextarea, IonToolbar, PostCardComponent],
})
export class ProfilePage {
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  readonly viewState = inject(ViewStateService);
  activeSection: 'posts' | 'photos' | 'videos' | 'reposts' | 'archive' | 'trash' = 'posts';
  editingProfile = false;
  editName = '';
  editUsername = '';
  editBio = '';
  editProfileImage = '';
  editProfileImageVisibility: 'public' | 'friends' | 'only-me' = 'public';
  cropSource = '';
  cropZoom = 1;
  cropX = 0;
  cropY = 0;
  croppingProfileImage = false;
  editPrivacy: 'public' | 'private' = 'public';
  editRepostVisibility: 'public' | 'friends' | 'only-me' = 'public';
  profileImageError = '';
  connectionsView: 'followers' | 'following' | null = null;
  confirmingUnfollow = false;
  showProfileMenu = false;

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  constructor() {
    addIcons({ addCircle, archiveOutline, chatbubbleOutline, createOutline, ellipsisHorizontal, homeOutline, imageOutline, notificationsOutline, personCircleOutline, repeatOutline, settingsOutline, trashOutline, trendingUpOutline, videocamOutline });
    const saved = this.viewState.read<Partial<{ activeSection: 'posts' | 'photos' | 'videos' | 'reposts' | 'archive' | 'trash'; connectionsView: 'followers' | 'following' | null }>>(this.profileStateKey, {});
    if (saved.activeSection) this.activeSection = saved.activeSection;
    this.connectionsView = saved.connectionsView ?? null;
  }

  get profileStateKey() {
    return `tali-view-profile:${this.route.snapshot.paramMap.get('accountId') ?? 'current'}`;
  }

  setProfileSection(section: 'posts' | 'photos' | 'videos' | 'reposts' | 'archive' | 'trash') {
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

  get cropImageTransform() {
    return `translate(${this.cropX * 0.18}%, ${this.cropY * 0.18}%) scale(${this.cropZoom})`;
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

  get archivedPosts() {
    const profile = this.profileAccount;
    return this.isOwnProfile && profile
      ? this.postService.posts().filter((post) => post.authorId === profile.id && !!post.archivedAt && !post.trashedAt)
      : [];
  }

  get trashedPosts() {
    const profile = this.profileAccount;
    return this.isOwnProfile && profile
      ? this.postService.posts().filter((post) => post.authorId === profile.id && !!post.trashedAt)
      : [];
  }

  get profilePhotos() {
    const profile = this.profileAccount;
    if (!profile) return [];
    return [
      ...(this.canViewProfileImage(profile) ? [{ source: profile.profileImage!, name: `${profile.name}'s profile photo` }] : []),
      ...this.ownPosts.flatMap((post) => post.attachments
        .filter((attachment) => attachment.type.startsWith('image/'))
        .map((attachment) => ({ source: attachment.dataUrl, name: attachment.name }))),
    ];
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

  get isMutedProfile() {
    const profileId = this.profileAccount?.id;
    return profileId !== undefined && (this.accountService.selectedAccount()?.mutedAccountIds?.includes(profileId) ?? false);
  }

  get isBlockedProfile() {
    const profileId = this.profileAccount?.id;
    return profileId !== undefined && (this.accountService.selectedAccount()?.blockedAccountIds?.includes(profileId) ?? false);
  }

  toggleProfileSafety(action: 'mutedAccountIds' | 'blockedAccountIds') {
    const profileId = this.profileAccount?.id;
    if (profileId === undefined || this.isOwnProfile) return;
    if (action === 'mutedAccountIds') this.accountService.toggleMutedAccount(profileId);
    else this.accountService.toggleBlockedAccount(profileId);
    this.showProfileMenu = false;
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

  openProfileEditor() {
    const account = this.isOwnProfile ? this.profileAccount : null;
    if (!account) return;
    this.editName = account.name;
    this.editUsername = account.username;
    this.editBio = account.bio;
    this.editProfileImage = account.profileImage ?? '';
    this.editProfileImageVisibility = account.profileImageVisibility ?? 'public';
    this.editPrivacy = account.privacy ?? 'public';
    this.editRepostVisibility = account.repostVisibility ?? 'public';
    this.profileImageError = '';
    this.editingProfile = true;
  }

  onProfileImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.profileImageError = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.profileImageError = 'Choose an image file.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.profileImageError = 'Choose an image smaller than 5 MB.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.cropSource = String(reader.result ?? '');
      this.cropZoom = 1;
      this.cropX = 0;
      this.cropY = 0;
      this.croppingProfileImage = !!this.cropSource;
    };
    reader.onerror = () => this.profileImageError = 'The image could not be read. Please try again.';
    reader.readAsDataURL(file);
  }

  removeProfileImage() {
    this.editProfileImage = '';
    this.profileImageError = '';
  }

  finishProfileImageCrop() {
    if (!this.cropSource) return;
    const image = new Image();
    image.onload = () => {
      const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / this.cropZoom;
      const maxX = Math.max(0, image.naturalWidth - cropSize);
      const maxY = Math.max(0, image.naturalHeight - cropSize);
      const left = maxX * (this.cropX + 100) / 200;
      const top = maxY * (this.cropY + 100) / 200;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) {
        this.profileImageError = 'The photo could not be cropped. Please try again.';
        return;
      }
      context.drawImage(image, left, top, cropSize, cropSize, 0, 0, 512, 512);
      this.editProfileImage = canvas.toDataURL('image/jpeg', 0.9);
      this.croppingProfileImage = false;
    };
    image.onerror = () => this.profileImageError = 'The image could not be opened. Please try again.';
    image.src = this.cropSource;
  }

  saveProfile() {
    if (!this.editName.trim() || !this.editUsername.trim()) return;
    if (!this.isOwnProfile) return;
    this.accountService.updateProfile(this.editName, this.editUsername, this.editBio, this.editProfileImage || undefined, this.editProfileImageVisibility);
    this.accountService.updatePrivacy(this.editPrivacy, this.editRepostVisibility);
    const updated = this.accountService.selectedAccount();
    if (updated) this.postService.updateAuthor(updated.id, updated.name, updated.username);
    this.editingProfile = false;
  }
}
