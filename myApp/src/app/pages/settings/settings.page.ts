import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonToggle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { accessibilityOutline, arrowBackOutline, cardOutline, chatbubblesOutline, colorPaletteOutline, documentTextOutline, helpCircleOutline, informationCircleOutline, keyOutline, languageOutline, lockClosedOutline, logOutOutline, megaphoneOutline, moonOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, serverOutline, shieldCheckmarkOutline, sunnyOutline, timeOutline } from 'ionicons/icons';
import { Account, AccountService } from '../../services/account.service';
import { PostService } from '../../services/post.service';
import { MessageService } from '../../services/message.service';

type SettingsSection = 'account' | 'privacy' | 'security' | 'notifications' | 'messages' | 'content' | 'connections' | 'activity' | 'appearance' | 'accessibility' | 'language' | 'data' | 'permissions' | 'ads' | 'payments' | 'help' | 'about';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonToggle, IonToolbar],
})
export class SettingsPage {
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  readonly sections = [
    { id: 'account', label: 'Account Center', icon: 'person-circle-outline' },
    { id: 'privacy', label: 'Privacy', icon: 'lock-closed-outline' },
    { id: 'security', label: 'Security', icon: 'shield-checkmark-outline' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
    { id: 'messages', label: 'Messages and Calls', icon: 'chatbubbles-outline' },
    { id: 'content', label: 'Content Preferences', icon: 'document-text-outline' },
    { id: 'connections', label: 'Followers and Following', icon: 'people-outline' },
    { id: 'activity', label: 'Your Activity', icon: 'time-outline' },
    { id: 'appearance', label: 'Appearance', icon: 'color-palette-outline' },
    { id: 'accessibility', label: 'Accessibility', icon: 'accessibility-outline' },
    { id: 'language', label: 'Language', icon: 'language-outline' },
    { id: 'data', label: 'Data and Storage', icon: 'server-outline' },
    { id: 'permissions', label: 'Permissions', icon: 'key-outline' },
    { id: 'ads', label: 'Ads & Recommendations', icon: 'megaphone-outline' },
    { id: 'payments', label: 'Subscriptions & Payments', icon: 'card-outline' },
    { id: 'help', label: 'Help & Support', icon: 'help-circle-outline' },
    { id: 'about', label: 'About', icon: 'information-circle-outline' },
  ] as const;
  activeSection: SettingsSection = 'account';
  mobileDetailOpen = false;
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
  language = 'en';
  currentPassword = '';
  newPassword = '';
  passwordMessage = '';

  constructor() {
    addIcons({ accessibilityOutline, arrowBackOutline, cardOutline, chatbubblesOutline, colorPaletteOutline, documentTextOutline, helpCircleOutline, informationCircleOutline, keyOutline, languageOutline, lockClosedOutline, logOutOutline, megaphoneOutline, moonOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, serverOutline, shieldCheckmarkOutline, sunnyOutline, timeOutline });
    this.readPreferences();
    this.privateAccount = this.accountService.selectedAccount()?.privacy === 'private' || this.privateAccount;
    this.language = this.readLanguage();
    this.applyPreferences();
  }

  openSection(section: SettingsSection) {
    this.activeSection = section;
    this.mobileDetailOpen = true;
  }

  backToCategories() {
    this.mobileDetailOpen = false;
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

  get followers() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? [] : this.accountService.getFollowers(id);
  }

  get following() {
    const id = this.accountService.selectedAccount()?.id;
    return id === undefined ? [] : this.accountService.getFollowing(id);
  }

  get ownPosts() {
    const id = this.accountService.selectedAccount()?.id;
    return this.postService.posts().filter((post) => post.authorId === id);
  }

  updatePassword() {
    const changed = this.accountService.changePassword(this.currentPassword, this.newPassword);
    this.passwordMessage = changed ? 'Password updated.' : 'Current password is incorrect or the new password is empty.';
    if (changed) {
      this.currentPassword = '';
      this.newPassword = '';
    }
  }

  showHelp() {
    window.alert('For help with your Tali account, please contact your community administrator.');
  }

  logout() {
    this.pendingLogoutAccount = this.accountService.selectedAccount() ?? null;
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
}
