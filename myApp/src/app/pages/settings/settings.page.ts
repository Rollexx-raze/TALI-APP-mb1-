import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonToggle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { accessibilityOutline, archiveOutline, banOutline, cardOutline, chatbubblesOutline, chevronBackOutline, chevronDownOutline, chevronForwardOutline, checkmarkOutline, colorPaletteOutline, documentTextOutline, eyeOffOutline, informationCircleOutline, keyOutline, languageOutline, lockClosedOutline, logOutOutline, megaphoneOutline, moonOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, personOutline, searchOutline, serverOutline, shieldCheckmarkOutline, starOutline, sunnyOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { Account, AccountService } from '../../services/account.service';
import { PostService } from '../../services/post.service';
import { MessageService } from '../../services/message.service';
import { PostCardComponent } from '../../components/post-card/post-card.component';

type SettingsSection = 'profile' | 'account' | 'privacy' | 'blocked' | 'story-privacy' | 'family' | 'muted' | 'like-counts' | 'tags' | 'comments' | 'sharing' | 'hidden-words' | 'security' | 'notifications' | 'messages' | 'content' | 'connections' | 'activity' | 'archive' | 'trash' | 'appearance' | 'accessibility' | 'language' | 'data' | 'permissions' | 'ads' | 'payments' | 'about';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonToggle, IonToolbar, PostCardComponent],
})
export class SettingsPage {
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  readonly sections = [
    { id: 'account', label: 'Account Center', icon: 'person-circle-outline' },
    { id: 'privacy', label: 'Privacy', icon: 'lock-closed-outline' },
    { id: 'blocked', label: 'Blocked', icon: 'ban-outline' },
    { id: 'story-privacy', label: 'Story, live and location', icon: 'eye-off-outline' },
    { id: 'family', label: 'Supervision for Teen Accounts', icon: 'people-outline' },
    { id: 'muted', label: 'Muted accounts', icon: 'notifications-outline' },
    { id: 'like-counts', label: 'Like and share counts', icon: 'card-outline' },
    { id: 'tags', label: 'Tags and mentions', icon: 'person-outline' },
    { id: 'comments', label: 'Comments', icon: 'chatbubbles-outline' },
    { id: 'sharing', label: 'Sharing', icon: 'people-outline' },
    { id: 'hidden-words', label: 'Hidden Words', icon: 'eye-off-outline' },
    { id: 'security', label: 'Security', icon: 'shield-checkmark-outline' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
    { id: 'messages', label: 'Messages and Calls', icon: 'chatbubbles-outline' },
    { id: 'content', label: 'Content Preferences', icon: 'document-text-outline' },
    { id: 'connections', label: 'Followers and Following', icon: 'people-outline' },
    { id: 'activity', label: 'Your Activity', icon: 'time-outline' },
    { id: 'archive', label: 'Archive', icon: 'archive-outline' },
    { id: 'trash', label: 'Trash', icon: 'trash-outline' },
    { id: 'appearance', label: 'Appearance', icon: 'color-palette-outline' },
    { id: 'accessibility', label: 'Accessibility', icon: 'accessibility-outline' },
    { id: 'language', label: 'Language', icon: 'language-outline' },
    { id: 'data', label: 'Data and Storage', icon: 'server-outline' },
    { id: 'permissions', label: 'Permissions', icon: 'key-outline' },
    { id: 'ads', label: 'Ads & Recommendations', icon: 'megaphone-outline' },
    { id: 'payments', label: 'Subscriptions & Payments', icon: 'card-outline' },
    { id: 'about', label: 'About', icon: 'information-circle-outline' },
  ] as const;
  activeSection: SettingsSection = 'account';
  mobileDetailOpen = false;
  searchText = '';
  profileBio = '';
  profileGender: 'prefer-not-to-say' | 'female' | 'male' | 'custom' = 'prefer-not-to-say';
  readonly genderOptions = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'custom', label: 'Custom' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
  ] as const;
  genderMenuOpen = false;
  customGender = '';
  profilePhotoError = '';
  profileWebsite = '';
  profilePhotoPreview = '';
  pendingLogoutAccount: Account | null = null;
  darkMode = true;
  privateAccount = false;
  activityStatus = true;
  notifications = true;
  messageAlerts = true;
  callAlerts = true;
  readReceipts = true;
  sensitiveContent = false;
  autoplayVideos = true;
  largerText = false;
  reduceMotion = false;
  dataSaver = false;
  mediaPermission = true;
  personalizedRecommendations = true;
  hideLikeCounts = false;
  hideShareCounts = false;
  tagsAndMentions = true;
  commentsEnabled = true;
  sharingEnabled = true;
  hiddenWordsEnabled = false;
  hiddenWords = '';
  language = 'en';
  currentPassword = '';
  newPassword = '';
  passwordMessage = '';

