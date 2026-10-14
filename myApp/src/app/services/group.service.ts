import { inject, Injectable, signal } from '@angular/core';
import { Account, AccountService } from './account.service';
import { loadBrowserData, saveBrowserData } from './browser-data.store';
import { PostService } from './post.service';

export interface Group {
  id: string;
  name: string;
  nameLower: string;
  description: string;
  photo?: string;
  coverPhoto?: string;
  privacy: 'public' | 'private';
  adminId: number;
  moderatorIds: number[];
  memberIds: number[];
  pendingRequests: number[];
  createdAt: Date;
}

const groupsStorageKey = 'tali-community-groups';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly accountService = inject(AccountService);
  private readonly postService = inject(PostService);
  readonly groups = signal<Group[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  private nextId = 0;
  private changedBeforeHydration = false;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor() {
    const { groups, migratedLegacyGroups, error: localLoadError } = this.loadLocalGroups();
    this.groups.set(groups);
    this.changedBeforeHydration = migratedLegacyGroups;

    let browserLoadError: unknown;
    void loadBrowserData(groupsStorageKey, groups, isStoredGroupList, (error) => {
      browserLoadError = error;
      console.error('Could not load saved groups from browser storage.', error);
    }).then(
      (savedGroups) => {
        const normalizedGroups = savedGroups
          .map((group) => normalizeGroup(group, this.accountService.selectedAccount()?.id))
          .filter((group): group is Group => group !== null);
        const mergedGroups = mergeGroups(normalizedGroups, this.groups());
        this.groups.set(mergedGroups);
        this.loading.set(false);
        console.log('Groups loaded', { groupCount: mergedGroups.length });
        if ((browserLoadError ?? localLoadError) !== undefined && mergedGroups.length === 0) {
          this.loadError.set('Groups could not be loaded. Check your browser storage and try again.');
        }
        if (this.changedBeforeHydration || savedGroups.some(groupNeedsMigration)) this.persistGroups();
      },
      (error: unknown) => {
        console.error('Could not load saved groups.', error);
        this.loading.set(false);
        this.loadError.set('Groups could not be loaded. Check your browser storage and try again.');
      },
    );
  }

  async createGroup(name: string, description: string, photo: string | undefined, creator: Pick<Account, 'id'>): Promise<Group> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Enter a group name.');

    const group: Group = {
      id: `${Date.now()}-${++this.nextId}`,
      name: normalizedName,
      nameLower: normalizedName.toLocaleLowerCase(),
      description: description.trim(),
      photo,
      privacy: 'public',
      adminId: creator.id,
      moderatorIds: [],
      memberIds: [creator.id],
      pendingRequests: [],
      createdAt: new Date(),
    };
    this.groups.update((groups) => [group, ...groups]);
    if (!this.persistGroups()) {
      this.groups.update((groups) => groups.filter((item) => item.id !== group.id));
      throw new Error('The group could not be saved in this browser.');
    }
    await this.persistenceQueue;
    return group;
  }

  getGroups() {
    return this.groups();
  }

  searchGroups(query: string, userId: number, scope: 'discover' | 'mine') {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const allGroups = this.groups();
    return allGroups.filter((group) => {
      const isMember = group.memberIds.includes(userId);
      if (scope === 'mine' && !isMember) return false;
      if (scope === 'discover' && !normalizedQuery && isMember) return false;
      return !normalizedQuery ||
        group.nameLower.includes(normalizedQuery) ||
        group.description.toLocaleLowerCase().includes(normalizedQuery);
    });
  }

  getGroupById(id: string) {
    return this.groups().find((group) => group.id === id) ?? null;
  }

  updateGroupInfo(groupId: string, actorId: number, name: string, description: string) {
    const group = this.getGroupById(groupId);
    const normalizedName = name.trim();
    if (!group || group.adminId !== actorId || !normalizedName) return false;
    const previous = group;
    this.groups.update((groups) => groups.map((item) => item.id === groupId
      ? { ...item, name: normalizedName, nameLower: normalizedName.toLocaleLowerCase(), description: description.trim() }
      : item,
    ));
    if (this.persistGroups()) return true;
    this.groups.update((groups) => groups.map((item) => item.id === groupId ? previous : item));
    return false;
  }

  approveRequest(groupId: string, actorId: number, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || !this.canModerate(group, actorId) || !group.pendingRequests.includes(userId)) return false;
    const previous = group;
    this.groups.update((groups) => groups.map((item) => item.id === groupId
      ? {
        ...item,
        memberIds: item.memberIds.includes(userId) ? item.memberIds : [...item.memberIds, userId],
        pendingRequests: item.pendingRequests.filter((id) => id !== userId),
      }
      : item,
    ));
    if (this.persistGroups()) return true;
    this.groups.update((groups) => groups.map((item) => item.id === groupId ? previous : item));
    return false;
  }

  declineRequest(groupId: string, actorId: number, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || !this.canModerate(group, actorId) || !group.pendingRequests.includes(userId)) return false;
    const previous = group;
    this.groups.update((groups) => groups.map((item) => item.id === groupId
      ? { ...item, pendingRequests: item.pendingRequests.filter((id) => id !== userId) }
      : item,
    ));
    if (this.persistGroups()) return true;
    this.groups.update((groups) => groups.map((item) => item.id === groupId ? previous : item));
    return false;
  }

  removeMember(groupId: string, actorId: number, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || group.adminId !== actorId || group.adminId === userId || !group.memberIds.includes(userId)) return false;
    const previous = group;
    this.groups.update((groups) => groups.map((item) => item.id === groupId
      ? {
        ...item,
        memberIds: item.memberIds.filter((id) => id !== userId),
        moderatorIds: item.moderatorIds.filter((id) => id !== userId),
      }
      : item,
    ));
    if (this.persistGroups()) return true;
    this.groups.update((groups) => groups.map((item) => item.id === groupId ? previous : item));
    return false;
  }

  canModerate(group: Group, userId: number) {
    return group.adminId === userId || group.moderatorIds.includes(userId);
  }

  canViewGroupPost(groupId: string, userId: number | undefined) {
    const group = this.getGroupById(groupId);
    return !!group && (group.privacy === 'public' || (userId !== undefined && group.memberIds.includes(userId)));
  }

  joinGroup(groupId: string, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || group.privacy !== 'public' || group.memberIds.includes(userId)) return false;
    this.groups.update((groups) => groups.map((item) =>
      item.id === groupId ? { ...item, memberIds: [...item.memberIds, userId] } : item,
    ));
    if (!this.persistGroups()) {
      this.groups.update((groups) => groups.map((item) =>
        item.id === groupId ? { ...item, memberIds: item.memberIds.filter((id) => id !== userId) } : item,
      ));
      return false;
    }
    return true;
  }

  leaveGroup(groupId: string, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || group.adminId === userId || !group.memberIds.includes(userId)) return false;
    this.groups.update((groups) => groups.map((item) =>
      item.id === groupId ? { ...item, memberIds: item.memberIds.filter((id) => id !== userId) } : item,
    ));
    if (!this.persistGroups()) {
      this.groups.update((groups) => groups.map((item) =>
        item.id === groupId ? { ...item, memberIds: [...item.memberIds, userId] } : item,
      ));
      return false;
    }
    return true;
  }

  requestToJoin(groupId: string, userId: number) {
    const group = this.getGroupById(groupId);
    if (!group || group.privacy !== 'private' || group.memberIds.includes(userId) || group.pendingRequests.includes(userId)) return false;
    this.groups.update((groups) => groups.map((item) =>
      item.id === groupId ? { ...item, pendingRequests: [...item.pendingRequests, userId] } : item,
    ));
    if (!this.persistGroups()) {
      this.groups.update((groups) => groups.map((item) =>
        item.id === groupId ? { ...item, pendingRequests: item.pendingRequests.filter((id) => id !== userId) } : item,
      ));
      return false;
    }
    return true;
  }

  deleteGroup(id: string, actorId: number) {
    const group = this.getGroupById(id);
    if (!group || group.adminId !== actorId) return false;
    if (!this.postService.removeGroupPosts(id)) throw new Error('Could not save the group post cleanup.');
    this.groups.update((groups) => groups.filter((group) => group.id !== id));
    if (!this.persistGroups()) {
      this.groups.update((groups) => [group, ...groups]);
      this.persistGroups();
      throw new Error('Could not save the deleted group.');
    }
    return true;
  }

  private loadLocalGroups(): { groups: Group[]; migratedLegacyGroups: boolean; error?: unknown } {
    if (typeof localStorage === 'undefined') return { groups: [], migratedLegacyGroups: false };
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(groupsStorageKey) ?? '[]');
      if (!Array.isArray(stored)) {
        const error = new Error('Saved group data in local storage is not a list.');
        console.error('Could not read saved groups from local storage.', error);
        return { groups: [], migratedLegacyGroups: false, error };
      }
      let migratedLegacyGroups = false;
      const groups = stored.flatMap((record): Group[] => {
        const migrated = migrateLegacyGroup(record, this.accountService.accounts(), this.accountService.selectedAccount());
        if (migrated) {
          migratedLegacyGroups = true;
          return [migrated];
        }
        if (groupNeedsMigration(record)) migratedLegacyGroups = true;
        const normalized = normalizeGroup(record, this.accountService.selectedAccount()?.id);
        return normalized ? [normalized] : [];
      });
      return { groups, migratedLegacyGroups };
    } catch (error) {
      console.error('Could not read saved groups from local storage.', error);
      return { groups: [], migratedLegacyGroups: false, error };
    }
  }

  private persistGroups() {
    this.changedBeforeHydration = true;
    const snapshot = this.groups().map((group) => ({ ...group, memberIds: [...group.memberIds] }));
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(groupsStorageKey, JSON.stringify(snapshot));
      } catch (error) {
        console.error('Could not save groups to local storage.', error);
        return false;
      }
    }
    this.persistenceQueue = this.persistenceQueue.then(() => saveBrowserData(groupsStorageKey, snapshot));
    return true;
  }
}

