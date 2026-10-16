import { Injectable, inject, signal } from '@angular/core';
import { loadBrowserData, saveBrowserData, saveBrowserDataResult } from './browser-data.store';
import { AccountService } from './account.service';
import { NotificationService } from './notification.service';

const conversationsStorageKey = 'tali-conversations';
const communitiesStorageKey = 'tali-communities';

export interface ChatMessage {
  id: string;
  senderId: number;
  body: string;
  createdAt: Date;
  reactions?: Record<string, number[]>;
  readBy?: number[];
  seenBy?: number[];
  attachments?: ChatAttachment[];
  pinnedFor?: number[];
  reportedFor?: number[];
  forwarded?: boolean;
  replyTo?: { messageId: string; senderId: number; body: string };
}

export interface ChatAttachment {
  kind: 'photo' | 'video' | 'gif' | 'voice' | 'file';
  name: string;
  url: string;
  durationSeconds?: number;
}

export type SharedItemsType = 'photos' | 'links' | 'files' | 'voice messages';

export interface ChatSettings {
  theme: 'light' | 'dark';
  nicknames: Record<string, string>;
  reactionEmoji: string;
  pinnedFor: number[];
  acceptedFor: number[];
  archivedFor: number[];
  unreadFor: number[];
  mutedFor: number[];
  restrictedFor: number[];
  blockedFor: number[];
  reportedFor: number[];
}

export interface Conversation {
  id: string;
  memberIds: number[];
  groupName: string | null;
  communityId?: string;
  messages: ChatMessage[];
  updatedAt: Date;
  settings?: ChatSettings;
}

export interface Community {
  id: string;
  name: string;
  ownerId: number;
  memberIds: number[];
  inviteCode: string;
  createdAt: Date;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly accountService = inject(AccountService);
  private readonly notificationService = inject(NotificationService);
  private resolveCommunityDataHydrated!: () => void;
  private resolveConversationDataHydrated!: () => void;
  readonly conversations = signal<Conversation[]>([]);
  readonly conversationDataHydrated = new Promise<void>((resolve) => {
    this.resolveConversationDataHydrated = resolve;
  });
  readonly communities = signal<Community[]>([]);
  readonly communityDataReady = signal(false);
  readonly communityDataHydrated = new Promise<void>((resolve) => {
    this.resolveCommunityDataHydrated = resolve;
  });
  readonly sendStates = signal<Record<string, 'sending' | 'sent' | 'failed'>>({});
  private readonly typingByConversation = signal<Map<string, number[]>>(new Map());
  private nextId = 0;
  private changedBeforeHydration = false;

  constructor() {
    void loadBrowserData(conversationsStorageKey, [], isStoredConversationList).then((saved) => {
      const conversations = this.changedBeforeHydration
        ? mergeConversations(saved, this.conversations())
        : saved;
      this.conversations.set(conversations.map(restoreConversationDates));
      if (this.changedBeforeHydration) this.persistConversations();
    }).catch((error: unknown) => {
      console.error('Could not load conversations.', error);
    }).finally(() => {
      this.resolveConversationDataHydrated();
    });
    void loadBrowserData(communitiesStorageKey, [], isStoredCommunityList).then((saved) => {
      this.communities.set(saved.map((community) => ({
        ...community,
        createdAt: new Date(community.createdAt),
      })));
      this.communityDataReady.set(true);
      this.resolveCommunityDataHydrated();
    }).catch((error: unknown) => {
      console.error('Could not load communities.', error);
      this.communityDataReady.set(true);
      this.resolveCommunityDataHydrated();
    });
  }

  openDirectConversation(accountId: number, otherAccountId: number) {
    const memberIds = [accountId, otherAccountId].sort((a, b) => a - b);
    const existing = this.conversations().find((conversation) =>
      !conversation.groupName && conversation.memberIds.length === 2 &&
      conversation.memberIds[0] === memberIds[0] && conversation.memberIds[1] === memberIds[1],
    );
    return existing ?? this.createConversation(memberIds, null);
  }

  createGroupConversation(accountIds: number[], groupName: string) {
    const members = [...new Set(accountIds)];
    if (members.length < 2 || !groupName.trim()) return null;
    return this.createConversation(members, groupName.trim());
  }