  get isSearching() {
    return this.searchText.trim().length > 0;
  }

  get filteredSettings() {
    const query = this.searchText.trim().toLowerCase();
    const shortcuts: { label: string; icon: string; section: SettingsSection; keywords: string }[] = [
      { label: 'Accounts Center', icon: 'person-circle-outline', section: 'account', keywords: 'account profiles personal details password security connected experiences ads' },
      { label: 'Edit profile', icon: 'person-outline', section: 'profile', keywords: 'name username photo picture bio gender website' },
      { label: 'Notifications', icon: 'notifications-outline', section: 'notifications', keywords: 'alerts push' },
      { label: 'Privacy', icon: 'lock-closed-outline', section: 'privacy', keywords: 'account private public' },
      { label: 'Close Friends', icon: 'people-outline', section: 'connections', keywords: 'friends following followers' },
      { label: 'Blocked', icon: 'ban-outline', section: 'blocked', keywords: 'blocked accounts restricted' },
      { label: 'Story, live and location', icon: 'eye-off-outline', section: 'story-privacy', keywords: 'privacy hide stories live location' },
    ];
    const keywordsBySection: Partial<Record<SettingsSection, string>> = {
      security: 'password login safety', messages: 'chat calls alerts receipts', content: 'sensitive content autoplay video',
      connections: 'close friends blocked followers following', activity: 'posts history', appearance: 'dark light theme mode',
      accessibility: 'text motion', language: 'translation', data: 'storage saver', permissions: 'media access',
      ads: 'personalized recommendations', payments: 'meta pay subscriptions billing', about: 'version app',
      family: 'teen parental supervision',
      archive: 'archived posts restore', trash: 'deleted posts restore permanently delete',
      muted: 'mute hide accounts', 'like-counts': 'likes shares counts numbers', tags: 'mentions tag people',
      comments: 'comment replies', sharing: 'share repost stories', 'hidden-words': 'filter words comments messages',
    };
    const additional = this.sections
      .filter((section) => !['account', 'privacy', 'blocked', 'story-privacy', 'notifications'].includes(section.id))
      .map((section) => ({ ...section, section: section.id, keywords: keywordsBySection[section.id] ?? '' }));
    return [...shortcuts, ...additional].filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(query));
  }

  get genderLabel() {
    return this.profileGender === 'custom' && this.customGender.trim()
      ? this.customGender.trim()
      : this.genderOptions.find((option) => option.value === this.profileGender)?.label ?? 'Prefer not to say';
  }

  chooseGender(value: typeof this.genderOptions[number]['value']) {
    this.profileGender = value;
    this.genderMenuOpen = false;
  }

  get storyPrivacyAccounts() {
    const selectedId = this.accountService.selectedAccount()?.id;
    return this.accountService.accounts().filter((account) => account.id !== selectedId);
  }

  isStoryHidden(accountId: number) {
    return this.accountService.selectedAccount()?.hiddenStoryIds?.includes(accountId) ?? false;
  }

  toggleStoryHidden(accountId: number) {
    this.accountService.setStoryHidden(accountId, !this.isStoryHidden(accountId));
  }

  constructor() {
    addIcons({ accessibilityOutline, archiveOutline, banOutline, cardOutline, chatbubblesOutline, chevronBackOutline, chevronDownOutline, chevronForwardOutline, checkmarkOutline, colorPaletteOutline, documentTextOutline, eyeOffOutline, informationCircleOutline, keyOutline, languageOutline, lockClosedOutline, logOutOutline, megaphoneOutline, moonOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, personOutline, searchOutline, serverOutline, shieldCheckmarkOutline, starOutline, sunnyOutline, timeOutline, trashOutline });
    this.readPreferences();
    this.privateAccount = this.accountService.selectedAccount()?.privacy === 'private' || this.privateAccount;
    this.language = this.readLanguage();
    this.hiddenWords = this.readHiddenWords();
    this.applyPreferences();
  }

  openSection(section: SettingsSection) {
    this.activeSection = section;
    this.mobileDetailOpen = true;
    if (section === 'profile') {
      const account = this.accountService.selectedAccount();
      this.profileBio = account?.bio ?? '';
      this.profileGender = account?.gender ?? 'prefer-not-to-say';
      this.customGender = account?.customGender ?? '';
      this.profileWebsite = account?.website ?? '';
      this.profilePhotoPreview = account?.profileImage ?? '';
      this.profilePhotoError = '';
      this.genderMenuOpen = false;
    }
  }

  saveProfileSettings() {
    const account = this.accountService.selectedAccount();
    if (!account) return;
    const updated = this.accountService.updateProfile(account.name, account.username, this.profileBio, this.profilePhotoPreview || undefined, account.profileImageVisibility, this.profileGender, this.profileWebsite, this.customGender);
    if (updated) this.postService.updateAuthor(updated.id, updated.name, updated.username);
  }

  onSettingsPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.profilePhotoError = 'Choose an image file.'; return; }
    if (file.size > 5 * 1024 * 1024) { this.profilePhotoError = 'Choose an image smaller than 5 MB.'; return; }
    this.profilePhotoError = '';
    const reader = new FileReader();
    reader.onload = () => this.profilePhotoPreview = String(reader.result ?? '');
    reader.onerror = () => this.profilePhotoError = 'The image could not be read. Please try again.';
    reader.readAsDataURL(file);
  }

  backToCategories() {
    this.mobileDetailOpen = false;
  }

  handleSettingsBack() {
    if (this.mobileDetailOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches) {
      this.backToCategories();
      return;
    }
    void this.router.navigateByUrl('/profile');
  }

  savePreferences() {
    const current = this.accountService.selectedAccount();
    if (current) this.accountService.updatePrivacy(this.privateAccount ? 'private' : 'public', current.repostVisibility ?? 'public');
    if (typeof localStorage !== 'undefined') {
      const preferences = this.preferenceValues();
      Object.entries(preferences).forEach(([key, value]) => localStorage.setItem(`tali-setting-${key}`, String(value)));
      localStorage.setItem('tali-language', this.language);
    }
    this.applyPreferences();
  }

  async onNotificationsChanged() {
    if (this.notifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') this.notifications = false;
    } else if (this.notifications && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      this.notifications = false;
    }
    this.savePreferences();
  }

  get safetyList() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined) return [];
    return this.messageService.conversations().flatMap((conversation) => {
      const settings = this.messageService.settingsFor(conversation.id);
      const personId = conversation.memberIds.find((memberId) => memberId !== id);
      if (personId === undefined || !settings.blockedFor.includes(id) && !settings.restrictedFor.includes(id)) return [];
      const person = this.accountService.accounts().find((item) => item.id === personId);
      return [{ conversationId: conversation.id, personId, name: person?.name ?? 'Unavailable account', username: person?.username ?? '', blocked: settings.blockedFor.includes(id), restricted: settings.restrictedFor.includes(id) }];
    });
  }

  get restrictedList() { return this.safetyList.filter((item) => item.restricted); }
  get blockedList() { return this.safetyList.filter((item) => item.blocked); }

  toggleSafetyList(conversationId: string, preference: 'blockedFor' | 'restrictedFor') {
    const id = this.accountService.selectedAccount()?.id;
    if (id !== undefined) this.messageService.toggleAccountPreference(conversationId, preference, id);
  }

  get mutedList() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined) return [];
    return this.messageService.conversations().flatMap((conversation) => {
      const personId = conversation.memberIds.find((memberId) => memberId !== id);
      if (personId === undefined || !this.messageService.settingsFor(conversation.id).mutedFor.includes(id)) return [];
      const person = this.accountService.accounts().find((account) => account.id === personId);
      return [{ conversationId: conversation.id, name: person?.name ?? 'Unavailable account', username: person?.username ?? '' }];
    });
  }

  unmuteConversation(conversationId: string) {
    const id = this.accountService.selectedAccount()?.id;
    if (id !== undefined && this.messageService.settingsFor(conversationId).mutedFor.includes(id)) {
      this.messageService.toggleAccountPreference(conversationId, 'mutedFor', id);
    }
  }

  saveHiddenWords() {
    if (typeof localStorage !== 'undefined') localStorage.setItem('tali-hidden-words', this.hiddenWords);
  }

  get followers() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? [] : this.accountService.getFollowers(id);
  }

  get following() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? [] : this.accountService.getFollowing(id);
  }

  get closeFriends() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? [] : this.accountService.getCloseFriends(id);
  }

  get closeFriendCandidates() {
    const id = this.accountService.selectedAccount()?.id;
    return this.accountService.accounts().filter((account) => account.id !== id);
  }

  isCloseFriend(accountId: number) {
    return this.closeFriends.some((account) => account.id === accountId);
  }

  toggleCloseFriend(accountId: number) {
    this.accountService.toggleCloseFriend(accountId);
  }

  get ownPosts() {
    const id = this.accountService.selectedAccount()?.id;
    return this.postService.posts().filter((post) => post.authorId === id);
  }

  get archivedPosts() {
    const id = this.accountService.selectedAccount()?.id;
    return this.postService.posts().filter((post) => post.authorId === id && !!post.archivedAt && !post.trashedAt);
  }

  get trashedPosts() {
    const id = this.accountService.selectedAccount()?.id;
    return this.postService.posts().filter((post) => post.authorId === id && !!post.trashedAt);
  }

  updatePassword() {
    const changed = this.accountService.changePassword(this.currentPassword, this.newPassword);
    this.passwordMessage = changed ? 'Password updated.' : 'Current password is incorrect or the new password is empty.';
    if (changed) {
      this.currentPassword = '';
      this.newPassword = '';
    }
  }

  logout() {
    const account = this.accountService.selectedAccount();
    if (!account) {
      this.accountService.logout();
      void this.router.navigateByUrl('/login');
      return;
    }
    this.pendingLogoutAccount = account;
  }

  cancelLogout() {
    this.pendingLogoutAccount = null;
  }

  finishLogout(savePassword: boolean) {
    const account = this.pendingLogoutAccount;
    if (!account) return;
    this.accountService.setPasswordSaved(account.id, savePassword);
    this.pendingLogoutAccount = null;
    this.accountService.logout();
    void this.router.navigateByUrl('/login');
  }
  private applyPreferences() {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('app-light', !this.darkMode);
      document.documentElement.classList.toggle('app-large-text', this.largerText);
      document.documentElement.classList.toggle('app-reduce-motion', this.reduceMotion);
      document.documentElement.lang = this.language;
    }
  }

  private preferenceValues() {
    return {
      darkMode: this.darkMode,
      privateAccount: this.privateAccount,
      activityStatus: this.activityStatus,
      notifications: this.notifications,
      messageAlerts: this.messageAlerts,
      callAlerts: this.callAlerts,
      readReceipts: this.readReceipts,
      sensitiveContent: this.sensitiveContent,
      autoplayVideos: this.autoplayVideos,
      largerText: this.largerText,
      reduceMotion: this.reduceMotion,
      dataSaver: this.dataSaver,
      mediaPermission: this.mediaPermission,
      personalizedRecommendations: this.personalizedRecommendations,
      hideLikeCounts: this.hideLikeCounts,
      hideShareCounts: this.hideShareCounts,
      tagsAndMentions: this.tagsAndMentions,
      commentsEnabled: this.commentsEnabled,
      sharingEnabled: this.sharingEnabled,
      hiddenWordsEnabled: this.hiddenWordsEnabled,
    };
  }

  private readPreferences() {
    const defaults = this.preferenceValues();
    for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
      const stored = this.readPreference(key, defaults[key]);
      switch (key) {
        case 'darkMode': this.darkMode = stored; break;
        case 'privateAccount': this.privateAccount = stored; break;
        case 'activityStatus': this.activityStatus = stored; break;
        case 'notifications': this.notifications = stored; break;
        case 'messageAlerts': this.messageAlerts = stored; break;
        case 'callAlerts': this.callAlerts = stored; break;
        case 'readReceipts': this.readReceipts = stored; break;
        case 'sensitiveContent': this.sensitiveContent = stored; break;
        case 'autoplayVideos': this.autoplayVideos = stored; break;
        case 'largerText': this.largerText = stored; break;
        case 'reduceMotion': this.reduceMotion = stored; break;
        case 'dataSaver': this.dataSaver = stored; break;
        case 'mediaPermission': this.mediaPermission = stored; break;
        case 'personalizedRecommendations': this.personalizedRecommendations = stored; break;
        case 'hideLikeCounts': this.hideLikeCounts = stored; break;
        case 'hideShareCounts': this.hideShareCounts = stored; break;
        case 'tagsAndMentions': this.tagsAndMentions = stored; break;
        case 'commentsEnabled': this.commentsEnabled = stored; break;
        case 'sharingEnabled': this.sharingEnabled = stored; break;
        case 'hiddenWordsEnabled': this.hiddenWordsEnabled = stored; break;
      }
    }
  }

  private readPreference(key: string, fallback: boolean) {
    if (typeof localStorage === 'undefined') return fallback;
    const value = localStorage.getItem(`tali-setting-${key}`) ?? localStorage.getItem(`tali-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    return value === null ? fallback : value === 'true';
  }

  private readLanguage() {
    if (typeof localStorage === 'undefined') return 'en';
    const value = localStorage.getItem('tali-language');
    return value === 'fil' ? value : 'en';
  }

  private readHiddenWords() {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('tali-hidden-words') ?? '';
  }
}