function mergeGroups(savedGroups: Group[], currentGroups: Group[]): Group[] {
  const merged = new Map(savedGroups.map((group) => [group.id, group]));
  for (const group of currentGroups) {
    if (!merged.has(group.id)) merged.set(group.id, group);
  }
  return [...merged.values()].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
}

function restoreGroupDates(group: Group): Group {
  return normalizeGroup(group, group.adminId) ?? group;
}

function isStoredGroupList(value: unknown): value is Group[] {
  return Array.isArray(value) && value.every(isGroupRecord);
}

function isGroupRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const group = value as Record<string, unknown>;
  return typeof group['id'] === 'string' && typeof group['name'] === 'string';
}

function normalizeGroup(value: unknown, fallbackAdminId?: number): Group | null {
  if (!isGroupRecord(value)) return null;
  const record = value as Partial<Group>;
  const adminId = Number.isSafeInteger(record.adminId) ? record.adminId! : fallbackAdminId ?? 0;
  const memberIds = Array.isArray(record.memberIds)
    ? record.memberIds.filter((id): id is number => Number.isSafeInteger(id))
    : [];
  const createdAt = isValidDateValue(record.createdAt) ? new Date(record.createdAt) : new Date();
  return {
    id: record.id!,
    name: record.name!,
    nameLower: record.name!.trim().toLocaleLowerCase(),
    description: typeof record.description === 'string' ? record.description : '',
    photo: typeof record.photo === 'string' ? record.photo : undefined,
    coverPhoto: typeof record.coverPhoto === 'string' ? record.coverPhoto : undefined,
    privacy: record.privacy === 'private' ? 'private' : 'public',
    adminId,
    moderatorIds: Array.isArray(record.moderatorIds)
      ? record.moderatorIds.filter((id): id is number => Number.isSafeInteger(id))
      : [],
    memberIds: [...new Set([...memberIds, adminId])],
    pendingRequests: Array.isArray(record.pendingRequests)
      ? record.pendingRequests.filter((id): id is number => Number.isSafeInteger(id))
      : [],
    createdAt,
  };
}