  async createCommunity(name: string, ownerId: number) {
    await this.communityDataHydrated;
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const community: Community = {
      id: `community-${Date.now()}-${++this.nextId}`,
      name: trimmedName,
      ownerId,
      memberIds: [ownerId],
      inviteCode: createCommunityInviteCode(),
      createdAt: new Date(),
    };
    this.communities.update((communities) => [community, ...communities]);
    if (!await this.persistCommunities()) {
      this.communities.update((communities) => communities.filter((item) => item.id !== community.id));
      return null;
    }
    return community;
  }

  async createCommunityChat(communityId: string, name: string) {
    await this.communityDataHydrated;
    await this.conversationDataHydrated;
    const community = this.communities().find((item) => item.id === communityId);
    const chatName = name.trim();
    if (!community || !chatName) return null;
    const conversation = this.createConversation([...community.memberIds], chatName, community.id);
    if (!await this.persistConversations()) {
      this.conversations.update((conversations) => conversations.filter((item) => item.id !== conversation.id));
      return null;
    }
    return conversation;
  }

  async joinCommunityByInvite(inviteCode: string, accountId: number) {
    await this.communityDataHydrated;
    await this.conversationDataHydrated;
    const community = this.communities().find((item) => item.inviteCode === inviteCode);
    if (!community) return null;
    if (!community.memberIds.includes(accountId)) {
      const previousCommunities = this.communities();
      const previousConversations = this.conversations();
      const updatedCommunity = { ...community, memberIds: [...community.memberIds, accountId] };
      this.communities.update((items) => items.map((item) => item.id === community.id ? updatedCommunity : item));
      this.conversations.update((items) => items.map((item) =>
        item.communityId === community.id && !item.memberIds.includes(accountId)
          ? { ...item, memberIds: [...item.memberIds, accountId] }
          : item,
      ));
      const [communitySaved, conversationsSaved] = await Promise.all([
        this.persistCommunities(),
        this.persistConversations(),
      ]);
      if (!communitySaved || !conversationsSaved) {
        this.communities.set(previousCommunities);
        this.conversations.set(previousConversations);
        await Promise.all([this.persistCommunities(), this.persistConversations()]);
        return null;
      }
      return updatedCommunity;
    }
    return community;
  }

  setTyping(conversationId: string, accountId: number, typing: boolean) {
    this.typingByConversation.update((current) => {
      const next = new Map(current);
      const users = new Set(next.get(conversationId) ?? []);
      if (typing) users.add(accountId); else users.delete(accountId);
      if (users.size) next.set(conversationId, [...users]); else next.delete(conversationId);
      return next;
    });
  }

  typingAccounts(conversationId: string) {
    return this.typingByConversation().get(conversationId) ?? [];
  }

