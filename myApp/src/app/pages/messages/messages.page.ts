import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonSearchbar, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import 'emoji-picker-element';
import { addCircle, arrowRedoOutline, arrowUndoOutline, arrowUpOutline, chatbubbleOutline, checkmarkOutline, chevronBackOutline, closeOutline, createOutline, documentOutline, ellipsisHorizontal, filterOutline, happyOutline, heartOutline, homeOutline, imageOutline, micOutline, notificationsOffOutline, notificationsOutline, paperPlaneOutline, pauseOutline, peopleOutline, personCircleOutline, pinOutline, playOutline, searchOutline, stopCircleOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { Account, AccountService } from '../../services/account.service';
import { ChatAttachment, ChatMessage, Conversation, MessageService, SharedItemsType } from '../../services/message.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './messages.page.html',
  styleUrls: ['./messages.page.scss'],
  imports: [FormsModule, RouterLink, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonSearchbar, IonToolbar],
})
export class MessagesPage {
  readonly viewState = inject(ViewStateService);
  private readonly viewStateKey = 'tali-view-messages';
  private readonly accountService = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  readonly messageService = inject(MessageService);
  readonly notificationService = inject(NotificationService);
  readonly selectedAccount = this.accountService.selectedAccount;
  readonly accounts = computed(() => {
    const accounts = this.accountService.accounts();
    const selected = this.selectedAccount();
    if (!selected || accounts.some((account) => account.id !== selected.id)) return accounts;
    return [...accounts, ...sampleChatAccounts];
  });
  readonly conversations = this.messageService.conversations;
  get unreadNotifications() {
    const accountId = this.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }
  readonly otherAccounts = computed(() => {
    const selected = this.selectedAccount();
    return selected ? this.accounts().filter((account) => account.id !== selected.id) : [];
  });

  activeTab: 'inbox' | 'requests' = 'inbox';
  activeFilter = 'All';
  showFilters = false;
  composeMode: 'menu' | 'direct' | 'group' | null = null;
  activeConversationId: string | null = null;
  searchQuery = '';
  conversationSearch = '';
  showChatSettings = false;
  showSharedItems = false;
  sharedItemsType: SharedItemsType = 'photos';
  nicknameDraft = '';
  callNotice = '';
  settingsNotice = '';
  showBlockConfirmation = false;
  pendingBlockConversationId: string | null = null;
  groupName = '';
  groupMemberSearch = '';
  selectedMemberIds: number[] = [];
  messageDraft = '';
  isComposerExpanded = false;
  pendingAttachments: ChatAttachment[] = [];
  recordingVoice = false;
  voiceRecordingPaused = false;
  voiceDuration = 0;
  voicePlayingUrl: string | null = null;
  readonly voiceWaveBars = Array.from({ length: 34 }, (_, index) => index);
  reactionPickerMessageId: string | null = null;
  messageActionsId: string | null = null;
  replyToMessage: ChatMessage | null = null;
  forwardMessage: ChatMessage | null = null;
  forwardSearch = '';
  showComposerEmojiPicker = false;
  openConversationMenuId: string | null = null;
  private reactionPressTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceRecorder: MediaRecorder | null = null;
  private voiceTimerInterval: ReturnType<typeof setInterval> | null = null;
  private sendVoiceAfterStop = false;
  private discardVoiceRecording = false;
  private voiceRecordingStartedAt = 0;
  readonly filters = ['All', 'Unread', 'Unanswered', 'Archived', 'Restricted', 'Blocked'];