function groupNeedsMigration(value: unknown) {
  if (!isGroupRecord(value)) return true;
  const group = value as Partial<Group>;
  return typeof group.nameLower !== 'string' ||
    group.nameLower !== group.name!.trim().toLocaleLowerCase() ||
    (group.privacy !== 'public' && group.privacy !== 'private') ||
    !Array.isArray(group.moderatorIds) ||
    !Array.isArray(group.memberIds) ||
    !Array.isArray(group.pendingRequests) ||
    !Number.isSafeInteger(group.adminId) ||
    (Number.isSafeInteger(group.adminId) && !group.memberIds.includes(group.adminId!));
}

function isValidDateValue(value: unknown): value is string | Date {
  if (typeof value !== 'string' && !(value instanceof Date)) return false;
  return Number.isFinite(new Date(value).getTime());
}

function migrateLegacyGroup(value: unknown, accounts: Account[], selected: Account | null): Group | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { id?: unknown; name?: unknown; description?: unknown; creator?: unknown };
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  const creator = record.creator === 'you'
    ? selected
    : accounts.find((account) => account.name === record.creator || account.username === record.creator) ?? null;
  if (!creator) return null;
  return {
    id: record.id,
    name: record.name,
    nameLower: record.name.trim().toLocaleLowerCase(),
    description: typeof record.description === 'string' ? record.description : '',
    photo: undefined,
    coverPhoto: undefined,
    privacy: 'public',
    adminId: creator.id,
    moderatorIds: [],
    memberIds: [creator.id],
    pendingRequests: [],
    createdAt: new Date(),
  };
}