  sendMessage(conversationId: string, senderId: number, body: string, attachments: ChatAttachment[] = [], metadata: Pick<ChatMessage, 'forwarded' | 'replyTo'> = {}) {
    const text = body.trim();
    if ((!text && !attachments.length) || !this.conversations().some((item) => item.id === conversationId)) return null;

    const existingConversation = this.conversations().find((item) => item.id === conversationId);
    if (existingConversation && !existingConversation.groupName && existingConversation.messages.length === 0) {
      const actor = this.accountService.accounts().find((account) => account.id === senderId);
      if (actor) {
        for (const recipientId of existingConversation.memberIds.filter((id) => id !== senderId)) {
          const recipient = this.accountService.accounts().find((account) => account.id === recipientId);
          const acceptedFor = normalizeChatSettings(existingConversation.settings).acceptedFor;
          if (recipient && !recipient.followingIds.includes(senderId) && !acceptedFor.includes(senderId) && !acceptedFor.includes(recipientId)) {
            const preview = text || (attachments[0]?.kind === 'voice' ? 'Voice message' : attachments[0]?.kind === 'video' ? 'Video' : attachments[0]?.kind === 'gif' ? 'GIF' : attachments[0]?.kind === 'file' ? 'File' : 'Photo');
            this.notificationService.notifyMessageRequest(actor, recipientId, conversationId, preview);
          }
        }
      }
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${++this.nextId}`,
      senderId,
      body: text,
      attachments,
      createdAt: new Date(),
      readBy: [senderId],
      seenBy: [senderId],
      ...metadata,
    };
    this.conversations.update((conversations) => conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const settings = normalizeChatSettings(conversation.settings);
      const unreadFor = new Set(settings.unreadFor.filter((id) => id !== senderId));
      for (const memberId of conversation.memberIds) if (memberId !== senderId) unreadFor.add(memberId);
      const messages = [...conversation.messages, message];
      return { ...conversation, settings: { ...settings, unreadFor: [...unreadFor] }, messages, updatedAt: message.createdAt };
    }));
    this.setSendState(message.id, 'sending');
    void this.persistConversations().then((saved) => {
      this.setSendState(message.id, saved ? 'sent' : 'failed');
    });
    return message;
  }

  async retryMessage(conversationId: string, messageId: string) {
    const messageExists = this.conversations().some((conversation) => conversation.id === conversationId && conversation.messages.some((message) => message.id === messageId));
    if (!messageExists) return false;
    this.setSendState(messageId, 'sending');
    const saved = await this.persistConversations();
    this.setSendState(messageId, saved ? 'sent' : 'failed');
    return saved;
  }

  private setSendState(messageId: string, state: 'sending' | 'sent' | 'failed') {
    this.sendStates.update((states) => ({ ...states, [messageId]: state }));
  }

  settingsFor(conversationId: string) {
    return normalizeChatSettings(this.conversations().find((item) => item.id === conversationId)?.settings);
  }

  markRead(conversationId: string, accountId: number) {
    let changed = false;
    this.conversations.update((conversations) => conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const settings = normalizeChatSettings(conversation.settings);
      const unreadFor = settings.unreadFor.filter((id) => id !== accountId);
      const messages = conversation.messages.map((message) => {
        if (message.senderId === accountId) return message;
        const readBy = message.readBy ?? [];
        const seenBy = message.seenBy ?? [];
        const needsRead = !readBy.includes(accountId);
        const needsReceipt = isSettingEnabled('readReceipts', true) && !seenBy.includes(accountId);
        if (!needsRead && !needsReceipt) return message;
        changed = true;
        return {
          ...message,
          readBy: needsRead ? [...readBy, accountId] : readBy,
          seenBy: needsReceipt ? [...seenBy, accountId] : seenBy,
        };
      });
      if (unreadFor.length !== settings.unreadFor.length) changed = true;
      return { ...conversation, settings: { ...settings, unreadFor }, messages };
    }));
    if (changed) this.persistConversations();
  }

  updateSettings(conversationId: string, changes: Partial<ChatSettings>) {
    this.conversations.update((conversations) => conversations.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, settings: { ...normalizeChatSettings(conversation.settings), ...changes } }
        : conversation,
    ));
    this.persistConversations();
  }

  deleteConversation(conversationId: string) {
    this.conversations.update((items) => items.filter((item) => item.id !== conversationId));
    this.persistConversations();
  }

  toggleAccountPreference(
    conversationId: string,
    preference: 'pinnedFor' | 'archivedFor' | 'unreadFor' | 'mutedFor' | 'restrictedFor' | 'blockedFor' | 'reportedFor',
    accountId: number,
  ) {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation) return;
    const values = normalizeChatSettings(conversation.settings)[preference];
    this.updateSettings(conversationId, {
      [preference]: values.includes(accountId)
        ? values.filter((id) => id !== accountId)
        : [...values, accountId],
    });
  }

  toggleReaction(conversationId: string, messageId: string, accountId: number, emoji: string) {
    this.conversations.update((conversations) => conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        messages: conversation.messages.map((message) => {
          if (message.id !== messageId) return message;
          const reactions = Object.fromEntries(Object.entries(message.reactions ?? {}).map(([key, users]) => [
            key, users.filter((id) => id !== accountId),
          ])) as Record<string, number[]>;
          const hadThisReaction = (message.reactions?.[emoji] ?? []).includes(accountId);
          if (!hadThisReaction) reactions[emoji] = [...(reactions[emoji] ?? []), accountId];
          if (!reactions[emoji].length) delete reactions[emoji];
          return { ...message, reactions };
        }),
      };
    }));
    this.persistConversations();
  }

  deleteMessage(conversationId: string, messageId: string) {
    this.conversations.update((items) => items.map((conversation) => conversation.id === conversationId
      ? { ...conversation, messages: conversation.messages.filter((message) => message.id !== messageId) }
      : conversation));
    this.persistConversations();
  }

  toggleMessageFlag(conversationId: string, messageId: string, accountId: number, flag: 'pinnedFor' | 'reportedFor') {
    this.conversations.update((items) => items.map((conversation) => conversation.id === conversationId
      ? { ...conversation, messages: conversation.messages.map((message) => {
        if (message.id !== messageId) return message;
        const values = message[flag] ?? [];
        return { ...message, [flag]: values.includes(accountId) ? values.filter((id) => id !== accountId) : [...values, accountId] };
      }) }
      : conversation));
    this.persistConversations();
  }

  private createConversation(memberIds: number[], groupName: string | null, communityId?: string) {
    const conversation: Conversation = {
      id: `${Date.now()}-${++this.nextId}`,
      memberIds,
      groupName,
      ...(communityId ? { communityId } : {}),
      messages: [],
      updatedAt: new Date(),
      settings: normalizeChatSettings(),
    };
    this.conversations.update((conversations) => [conversation, ...conversations]);
    this.persistConversations();
    return conversation;
  }

  private persistConversations(): Promise<boolean> {
    this.changedBeforeHydration = true;
    let localStorageSaved = false;
    try {
      localStorage.setItem(conversationsStorageKey, JSON.stringify(this.conversations()));
      localStorageSaved = true;
    } catch {
      // IndexedDB may still save the conversation if localStorage is full.
    }
    return saveBrowserDataResult(conversationsStorageKey, this.conversations()).then((saved) => saved || localStorageSaved);
  }

  private async persistCommunities() {
    const snapshot = this.communities();
    let localStorageSaved = false;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(communitiesStorageKey, JSON.stringify(snapshot));
        localStorageSaved = true;
      }
    } catch (error) {
      console.error('Could not save communities to local storage.', error);
    }
    return saveBrowserDataResult(communitiesStorageKey, snapshot).then((saved) => saved || localStorageSaved);
  }
}

function createCommunityInviteCode() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function isStoredCommunityList(value: unknown): value is Community[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const community = item as Partial<Community>;
    return typeof community.id === 'string' && typeof community.name === 'string' &&
      Number.isSafeInteger(community.ownerId) && Array.isArray(community.memberIds) &&
      typeof community.inviteCode === 'string' &&
      (typeof community.createdAt === 'string' || community.createdAt instanceof Date);
  });
}

function isSettingEnabled(key: string, fallback: boolean) {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(`tali-setting-${key}`);
  return stored === null ? fallback : stored === 'true';
}

function isStoredConversationList(value: unknown): value is Conversation[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const conversation = item as Partial<Conversation>;
    return typeof conversation.id === 'string' &&
      Array.isArray(conversation.memberIds) &&
      (typeof conversation.groupName === 'string' || conversation.groupName === null) &&
      Array.isArray(conversation.messages) &&
      (typeof conversation.updatedAt === 'string' || conversation.updatedAt instanceof Date) &&
      conversation.messages.every((message) =>
        typeof message.id === 'string' && Number.isSafeInteger(message.senderId) &&
        typeof message.body === 'string' &&
        (typeof message.createdAt === 'string' || message.createdAt instanceof Date),
      );
  });
}

function mergeConversations(saved: Conversation[], current: Conversation[]): Conversation[] {
  const merged = new Map(saved.map((conversation) => [conversation.id, conversation]));
  for (const conversation of current) merged.set(conversation.id, conversation);
  return [...merged.values()].sort((first, second) =>
    new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
  );
}

function restoreConversationDates(conversation: Conversation): Conversation {
  const settings = normalizeChatSettings(conversation.settings);
  return {
    ...conversation,
    updatedAt: new Date(conversation.updatedAt),
    settings,
    messages: conversation.messages
      .map((message) => ({ ...message, createdAt: new Date(message.createdAt), reactions: normalizeReactions(message.reactions ?? {}), readBy: message.readBy ?? [] })),
  };
}

function normalizeReactions(reactions: Record<string, number[]>) {
  const seen = new Set<number>();
  return Object.fromEntries(Object.entries(reactions).map(([emoji, accountIds]) => {
    const unique = accountIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return [emoji, unique];
  }).filter(([, accountIds]) => accountIds.length));
}

export function normalizeChatSettings(settings?: Partial<ChatSettings>): ChatSettings {
  return {
    theme: settings?.theme === 'light' ? 'light' : 'dark',
    nicknames: settings?.nicknames ?? {},
    reactionEmoji: settings?.reactionEmoji ?? '❤️',
    pinnedFor: settings?.pinnedFor ?? [],
    acceptedFor: settings?.acceptedFor ?? [],
    archivedFor: settings?.archivedFor ?? [],
    unreadFor: settings?.unreadFor ?? [],
    mutedFor: settings?.mutedFor ?? [],
    restrictedFor: settings?.restrictedFor ?? [],
    blockedFor: settings?.blockedFor ?? [],
    reportedFor: settings?.reportedFor ?? [],
  };
}