  get visibleConversations() {
    const accountId = this.selectedAccount()?.id;
    const query = this.searchQuery.trim().toLowerCase();
    return this.conversations()
      .filter((conversation) => accountId !== undefined && conversation.memberIds.includes(accountId))
      .filter((conversation) => {
        if (accountId === undefined) return false;
        const settings = this.messageService.settingsFor(conversation.id);
        if (this.activeFilter === 'Restricted') return settings.restrictedFor.includes(accountId);
        if (this.activeFilter === 'Blocked') return settings.blockedFor.includes(accountId);
        const isRequest = this.isConversationRequest(conversation, accountId);
        if ((this.activeTab === 'requests') !== isRequest) return false;
        if (this.activeFilter === 'Archived') return settings.archivedFor.includes(accountId);
        if (settings.archivedFor.includes(accountId) || settings.restrictedFor.includes(accountId)) return false;
        if (this.activeFilter === 'Unread') return this.unreadMessageCount(conversation) > 0;
        if (this.activeFilter === 'Unanswered') {
          const latestMessage = conversation.messages.at(-1);
          return !!latestMessage && latestMessage.senderId !== accountId;
        }
        return true;
      })
      .filter((conversation) => this.conversationTitle(conversation).toLowerCase().includes(query) || conversation.messages.some((message) => message.body.toLowerCase().includes(query)))
      .sort((a, b) => Number(this.messageService.settingsFor(b.id).pinnedFor.includes(accountId ?? -1)) - Number(this.messageService.settingsFor(a.id).pinnedFor.includes(accountId ?? -1)) || b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  private isConversationRequest(conversation: Conversation, accountId: number) {
    if (conversation.groupName) return false;
    const otherId = conversation.memberIds.find((id) => id !== accountId);
    const otherAccount = this.accounts().find((account) => account.id === otherId);
    if (!otherId || otherAccount?.followingIds.includes(accountId)) return false;
    const acceptedFor = this.messageService.settingsFor(conversation.id).acceptedFor;
    if (acceptedFor.includes(accountId) || acceptedFor.includes(otherId)) return false;

    const firstMessage = conversation.messages[0];
    if (!firstMessage) return false;
    // Keep it pending until the recipient accepts or replies. If this account
    // started the chat, a reply from the other account accepts that request.
    return firstMessage.senderId === accountId
      ? !conversation.messages.slice(1).some((message) => message.senderId === otherId)
      : !conversation.messages.some((message) => message.senderId === accountId);
  }

  acceptConversationRequest(conversationId: string) {
    const accountId = this.selectedAccount()?.id;
    if (accountId === undefined) return;
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (!conversation) return;
    const acceptedFor = this.messageService.settingsFor(conversationId).acceptedFor;
    if (!acceptedFor.includes(accountId)) {
      this.messageService.updateSettings(conversationId, { acceptedFor: [...acceptedFor, accountId] });
    }
  }

  deleteActiveConversationRequest() {
    const conversation = this.activeConversation;
    if (!conversation || !this.isActiveConversationRequest) return;
    this.messageService.deleteConversation(conversation.id);
    this.activeConversationId = null;
    this.saveViewState();
  }

  get activeConversation() {
    return this.conversations().find((conversation) => conversation.id === this.activeConversationId) ?? null;
  }

  get activeChatAccount(): Account | null {
    const conversation = this.activeConversation;
    if (!conversation || conversation.groupName) return null;
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    return this.accounts().find((account) => account.id === otherId) ?? null;
  }

  get pendingBlockAccount(): Account | null {
    const conversation = this.conversations().find((item) => item.id === this.pendingBlockConversationId);
    const otherId = conversation?.memberIds.find((id) => id !== this.selectedAccount()?.id);
    return this.accounts().find((account) => account.id === otherId) ?? null;
  }

  get activeChatSettings() {
    return this.activeConversation ? this.messageService.settingsFor(this.activeConversation.id) : null;
  }

  get isActiveConversationRequest() {
    const conversation = this.activeConversation;
    const accountId = this.selectedAccount()?.id;
    return !!conversation && accountId !== undefined && conversation.messages[0]?.senderId !== accountId
      && this.isConversationRequest(conversation, accountId);
  }

  get mutualConnectionCount() {
    const current = this.selectedAccount();
    const other = this.activeChatAccount;
    if (!current || !other) return 0;
    const otherFollowing = new Set(other.followingIds);
    return current.followingIds.filter((id) => id !== current.id && id !== other.id && otherFollowing.has(id)).length;
  }

  get visibleMessages() {
    const messages = this.activeConversation?.messages ?? [];
    const query = this.conversationSearch.trim().toLowerCase();
    return query ? messages.filter((message) => message.body.toLowerCase().includes(query)) : messages;
  }

  get forwardAccounts() {
    const query = this.forwardSearch.trim().toLowerCase();
    return this.otherAccounts().filter((account) => !query || account.name.toLowerCase().includes(query) || account.username.toLowerCase().includes(query));
  }

  get forwardConversations() {
    const query = this.forwardSearch.trim().toLowerCase();
    return this.conversations().filter((item) => item.id !== this.activeConversationId && item.memberIds.includes(this.selectedAccount()?.id ?? -1))
      .filter((item) => !query || this.conversationTitle(item).toLowerCase().includes(query));
  }

  constructor() {
    addIcons({ addCircle, arrowRedoOutline, arrowUndoOutline, arrowUpOutline, chatbubbleOutline, checkmarkOutline, chevronBackOutline, closeOutline, createOutline, documentOutline, ellipsisHorizontal, filterOutline, happyOutline, heartOutline, homeOutline, imageOutline, micOutline, notificationsOffOutline, notificationsOutline, paperPlaneOutline, pauseOutline, peopleOutline, personCircleOutline, pinOutline, playOutline, searchOutline, stopCircleOutline, trashOutline, videocamOutline });
    const saved = this.viewState.read<Partial<{ activeTab: 'inbox' | 'requests'; activeFilter: string; searchQuery: string; activeConversationId: string | null; messageDraft: string; conversationSearch: string; showChatSettings: boolean; showSharedItems: boolean; sharedItemsType: SharedItemsType; showFilters: boolean; composeMode: 'menu' | 'direct' | 'group' | null; groupName: string; selectedMemberIds: number[] }>>(this.viewStateKey, {});
    if (saved.activeTab) this.activeTab = saved.activeTab;
    if (saved.activeFilter && this.filters.includes(saved.activeFilter)) this.activeFilter = saved.activeFilter;
    this.searchQuery = saved.searchQuery ?? '';
    this.activeConversationId = saved.activeConversationId ?? null;
    this.messageDraft = saved.messageDraft ?? '';
    this.conversationSearch = saved.conversationSearch ?? '';
    this.showChatSettings = saved.showChatSettings ?? false;
    this.showSharedItems = saved.showSharedItems ?? false;
    this.sharedItemsType = saved.sharedItemsType ?? 'photos';
    this.showFilters = saved.showFilters ?? false;
    this.composeMode = saved.composeMode ?? null;
    this.groupName = saved.groupName ?? '';
    this.selectedMemberIds = saved.selectedMemberIds ?? [];
    this.route.queryParamMap.subscribe((params) => {
      const conversationId = params.get('conversationId');
      const conversation = conversationId && this.conversations().find((item) => item.id === conversationId);
      if (!conversation || !conversation.memberIds.includes(this.selectedAccount()?.id ?? -1)) return;
      this.activeConversationId = conversation.id;
      this.activeTab = this.isConversationRequest(conversation, this.selectedAccount()?.id ?? -1) ? 'requests' : 'inbox';
      this.composeMode = null;
      this.saveViewState();
    });
  }

  saveViewState() {
    this.viewState.write(this.viewStateKey, {
      activeTab: this.activeTab, activeFilter: this.activeFilter, searchQuery: this.searchQuery,
      activeConversationId: this.activeConversationId, messageDraft: this.messageDraft,
      conversationSearch: this.conversationSearch, showChatSettings: this.showChatSettings,
      showSharedItems: this.showSharedItems, sharedItemsType: this.sharedItemsType,
      showFilters: this.showFilters, composeMode: this.composeMode, groupName: this.groupName,
      selectedMemberIds: this.selectedMemberIds,
    });
  }

  setMessageSearch(value: string) { this.searchQuery = value; this.saveViewState(); }
  setConversationSearch(value: string) { this.conversationSearch = value; this.saveViewState(); }
  setActiveTab(value: 'inbox' | 'requests') { this.activeTab = value; this.saveViewState(); }
  selectFilter(value: string) { this.activeFilter = value; this.showFilters = false; this.saveViewState(); }

  openComposeMenu() {
    this.composeMode = 'menu';
    this.saveViewState();
  }

  closeCompose() {
    this.composeMode = null;
    this.selectedMemberIds = [];
    this.groupName = '';
    this.groupMemberSearch = '';
    this.saveViewState();
  }

  startDirectMessage(accountId: number) {
    const account = this.selectedAccount();
    if (!account || account.id === accountId || !this.accounts().some((item) => item.id === accountId)) return;
    const conversation = this.messageService.openDirectConversation(account.id, accountId);
    this.closeCompose();
    this.activeConversationId = conversation.id;
    this.saveViewState();
  }

  toggleGroupMember(accountId: number) {
    this.selectedMemberIds = this.selectedMemberIds.includes(accountId)
      ? this.selectedMemberIds.filter((id) => id !== accountId)
      : [...this.selectedMemberIds, accountId];
    this.saveViewState();
  }

  get groupMemberOptions() {
    const query = this.groupMemberSearch.trim().toLowerCase();
    return this.otherAccounts().filter((account) => !query || account.name.toLowerCase().includes(query) || account.username.toLowerCase().includes(query));
  }

  accountById(accountId: number) {
    return this.accounts().find((account) => account.id === accountId) ?? null;
  }

  setComposeMode(mode: 'menu' | 'direct' | 'group') {
    this.composeMode = mode;
    this.saveViewState();
  }

  setGroupName(value: string) {
    this.groupName = value;
    this.saveViewState();
  }

  setSharedItemsType(value: SharedItemsType) {
    this.sharedItemsType = value;
    this.saveViewState();
  }

  createGroup() {
    const account = this.selectedAccount();
    const validMembers = this.selectedMemberIds.filter((id) => this.accounts().some((item) => item.id === id));
    if (!account || !this.groupName.trim() || validMembers.length < 1) return;
    const conversation = this.messageService.createGroupConversation([account.id, ...validMembers], this.groupName);
    if (!conversation) return;
    this.closeCompose();
    this.activeConversationId = conversation.id;
    this.activeTab = 'inbox';
    this.saveViewState();
  }

  conversationTitle(conversation: Conversation) {
    if (conversation.groupName) return conversation.groupName;
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    const otherAccount = this.accounts().find((account) => account.id === otherId);
    const nickname = this.messageService.settingsFor(conversation.id).nicknames[String(otherId)];
    return nickname?.trim() || otherAccount?.name || otherAccount?.username || 'Account unavailable';
  }

  conversationProfileImage(conversation: Conversation) {
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    const account = this.accounts().find((item) => item.id === otherId);
    return account && this.accountService.canViewProfileImage(account, this.selectedAccount()) ? account.profileImage ?? null : null;
  }

  canViewProfileImage(account: Account) {
    return this.accountService.canViewProfileImage(account, this.selectedAccount());
  }

  messageAuthor(message: ChatMessage) {
    return this.accounts().find((account) => account.id === message.senderId);
  }

  messageAuthorImage(message: ChatMessage) {
    const author = this.messageAuthor(message);
    return author && this.accountService.canViewProfileImage(author, this.selectedAccount()) ? author.profileImage : undefined;
  }

  messageAuthorName(message: ChatMessage) {
    return this.messageAuthor(message)?.name ?? 'Former account';
  }

  accountName(accountId: number) {
    return this.accounts().find((account) => account.id === accountId)?.name;
  }

  messageWasReadByOther(message: ChatMessage) {
    const accountId = this.selectedAccount()?.id;
    return accountId !== undefined && (message.seenBy ?? message.readBy ?? []).some((readerId) => readerId !== accountId);
  }

  conversationIsUnread(conversation: Conversation) {
    return this.unreadMessageCount(conversation) > 0;
  }

  unreadMessageCount(conversation: Conversation) {
    const accountId = this.selectedAccount()?.id;
    if (accountId === undefined) return 0;
    const unreadCount = conversation.messages.filter((message) =>
      message.senderId !== accountId && !(message.readBy ?? []).includes(accountId),
    ).length;
    return Math.max(unreadCount, this.messageService.settingsFor(conversation.id).unreadFor.includes(accountId) ? 1 : 0);
  }

  conversationPreview(conversation: Conversation) {
    const latestMessage = conversation.messages.at(-1);
    if (!latestMessage) return 'Start a conversation';
    if (latestMessage.body) return latestMessage.body;
    const attachment = latestMessage.attachments?.[0];
    if (!attachment) return 'Message';
    return attachment.kind === 'voice' ? 'Voice message' : attachment.kind === 'gif' ? 'GIF' : attachment.kind === 'video' ? 'Video' : attachment.kind === 'file' ? 'File' : 'Photo';
  }

  openConversation(conversationId: string) {
    this.openConversationMenuId = null;
    this.activeConversationId = conversationId;
    this.conversationSearch = '';
    this.reactionPickerMessageId = null;
    this.saveViewState();
    const accountId = this.selectedAccount()?.id;
    if (accountId !== undefined) this.messageService.markRead(conversationId, accountId);
  }

  toggleConversationMenu(id: string, event: Event) {
    event.stopPropagation();
    this.openConversationMenuId = this.openConversationMenuId === id ? null : id;
  }

  conversationAction(conversation: Conversation, action: 'unreadFor' | 'pinnedFor' | 'mutedFor' | 'archivedFor' | 'restrictedFor' | 'blockedFor' | 'delete') {
    const accountId = this.selectedAccount()?.id;
    if (accountId === undefined) return;
    if (action === 'delete') {
      this.messageService.deleteConversation(conversation.id);
    } else if (action === 'blockedFor') {
      const blocked = this.messageService.settingsFor(conversation.id).blockedFor.includes(accountId);
      if (blocked) this.messageService.toggleAccountPreference(conversation.id, 'blockedFor', accountId);
      else this.requestBlock(conversation);
    } else if (action === 'unreadFor' && this.unreadMessageCount(conversation) > 0) {
      this.messageService.markRead(conversation.id, accountId);
      const settings = this.messageService.settingsFor(conversation.id);
      if (settings.unreadFor.includes(accountId)) this.messageService.toggleAccountPreference(conversation.id, 'unreadFor', accountId);
    } else {
      this.messageService.toggleAccountPreference(conversation.id, action, accountId);
    }
    this.openConversationMenuId = null;
  }

  otherIsMuted(conversation: Conversation) {
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    return otherId !== undefined && this.messageService.settingsFor(conversation.id).mutedFor.includes(otherId);
  }

  unblockActiveChat() { this.toggleChatPreference('blockedFor'); }

  requestBlock(conversation = this.activeConversation) {
    if (!conversation) return;
    this.pendingBlockConversationId = conversation.id;
    const accountId = this.selectedAccount()?.id;
    if (accountId !== undefined && this.messageService.settingsFor(conversation.id).blockedFor.includes(accountId)) {
      this.messageService.toggleAccountPreference(conversation.id, 'blockedFor', accountId);
      this.pendingBlockConversationId = null;
      return;
    }
    this.showBlockConfirmation = true;
  }

  confirmBlock(andReport = false) {
    const conversation = this.conversations().find((item) => item.id === this.pendingBlockConversationId);
    const accountId = this.selectedAccount()?.id;
    if (!conversation || accountId === undefined) return;
    this.messageService.toggleAccountPreference(conversation.id, 'blockedFor', accountId);
    if (andReport && !this.messageService.settingsFor(conversation.id).reportedFor.includes(accountId)) {
      this.messageService.toggleAccountPreference(conversation.id, 'reportedFor', accountId);
    }
    this.showBlockConfirmation = false;
    this.pendingBlockConversationId = null;
    this.showChatSettings = false;
    this.settingsNotice = andReport ? 'This person was blocked and reported.' : '';
  }

  closeConversation() {
    this.clearTyping();
    this.activeConversationId = null;
    this.messageDraft = '';
    this.showChatSettings = false;
    this.showSharedItems = false;
    this.saveViewState();
  }

  openChatSettings() {
    const conversation = this.activeConversation;
    if (!conversation) return;
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    this.nicknameDraft = this.messageService.settingsFor(conversation.id).nicknames[String(otherId)] ?? '';
    this.settingsNotice = '';
    this.showSharedItems = false;
    this.showChatSettings = true;
    this.saveViewState();
  }

  updateChatSetting(changes: Parameters<MessageService['updateSettings']>[1]) {
    const conversation = this.activeConversation;
    if (conversation) this.messageService.updateSettings(conversation.id, changes);
  }

  toggleChatPreference(preference: 'pinnedFor' | 'archivedFor' | 'unreadFor' | 'mutedFor' | 'restrictedFor' | 'blockedFor' | 'reportedFor') {
    const conversation = this.activeConversation;
    const accountId = this.selectedAccount()?.id;
    if (conversation && accountId !== undefined) this.messageService.toggleAccountPreference(conversation.id, preference, accountId);
  }

  reportConversation() {
    const conversation = this.activeConversation;
    const accountId = this.selectedAccount()?.id;
    if (!conversation || accountId === undefined) return;
    if (!this.messageService.settingsFor(conversation.id).reportedFor.includes(accountId)) {
      this.messageService.toggleAccountPreference(conversation.id, 'reportedFor', accountId);
    }
    this.settingsNotice = 'Report submitted for review.';
    this.callNotice = 'Report submitted for review.';
  }

  saveNickname() {
    const conversation = this.activeConversation;
    const otherId = conversation?.memberIds.find((id) => id !== this.selectedAccount()?.id);
    if (!conversation || otherId === undefined) return;
    const settings = this.messageService.settingsFor(conversation.id);
    const nicknames = { ...settings.nicknames };
    if (this.nicknameDraft.trim()) nicknames[String(otherId)] = this.nicknameDraft.trim();
    else delete nicknames[String(otherId)];
    this.updateChatSetting({ nicknames });
    this.settingsNotice = 'Nickname saved.';
  }

  sharedLinks() {
    const links: { messageId: string; url: string }[] = [];
    for (const message of this.activeConversation?.messages ?? []) {
      for (const match of message.body.matchAll(/https?:\/\/[^\s]+/gi)) links.push({ messageId: message.id, url: match[0] });
    }
    return links;
  }

  sharedAttachments(type: SharedItemsType) {
    const allowedKinds: ChatAttachment['kind'][] = type === 'photos'
      ? ['photo', 'video', 'gif']
      : type === 'voice messages' ? ['voice'] : ['file'];
    return (this.activeConversation?.messages ?? []).flatMap((message) =>
      (message.attachments ?? [])
        .filter((attachment) => allowedKinds.includes(attachment.kind))
        .map((attachment) => ({ messageId: message.id, attachment })),
    );
  }

  openSearchResult(messageId: string) {
    this.showChatSettings = false;
    this.saveViewState();
    requestAnimationFrame(() => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  isPreferenceEnabled(preference: 'pinnedFor' | 'archivedFor' | 'unreadFor' | 'mutedFor' | 'restrictedFor' | 'blockedFor') {
    const accountId = this.selectedAccount()?.id;
    return accountId !== undefined && (this.activeChatSettings?.[preference].includes(accountId) ?? false);
  }

  chooseMessageReaction(message: ChatMessage, emoji: string) {
    const conversation = this.activeConversation;
    const accountId = this.selectedAccount()?.id;
    if (conversation && accountId !== undefined) this.messageService.toggleReaction(conversation.id, message.id, accountId, emoji);
    this.reactionPickerMessageId = null;
  }

  startReactionPress(message: ChatMessage) {
    this.clearReactionPress();
    this.reactionPressTimer = setTimeout(() => {
      this.reactionPickerMessageId = message.id;
      this.reactionPressTimer = null;
    }, 450);
  }

  clearReactionPress() {
    if (this.reactionPressTimer !== null) clearTimeout(this.reactionPressTimer);
    this.reactionPressTimer = null;
  }

  get typingNames() {
    const conversation = this.activeConversation;
    const currentId = this.selectedAccount()?.id;
    if (!conversation || currentId === undefined) return [];
    return this.messageService.typingAccounts(conversation.id)
      .filter((id) => id !== currentId && conversation.memberIds.includes(id))
      .map((id) => this.accounts().find((account) => account.id === id)?.name ?? 'Someone');
  }

  updateDraftTyping(value: string) {
    this.messageDraft = value;
    const accountId = this.selectedAccount()?.id;
    const conversation = this.activeConversation;
    if (accountId !== undefined && conversation) this.messageService.setTyping(conversation.id, accountId, !!value.trim());
    this.saveViewState();
  }

  get mentionQuery() {
    return this.messageDraft.match(/@([\w.]*)$/)?.[1] ?? null;
  }

  get mentionSuggestions() {
    const query = this.mentionQuery?.toLowerCase() ?? '';
    const accountId = this.selectedAccount()?.id;
    const memberIds = this.activeConversation?.memberIds ?? [];
    return memberIds.map((id) => this.accounts().find((account) => account.id === id))
      .filter((account): account is Account => !!account && account.id !== accountId)
      .filter((account) => account.username.toLowerCase().replace(/^@/, '').includes(query) || account.name.toLowerCase().includes(query))
      .slice(0, 6);
  }

  get canMentionEveryone() {
    return (this.activeConversation?.memberIds.length ?? 0) > 2;
  }

  insertMention(username: string) {
    const mention = username === '@everyone' || username.startsWith('@') ? username : `@${username}`;
    this.messageDraft = this.messageDraft.replace(/@[\w.]*$/, `${mention} `);
    this.updateDraftTyping(this.messageDraft);
  }

  messageAction(message: ChatMessage, action: 'reply' | 'forward' | 'delete' | 'pin' | 'report') {
    const conversation = this.activeConversation;
    if (!conversation) return;
    this.messageActionsId = null;
    if (action === 'delete') {
      this.messageService.deleteMessage(conversation.id, message.id);
    } else if (action === 'reply') {
      this.replyToMessage = message;
    } else if (action === 'forward') {
      this.forwardMessage = message;
      this.forwardSearch = '';
    } else if (action === 'pin' || action === 'report') {
      const accountId = this.selectedAccount()?.id;
      if (accountId === undefined) return;
      const flag = action === 'pin' ? 'pinnedFor' : 'reportedFor';
      this.messageService.toggleMessageFlag(conversation.id, message.id, accountId, flag);
      this.callNotice = action === 'pin'
        ? (message.pinnedFor ?? []).includes(accountId) ? 'You unpinned a message.' : 'You pinned a message.'
        : 'Message reported.';
    }
  }

  closeForward() { this.forwardMessage = null; this.forwardSearch = ''; }

  forwardToAccount(accountId: number) {
    const account = this.selectedAccount();
    const message = this.forwardMessage;
    if (!account || !message) return;
    const conversation = this.messageService.openDirectConversation(account.id, accountId);
    this.messageService.sendMessage(conversation.id, account.id, message.body, message.attachments ?? [], { forwarded: true });
    this.closeForward();
    this.callNotice = 'Message forwarded.';
  }

  forwardToConversation(conversation: Conversation) {
    const account = this.selectedAccount();
    const message = this.forwardMessage;
    if (!account || !message) return;
    this.messageService.sendMessage(conversation.id, account.id, message.body, message.attachments ?? [], { forwarded: true });
    this.closeForward();
    this.callNotice = 'Message forwarded.';
  }

  mentionAccount(username: string) {
    const normalized = username.toLowerCase().replace(/^@/, '');
    return this.accounts().find((account) => account.username.toLowerCase().replace(/^@/, '') === normalized);
  }

  messageParts(body: string) {
    return body.split(/(@everyone|@[\w.]+)/g).filter(Boolean);
  }

  clearTyping() {
    const accountId = this.selectedAccount()?.id;
    const conversation = this.activeConversation;
    if (accountId !== undefined && conversation) this.messageService.setTyping(conversation.id, accountId, false);
  }

  onEmojiSelected(event: Event, message: ChatMessage) {
    const emoji = (event as CustomEvent<{ unicode: string }>).detail?.unicode;
    if (emoji) this.chooseMessageReaction(message, emoji);
  }

  onComposerEmojiSelected(event: Event) {
    const emoji = (event as CustomEvent<{ unicode: string }>).detail?.unicode;
    if (emoji) this.updateDraftTyping(this.messageDraft + emoji);
    this.showComposerEmojiPicker = false;
  }
  messageReactionList(message: ChatMessage) {
    return Object.entries(message.reactions ?? {})
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) => ({ emoji, count: users.length }));
  }

  startVideoCall() {
    this.callNotice = 'Video calls are not connected in this local app yet.';
  }

  attachSelectedFile(event: Event, kind: 'photo' | 'video' | 'gif' | 'file') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      this.callNotice = 'Choose a file smaller than 15 MB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.pendingAttachments = [...this.pendingAttachments, { kind, name: file.name, url: reader.result }];
        this.sendMessage();
      }
    };
    reader.onerror = () => this.callNotice = 'This file could not be loaded.';
    reader.readAsDataURL(file);
  }

  async toggleVoiceRecording() {
    if (this.recordingVoice && this.voiceRecorder) {
      this.voiceRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.callNotice = 'Voice recording is not supported by this browser.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      this.voiceRecorder = recorder;
      this.voiceDuration = 0;
      this.voiceRecordingStartedAt = Date.now();
      this.sendVoiceAfterStop = false;
      this.discardVoiceRecording = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (this.voiceTimerInterval !== null) clearInterval(this.voiceTimerInterval);
        this.voiceTimerInterval = null;
        this.recordingVoice = false;
        this.voiceRecordingPaused = false;
        this.voiceRecorder = null;
        const shouldSend = this.sendVoiceAfterStop;
        const shouldDiscard = this.discardVoiceRecording;
        const durationSeconds = this.voiceDuration;
        this.sendVoiceAfterStop = false;
        this.discardVoiceRecording = false;
        if (shouldDiscard) return;
        const recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (recording.size > 15 * 1024 * 1024) {
          this.callNotice = 'The voice message is larger than 15 MB.';
          return;
        }
        if (!recording.size) {
          this.callNotice = 'No audio was recorded. Try again.';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            this.pendingAttachments = [...this.pendingAttachments, { kind: 'voice', name: 'Voice message', url: reader.result, durationSeconds }];
            if (shouldSend) this.sendMessage();
          }
        };
        reader.readAsDataURL(recording);
      };
      recorder.start();
      this.recordingVoice = true;
      this.voiceTimerInterval = setInterval(() => {
        if (!this.voiceRecordingPaused) this.voiceDuration = Math.floor((Date.now() - this.voiceRecordingStartedAt) / 1000);
      }, 250);
      this.callNotice = '';
    } catch {
      this.callNotice = 'Microphone access was not granted.';
    }
  }

  pauseVoiceRecording() {
    if (!this.voiceRecorder) return;
    if (this.voiceRecordingPaused) {
      this.voiceRecorder.resume();
      this.voiceRecordingStartedAt = Date.now() - this.voiceDuration * 1000;
      this.voiceRecordingPaused = false;
    } else {
      this.voiceDuration = Math.floor((Date.now() - this.voiceRecordingStartedAt) / 1000);
      this.voiceRecorder.pause();
      this.voiceRecordingPaused = true;
    }
  }

  sendVoiceRecording() {
    if (!this.voiceRecorder || !this.recordingVoice) return;
    if (!this.voiceRecordingPaused) this.voiceDuration = Math.floor((Date.now() - this.voiceRecordingStartedAt) / 1000);
    this.sendVoiceAfterStop = true;
    this.voiceRecorder.stop();
  }

  cancelVoiceRecording() {
    if (!this.voiceRecorder || !this.recordingVoice) return;
    this.discardVoiceRecording = true;
    this.sendVoiceAfterStop = false;
    this.voiceRecorder.stop();
    this.callNotice = 'Voice recording discarded.';
  }

  formatVoiceDuration(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }

  voiceBarHeight(index: number) {
    return 18 + ((index * 29 + 17) % 72);
  }

  async toggleVoicePlayback(player: HTMLAudioElement) {
    if (player.paused) {
      try { await player.play(); } catch { this.callNotice = 'This voice message could not be played.'; }
    } else player.pause();
  }

  voicePlaybackPaused(url: string) {
    if (this.voicePlayingUrl === url) this.voicePlayingUrl = null;
  }

  sendMessage() {
    const account = this.selectedAccount();
    const conversation = this.activeConversation;
    if (!account || !conversation || this.isPreferenceEnabled('blockedFor')) return;
    const body = this.messageDraft.trim();
    if (!body && !this.pendingAttachments.length) return;
    const replyTo = this.replyToMessage ? {
      messageId: this.replyToMessage.id,
      senderId: this.replyToMessage.senderId,
      body: this.replyToMessage.body,
    } : undefined;
    this.messageService.sendMessage(conversation.id, account.id, body, this.pendingAttachments, replyTo ? { replyTo } : {});
    this.clearTyping();
    this.messageDraft = '';
    this.replyToMessage = null;
    this.saveViewState();
    this.pendingAttachments = [];
  }

  sendQuickReaction() {
    const conversation = this.activeConversation;
    const account = this.selectedAccount();
    if (!conversation || !account || this.isPreferenceEnabled('blockedFor')) return;
    this.messageService.sendMessage(conversation.id, account.id, '❤️');
  }
}

const sampleChatAccounts: Account[] = [
  { id: -1001, name: 'Mika Santos', username: '@mika.santos', contact: 'mika@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
  { id: -1002, name: 'Alex Rivera', username: '@alex.rivera', contact: 'alex@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
  { id: -1003, name: 'Sam Lee', username: '@sam.lee', contact: 'sam@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
];
