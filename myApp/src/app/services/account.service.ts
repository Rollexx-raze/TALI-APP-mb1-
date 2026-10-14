import { Injectable, inject, signal } from '@angular/core';
import { loadBrowserData, saveBrowserData } from './browser-data.store';
import { NotificationService } from './notification.service';

export interface Account {
  id: number;
  name: string;
  username: string;
  contact: string;
  password: string;
  bio: string;
  privacy?: 'public' | 'private';
  repostVisibility?: 'public' | 'friends' | 'only-me';
  profileImage?: string;
  profileImageVisibility?: 'public' | 'friends' | 'only-me';
  verified?: boolean;
  followersIds: number[];
  followingIds: number[];
  mutedAccountIds?: number[];
  blockedAccountIds?: number[];
  isOnline?: boolean;
  lastSeenAt?: string;
}

const accountsStorageKey = 'tali-accounts';
const activeAccountStorageKey = 'tali-active-account';
const unsavedPasswordIdsStorageKey = 'tali-unsaved-password-ids';
const hiddenAccountIdsStorageKey = 'tali-hidden-account-ids';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly notificationService = inject(NotificationService);
  accounts = signal<Account[]>([]);
  private readonly unsavedPasswordIds = signal<number[]>(loadStoredIds(unsavedPasswordIdsStorageKey));
  private readonly hiddenAccountIds = signal<number[]>(loadStoredIds(hiddenAccountIdsStorageKey));

  selectedAccount = signal<Account | null>(null);
  private changedBeforeHydration = false;
  private selectionChanged = false;

  constructor() {
    const accounts = this.loadAccounts();
    const activeAccountId = this.loadActiveAccountId();
    this.accounts.set(accounts);
    this.selectedAccount.set(accounts.find((account) => account.id === activeAccountId) ?? null);
    void loadBrowserData(accountsStorageKey, accounts, isStoredAccountList).then((savedAccounts) => {
      const currentSelectionId = this.selectedAccount()?.id;
      const mergedAccounts = this.changedBeforeHydration
        ? mergeAccounts(savedAccounts, this.accounts())
        : savedAccounts;
      this.accounts.set(mergedAccounts);
      if (!this.selectionChanged) {
        this.selectedAccount.set(mergedAccounts.find((account) => account.id === activeAccountId) ?? null);
      } else {
        this.selectedAccount.set(mergedAccounts.find((account) => account.id === currentSelectionId) ?? null);
      }
      if (this.changedBeforeHydration) this.persistAccounts();
    });
  }

  selectAccount(account: Account) {
    this.selectionChanged = true;
    this.selectedAccount.set(account);
    this.persistActiveAccount();
  }

  listedAccounts() {
    const hiddenIds = new Set(this.hiddenAccountIds());
    return this.accounts().filter((account) => !hiddenIds.has(account.id));
  }

  isPasswordSaved(accountId: number) {
    return !this.unsavedPasswordIds().includes(accountId);
  }

  setPasswordSaved(accountId: number, saved: boolean) {
    const ids = this.unsavedPasswordIds();
    const updated = saved
      ? ids.filter((id) => id !== accountId)
      : (ids.includes(accountId) ? ids : [...ids, accountId]);
    this.unsavedPasswordIds.set(updated);
    persistIds(unsavedPasswordIdsStorageKey, updated);
  }

  removePasswordFromChooser(accountId: number) {
    this.setPasswordSaved(accountId, false);
  }

  removeAccountFromChooser(accountId: number) {
    const updated = this.hiddenAccountIds().includes(accountId)
      ? this.hiddenAccountIds()
      : [...this.hiddenAccountIds(), accountId];
    this.hiddenAccountIds.set(updated);
    persistIds(hiddenAccountIdsStorageKey, updated);
  }

  createAccount(firstName: string, lastName: string, username: string, contact: string, password: string) {
    const normalizedContact = contact.trim().toLowerCase();
    const normalizedUsername = `@${username.trim().replace(/^@+/, '').toLowerCase()}`;
    if (this.accounts().some((account) =>
      account.contact.toLowerCase() === normalizedContact || account.username.toLowerCase() === normalizedUsername,
    )) return null;

    const account: Account = {
      id: Date.now(),
      name: `${firstName.trim()} ${lastName.trim()}`,
      username: normalizedUsername,
      contact: normalizedContact,
      password,
      bio: '',
      followersIds: [],
      followingIds: [],
    };

    this.accounts.update((accounts) => [...accounts, account]);
    this.selectedAccount.set(account);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
    return account;
  }

  updateProfile(name: string, username: string, bio: string, profileImage?: string, profileImageVisibility: 'public' | 'friends' | 'only-me' = 'public') {
    const selected = this.selectedAccount();
    if (!selected) return null;

    const updated: Account = {
      ...selected,
      name: name.trim(),
      username: username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`,
      bio: bio.trim(),
      profileImage,
      profileImageVisibility,
    };
    this.accounts.update((accounts) => accounts.map((account) => account.id === selected.id ? updated : account));
    this.selectedAccount.set(updated);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
    return updated;
  }

  canViewProfileImage(profile: Account, viewer: Account | null) {
    if (!profile.profileImage) return false;
    if (profile.id === viewer?.id) return true;
    const visibility = profile.profileImageVisibility ?? 'public';
    if (visibility === 'only-me') return false;
    if (visibility === 'public') return true;
    return !!viewer && profile.followingIds.includes(viewer.id) && viewer.followingIds.includes(profile.id);
  }

  updatePrivacy(privacy: 'public' | 'private', repostVisibility: 'public' | 'friends' | 'only-me') {
    const selected = this.selectedAccount();
    if (!selected) return;
    const updated = { ...selected, privacy, repostVisibility };
    this.accounts.update((items) => items.map((item) => item.id === selected.id ? updated : item));
    this.selectedAccount.set(updated);
    this.persistAccounts();
    this.persistActiveAccount();
  }

  logout() {
    this.selectionChanged = true;
    this.selectedAccount.set(null);
    this.persistActiveAccount();
  }

  changePassword(currentPassword: string, newPassword: string) {
    const selected = this.selectedAccount();
    if (!selected || selected.password !== currentPassword || !newPassword.trim()) return false;
    const updated = { ...selected, password: newPassword };
    this.accounts.update((accounts) => accounts.map((account) => account.id === selected.id ? updated : account));
    this.selectedAccount.set(updated);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
    return true;
  }

  followAccount(targetId: number) {
    const selected = this.selectedAccount();
    if (!selected || selected.id === targetId || selected.followingIds.includes(targetId)) return;

    const accounts = this.accounts();
    const target = accounts.find((account) => account.id === targetId);
    if (!target) return;

    const updatedSelected = { ...selected, followingIds: [...selected.followingIds, targetId] };
    const updatedTarget = { ...target, followersIds: [...target.followersIds, selected.id] };
    this.accounts.set(accounts.map((account) =>
      account.id === selected.id ? updatedSelected : account.id === targetId ? updatedTarget : account,
    ));
    this.selectedAccount.set(updatedSelected);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
    this.notificationService.notifyFollow(selected, targetId);
  }

  unfollowAccount(targetId: number) {
    const selected = this.selectedAccount();
    if (!selected || !selected.followingIds.includes(targetId)) return;

    const accounts = this.accounts();
    const target = accounts.find((account) => account.id === targetId);
    const updatedSelected = { ...selected, followingIds: selected.followingIds.filter((id) => id !== targetId) };
    this.accounts.set(accounts.map((account) => {
      if (account.id === selected.id) return updatedSelected;
      if (account.id === targetId && target) {
        return { ...target, followersIds: target.followersIds.filter((id) => id !== selected.id) };
      }
      return account;
    }));
    this.selectedAccount.set(updatedSelected);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
  }

  toggleMutedAccount(targetId: number) {
    this.updateSelectedAccountList('mutedAccountIds', targetId);
  }

  toggleBlockedAccount(targetId: number) {
    this.updateSelectedAccountList('blockedAccountIds', targetId);
  }

  private updateSelectedAccountList(key: 'mutedAccountIds' | 'blockedAccountIds', targetId: number) {
    const selected = this.selectedAccount();
    if (!selected || selected.id === targetId || !this.accounts().some((account) => account.id === targetId)) return;
    const current = selected[key] ?? [];
    const updated = { ...selected, [key]: current.includes(targetId) ? current.filter((id) => id !== targetId) : [...current, targetId] };
    this.accounts.update((items) => items.map((item) => item.id === selected.id ? updated : item));
    this.selectedAccount.set(updated);
    this.selectionChanged = true;
    this.persistAccounts();
    this.persistActiveAccount();
  }

  getFollowers(accountId: number) {
    return this.accounts().filter((account) => account.followingIds.includes(accountId));
  }

  getFollowing(accountId: number) {
    const account = this.accounts().find((item) => item.id === accountId);
    return this.accounts().filter((item) => account?.followingIds.includes(item.id));
  }

  authenticate(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    return this.accounts().find(
      (account) =>
        account.contact.toLowerCase() === normalizedIdentifier &&
        account.password === password,
    ) ?? null;
  }

  private loadAccounts(): Account[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(accountsStorageKey) ?? '[]') as unknown;
      return Array.isArray(stored) ? stored.filter(isStoredAccount) : [];
    } catch {
      return [];
    }
  }

  private loadActiveAccountId(): number | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(activeAccountStorageKey);
      if (stored === null) return null;
      const accountId = Number(stored);
      return Number.isSafeInteger(accountId) ? accountId : null;
    } catch {
      return null;
    }
  }

  private persistAccounts() {
    this.changedBeforeHydration = true;
    void saveBrowserData(accountsStorageKey, this.accounts());
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(accountsStorageKey, JSON.stringify(this.accounts()));
    } catch {
      return;
    }
  }

  private persistActiveAccount() {
    if (typeof localStorage === 'undefined') return;
    try {
      const account = this.selectedAccount();
      if (account) localStorage.setItem(activeAccountStorageKey, String(account.id));
      else localStorage.removeItem(activeAccountStorageKey);
    } catch {
      return;
    }
  }
}

function loadStoredIds(key: string): number[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is number => Number.isSafeInteger(id)) : [];
  } catch {
    return [];
  }
}

function persistIds(key: string, ids: number[]) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { return; }
}

function isStoredAccountList(value: unknown): value is Account[] {
  return Array.isArray(value) && value.every(isStoredAccount);
}

function mergeAccounts(savedAccounts: Account[], currentAccounts: Account[]): Account[] {
  const merged = new Map(savedAccounts.map((account) => [account.id, account]));
  for (const account of currentAccounts) merged.set(account.id, account);
  return [...merged.values()];
}

function isStoredAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const account = value as Partial<Account>;
  return Number.isSafeInteger(account.id) &&
    typeof account.name === 'string' &&
    typeof account.username === 'string' &&
    typeof account.contact === 'string' &&
    typeof account.password === 'string' &&
    typeof account.bio === 'string' &&
    (account.privacy === undefined || account.privacy === 'public' || account.privacy === 'private') &&
    (account.repostVisibility === undefined || ['public', 'friends', 'only-me'].includes(account.repostVisibility)) &&
    (account.profileImage === undefined || typeof account.profileImage === 'string') &&
    (account.verified === undefined || typeof account.verified === 'boolean') &&
    Array.isArray(account.followersIds) && account.followersIds.every(Number.isSafeInteger) &&
    Array.isArray(account.followingIds) && account.followingIds.every(Number.isSafeInteger) &&
    (account.mutedAccountIds === undefined || Array.isArray(account.mutedAccountIds) && account.mutedAccountIds.every(Number.isSafeInteger)) &&
    (account.blockedAccountIds === undefined || Array.isArray(account.blockedAccountIds) && account.blockedAccountIds.every(Number.isSafeInteger)) &&
    (account.isOnline === undefined || typeof account.isOnline === 'boolean') &&
    (account.lastSeenAt === undefined || typeof account.lastSeenAt === 'string');
}
