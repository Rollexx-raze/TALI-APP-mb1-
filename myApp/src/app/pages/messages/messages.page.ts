import { AfterViewChecked, Component, computed, CUSTOM_ELEMENTS_SCHEMA, ElementRef, inject, OnDestroy } from '@angular/core';
import { effect, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonSearchbar, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import 'emoji-picker-element';
import { addCircle, alertCircleOutline, archiveOutline, arrowRedoOutline, arrowUndoOutline, arrowUpOutline, cameraOutline, chatbubbleOutline, checkmarkOutline, chevronBackOutline, chevronDownOutline, closeOutline, copyOutline, createOutline, documentOutline, documentTextOutline, downloadOutline, ellipsisHorizontal, filterOutline, gridOutline, happyOutline, heartOutline, homeOutline, imageOutline, micOutline, notificationsOffOutline, notificationsOutline, paperPlaneOutline, pauseOutline, peopleOutline, personCircleOutline, pinOutline, playOutline, searchOutline, statsChartOutline, stopCircleOutline, trashOutline, videocamOutline } from 'ionicons/icons';
import { Account, AccountService } from '../../services/account.service';
import { GroupService } from '../../services/group.service';
import { ChatAttachment, ChatMessage, Community, Conversation, MessageService, SharedItemsType } from '../../services/message.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { VoiceRecordingService } from '../../services/voice-recording.service';
import { VoiceRecorderBarComponent } from '../../components/voice-recorder-bar/voice-recorder-bar.component';
import { VoiceMessageBubbleComponent } from '../../components/voice-message-bubble/voice-message-bubble.component';

@Component({
  selector: 'app-messages',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './messages.page.html',
  styleUrls: ['./messages.page.scss'],
  imports: [FormsModule, RouterLink, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonSearchbar, IonToolbar, VoiceRecorderBarComponent, VoiceMessageBubbleComponent],
})
export class MessagesPage implements AfterViewChecked, OnDestroy {
  readonly viewState = inject(ViewStateService);
  private readonly viewStateKey = 'tali-view-messages';
  private readonly accountService = inject(AccountService);
  private readonly groupService = inject(GroupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly messageService = inject(MessageService);
  readonly voiceService = inject(VoiceRecordingService);
  readonly notificationService = inject(NotificationService);
  readonly selectedAccount = this.accountService.selectedAccount;
  @ViewChild(IonContent) private chatContent?: IonContent;
  @ViewChild('chatFooter', { read: ElementRef }) private chatFooterRef?: ElementRef<HTMLElement>;
  @ViewChild('chatMessageInput') private chatMessageInput?: ElementRef<HTMLTextAreaElement>;
  chatFooterHeight = 128;
  private footerResizeObserver?: ResizeObserver;
  private observedFooter?: HTMLElement;
  private revealActionsTimer: ReturnType<typeof setTimeout> | null = null;
  highlightedReplyMessageId: string | null = null;
  private replyHighlightTimer: ReturnType<typeof setTimeout> | null = null;
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

  get groupCommunityEntryChats() {
    const entry = this.groupCommunityEntry;
    return entry ? this.messageService.communityChatsForGroup(entry.groupId) : [];
  }

  private async handleGroupCommunityEntry(groupId: string | null, action: string | null) {
    const requestId = ++this.groupEntryRequestId;
    if (!groupId || (action !== 'create' && action !== 'join')) {
      await this.clearGroupCommunityEntryQuery();
      return;
    }

    await Promise.all([
      this.groupService.groupsHydrated,
      this.messageService.communityDataHydrated,
      this.messageService.conversationDataHydrated,
    ]);
    if (requestId !== this.groupEntryRequestId) return;

    const group = this.groupService.getGroupById(groupId);
    const accountId = this.selectedAccount()?.id;
    if (!group || accountId === undefined || !group.memberIds.includes(accountId)) {
      await this.clearGroupCommunityEntryQuery();
      return;
    }

    const actualAction = this.messageService.communityChatsForGroup(group.id).length ? 'join' : 'create';
    this.groupCommunityEntry = { groupId: group.id, groupName: group.name, action: actualAction };
    this.groupCommunityChatNameDraft = '';
    this.groupCommunityEntryNotice = '';
    this.composeMode = null;
    this.activeConversationId = null;
    this.activeTab = 'inbox';
    this.saveViewState();
  }

  async closeGroupCommunityEntry() {
    this.groupCommunityEntry = null;
    this.groupCommunityChatNameDraft = '';
    this.groupCommunityEntryNotice = '';
    this.activeConversationId = null;
    this.activeTab = 'inbox';
    this.saveViewState();
    await this.clearGroupCommunityEntryQuery();
  }

  async createGroupCommunityChat() {
    const entry = this.groupCommunityEntry;
    const group = entry ? this.groupService.getGroupById(entry.groupId) : null;
    const account = this.selectedAccount();
    if (!entry || !group || !account || !group.memberIds.includes(account.id) || !this.groupCommunityChatNameDraft.trim()) return;
    if (this.messageService.communityChatsForGroup(group.id).length) {
      this.groupCommunityEntry = { ...entry, action: 'join' };
      return;
    }
    const conversation = await this.messageService.createGroupCommunityChat(
      group.id, group.name, this.groupCommunityChatNameDraft, account.id, group.memberIds,
    );
    if (!conversation) {
      this.groupCommunityEntryNotice = 'The Community Chat could not be saved. Please try again.';
      return;
    }
    await this.clearGroupCommunityEntryQuery();
    this.groupCommunityEntry = null;
    this.openConversation(conversation.id);
  }

  async joinGroupCommunityChat(conversationId: string) {
    const entry = this.groupCommunityEntry;
    const group = entry ? this.groupService.getGroupById(entry.groupId) : null;
    const account = this.selectedAccount();
    const conversation = this.groupCommunityEntryChats.find((chat) => chat.id === conversationId);
    if (!entry || !group || !account || !group.memberIds.includes(account.id) || !conversation) return;
    const community = await this.messageService.joinGroupCommunity(group.id, account.id);
    if (!community) {
      this.groupCommunityEntryNotice = 'Could not join these Community Chats. Please try again.';
      return;
    }
    await this.clearGroupCommunityEntryQuery();
    this.groupCommunityEntry = null;
    this.selectedCommunityId = community.id;
    this.activeTab = 'community';
    this.openCommunity(community);
    this.openConversation(conversation.id);
  }

  private async clearGroupCommunityEntryQuery() {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { from: null, groupId: null, action: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  retryLoadingMessages() {
    if (typeof window !== 'undefined') window.location.reload();
  }
  readonly otherAccounts = computed(() => {
    const selected = this.selectedAccount();
    return selected ? this.accounts().filter((account) => account.id !== selected.id) : [];
  });

  activeTab: 'inbox' | 'requests' | 'community' = 'inbox';
  activeFilter = 'All';
  showFilters = false;
  composeMode: 'menu' | 'direct' | 'group' | 'community' | 'community-chat' | 'join-community' | null = null;
  groupCommunityEntry: { groupId: string; groupName: string; action: 'create' | 'join' } | null = null;
  groupCommunityChatNameDraft = '';
  groupCommunityEntryNotice = '';
  private groupEntryRequestId = 0;
  composeSearch = '';
  selectedCommunityId: string | null = null;
  communityNameDraft = '';
  communityChatNameDraft = '';
  communityInviteDraft = '';
  communityNotice = '';
  activeConversationId: string | null = null;
  searchQuery = '';
  conversationSearch = '';
  showChatSettings = false;
  showGroupInfo = false;
  showSharedItems = false;
  showAllGroupMembers = false;
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
  private readonly allowedDocumentExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip']);
  pendingAttachments: ChatAttachment[] = [];
  isReadingPhotoAttachments = false;
  recordingVoice = false;
  voiceRecordingPaused = false;
  voiceDuration = 0;
  voicePlayingUrl: string | null = null;
  voicePlaybackProgress: Record<string, number> = {};
  readonly voiceWaveBars = Array.from({ length: 34 }, (_, index) => index);
  reactionPickerMessageId: string | null = null;
  reactionPickerExpanded = false;
  reactionPickerForMedia = false;
  reactionDetailMessageId: string | null = null;
  reactionDetailEmoji: string | null = null;
  messageActionsId: string | null = null;
  revealedMessageActionsId: string | null = null;
  messageActionsMenuPosition: { left: number; top: number } | null = null;
  pendingDeleteMessage: ChatMessage | null = null;
  imageLoadStates: Record<string, 'loading' | 'loaded' | 'error'> = {};
  activeImageViewer: { message: ChatMessage; attachments: ChatAttachment[]; index: number } | null = null;
  replyToMessage: ChatMessage | null = null;
  forwardMessage: ChatMessage | null = null;
  forwardSearch = '';
  forwardNote = '';
  showComposerEmojiPicker = false;
  composerEmojiSearch = '';
  composerEmojiCategory = 'Smileys';
  readonly composerEmojiGroups = [
    { name: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😍','🥰','😘','😗','😋','😎','🤩','🥳','😭','😢','😡','🤔','🤗','🙏','👏','👍','👎','❤️','🧡','💛','💚','💙','💜','✨','🔥','🎉','💯'] },
    { name: 'People', emojis: ['👋','🤚','✋','🖐️','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','💪','🫶','🙌','👐','🤝','🫡','💃','🕺','🧍','🧑‍🤝‍🧑','👶','🧑','👩','👨','🧓','👪'] },
    { name: 'Nature', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐸','🐵','🐔','🐧','🐦','🦋','🐢','🐬','🌸','🌻','🌈','☀️','🌙','⭐','🌍','🌿'] },
    { name: 'Food', emojis: ['🍎','🍊','🍋','🍉','🍇','🍓','🫐','🍒','🥑','🍕','🍔','🍟','🌮','🍜','🍣','🍰','🍩','🍪','☕','🧋','🥤','🍿'] },
    { name: 'Activities', emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🎮','🎯','🎨','🎤','🎧','🎸','🎹','🎬','🏆','🎁','🎈','🎊','🚗','✈️','🚀','💡'] },
  ];
  openConversationMenuId: string | null = null;
  isThreadAtBottom = true;
  isScrollButtonVisible = false;
  newMessagesWhileAway = 0;
  private scrollUpdateFrame: number | null = null;
  private readonly observedMessageCounts = new Map<string, number>();
  private readonly handledCommunityInvites = new Set<string>();
  private reactionPressTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaTapTimes = new Map<string, number>();
  private mediaTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMediaTap: { message: ChatMessage; attachment: ChatAttachment } | null = null;
  private voiceRecorder: MediaRecorder | null = null;
  private voiceTimerInterval: ReturnType<typeof setInterval> | null = null;
  private sendVoiceAfterStop = false;
  private discardVoiceRecording = false;
  private voiceRecordingStartedAt = 0;
  readonly filters = ['All', 'Unread', 'Unanswered', 'Archived', 'Restricted', 'Blocked'];

  get visibleConversations() {
    if (this.activeTab === 'community') return [];
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
        if (conversation.communityId) return false;
        if (this.activeTab === 'requests' ? !isRequest : this.activeTab === 'inbox' ? isRequest : true) return false;
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

  get visibleCommunities() {
    const accountId = this.selectedAccount()?.id;
    const query = this.searchQuery.trim().toLowerCase();
    return this.messageService.communities()
      .filter((community) => accountId !== undefined && community.memberIds.includes(accountId))
      .filter((community) => !query || community.name.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  get selectedCommunity() {
    const accountId = this.selectedAccount()?.id;
    return this.messageService.communities().find((community) =>
      community.id === this.selectedCommunityId && accountId !== undefined && community.memberIds.includes(accountId),
    ) ?? null;
  }

  get selectedCommunityChats() {
    const accountId = this.selectedAccount()?.id;
    const community = this.selectedCommunity;
    const communityId = community?.id;
    if (!community || accountId === undefined) return [];
    const query = this.searchQuery.trim().toLowerCase();
    return this.conversations()
      .filter((conversation) => conversation.communityId === communityId && conversation.memberIds.includes(accountId))
      .filter((conversation) => !query || this.conversationTitle(conversation).toLowerCase().includes(query) || conversation.messages.some((message) => message.body.toLowerCase().includes(query)))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  communityChatCount(communityId: string) {
    const accountId = this.selectedAccount()?.id;
    if (accountId === undefined || !this.messageService.communities().some((community) =>
      community.id === communityId && community.memberIds.includes(accountId),
    )) return 0;
    return this.conversations().filter((conversation) =>
      conversation.communityId === communityId && conversation.memberIds.includes(accountId),
    ).length;
  }

  private canAccessConversation(conversation: Conversation, accountId: number) {
    if (!conversation.memberIds.includes(accountId)) return false;
    if (!conversation.communityId) return true;
    return this.messageService.communities().some((community) =>
      community.id === conversation.communityId && community.memberIds.includes(accountId),
    );
  }

  private isConversationRequest(conversation: Conversation, accountId: number) {
    if (conversation.groupName) return false;
    const otherId = conversation.memberIds.find((id) => id !== accountId);
    const otherAccount = this.accounts().find((account) => account.id === otherId);
    if (!otherId || otherAccount?.followingIds.includes(accountId)) return false;
    const acceptedFor = this.messageService.settingsFor(conversation.id).acceptedFor;
    if (acceptedFor.includes(accountId) || acceptedFor.includes(otherId)) return false;

    const firstMessage = conversation.messages[0];
    // Requests belong only to the recipient. The sender keeps their outgoing
    // conversation in Inbox while it waits for the recipient to accept or reply.
    return !!firstMessage && firstMessage.senderId !== accountId
      && !conversation.messages.some((message) => message.senderId === accountId);
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
    const accountId = this.selectedAccount()?.id;
    return this.conversations().find((conversation) =>
      conversation.id === this.activeConversationId && accountId !== undefined && this.canAccessConversation(conversation, accountId),
    ) ?? null;
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

  get composeAccounts() {
    const query = this.composeSearch.trim().toLowerCase();
    return this.otherAccounts().filter((account) => !query || account.name.toLowerCase().includes(query) || account.username.toLowerCase().includes(query));
  }

  get forwardConversations() {
    const query = this.forwardSearch.trim().toLowerCase();
    return this.conversations().filter((item) => item.id !== this.activeConversationId && item.memberIds.includes(this.selectedAccount()?.id ?? -1))
      .filter((item) => !query || this.conversationTitle(item).toLowerCase().includes(query));
  }

  constructor() {
    addIcons({ addCircle, alertCircleOutline, archiveOutline, arrowRedoOutline, arrowUndoOutline, arrowUpOutline, cameraOutline, chatbubbleOutline, checkmarkOutline, chevronBackOutline, chevronDownOutline, closeOutline, copyOutline, createOutline, documentOutline, documentTextOutline, downloadOutline, ellipsisHorizontal, filterOutline, gridOutline, happyOutline, heartOutline, homeOutline, imageOutline, micOutline, notificationsOffOutline, notificationsOutline, paperPlaneOutline, pauseOutline, peopleOutline, personCircleOutline, pinOutline, playOutline, searchOutline, statsChartOutline, stopCircleOutline, trashOutline, videocamOutline });
    effect(() => {
      const conversations = this.conversations();
      const activeId = this.activeConversationId;
      const conversation = conversations.find((item) => item.id === activeId);
      if (!conversation || this.showChatSettings || this.showGroupInfo) return;
      const previousCount = this.observedMessageCounts.get(activeId!);
      this.observedMessageCounts.set(activeId!, conversation.messages.length);
      if (previousCount === undefined) {
        this.scrollToLatest();
        return;
      }
      if (conversation.messages.length <= previousCount) return;
      const newIncomingCount = conversation.messages.slice(previousCount)
        .filter((message) => message.senderId !== this.selectedAccount()?.id).length;
      if (this.isThreadAtBottom) this.scrollToLatest();
      else this.newMessagesWhileAway += newIncomingCount;
    });
    const saved = this.viewState.read<Partial<{ activeTab: 'inbox' | 'requests' | 'community'; activeFilter: string; searchQuery: string; conversationSearch: string; activeConversationId: string | null; messageDraft: string; showChatSettings: boolean; showGroupInfo: boolean; showSharedItems: boolean; sharedItemsType: SharedItemsType; showFilters: boolean; composeMode: 'menu' | 'direct' | 'group' | 'community' | 'community-chat' | 'join-community' | null; groupName: string; selectedMemberIds: number[]; selectedCommunityId: string | null }>>(this.viewStateKey, {});
    if (saved.activeTab) this.activeTab = saved.activeTab;
    if (saved.activeFilter && this.filters.includes(saved.activeFilter)) this.activeFilter = saved.activeFilter;
    this.searchQuery = saved.searchQuery ?? '';
    this.activeConversationId = saved.activeConversationId ?? null;
    this.messageDraft = saved.messageDraft ?? '';
    this.conversationSearch = saved.conversationSearch ?? '';
    this.showChatSettings = saved.showChatSettings ?? false;
    this.showGroupInfo = saved.showGroupInfo ?? false;
    this.showSharedItems = saved.showSharedItems ?? false;
    this.sharedItemsType = saved.sharedItemsType ?? 'photos';
    this.showFilters = saved.showFilters ?? false;
    this.composeMode = saved.composeMode ?? null;
    this.selectedCommunityId = saved.selectedCommunityId ?? null;
    this.groupName = saved.groupName ?? '';
    this.selectedMemberIds = saved.selectedMemberIds ?? [];
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('from') === 'group') {
        void this.handleGroupCommunityEntry(params.get('groupId'), params.get('action'));
      } else {
        this.groupEntryRequestId++;
        this.groupCommunityEntry = null;
      }
      const inviteCode = params.get('communityInvite');
      if (inviteCode && !this.handledCommunityInvites.has(inviteCode)) void this.handleCommunityInvite(inviteCode);
      const conversationId = params.get('conversationId');
      const conversation = conversationId && this.conversations().find((item) => item.id === conversationId);
      const accountId = this.selectedAccount()?.id;
      if (!conversation || accountId === undefined || !this.canAccessConversation(conversation, accountId)) return;
      this.activeConversationId = conversation.id;
      this.observedMessageCounts.set(conversation.id, conversation.messages.length);
      this.newMessagesWhileAway = 0;
      this.scrollToLatest();
      this.activeTab = conversation.communityId
        ? 'community'
        : this.isConversationRequest(conversation, this.selectedAccount()?.id ?? -1) ? 'requests' : 'inbox';
      if (conversation.communityId) this.selectedCommunityId = conversation.communityId;
      this.composeMode = null;
      this.saveViewState();
    });
  }

  saveViewState() {
    this.viewState.write(this.viewStateKey, {
      activeTab: this.activeTab, activeFilter: this.activeFilter, searchQuery: this.searchQuery,
      activeConversationId: this.activeConversationId, messageDraft: this.messageDraft,
      conversationSearch: this.conversationSearch, showChatSettings: this.showChatSettings, showGroupInfo: this.showGroupInfo,
      showSharedItems: this.showSharedItems, sharedItemsType: this.sharedItemsType,
      showFilters: this.showFilters, composeMode: this.composeMode, groupName: this.groupName,
      selectedMemberIds: this.selectedMemberIds, selectedCommunityId: this.selectedCommunityId,
    });
  }

  setMessageSearch(value: string) { this.searchQuery = value; this.saveViewState(); }
  setConversationSearch(value: string) { this.conversationSearch = value; this.saveViewState(); }
  setActiveTab(value: 'inbox' | 'requests' | 'community') { this.activeTab = value; this.saveViewState(); }
  selectFilter(value: string) { this.activeFilter = value; this.showFilters = false; this.saveViewState(); }

  openComposeMenu() {
    this.composeMode = 'menu';
    this.composeSearch = '';
    this.saveViewState();
  }

  closeCompose() {
    this.composeMode = null;
    this.composeSearch = '';
    this.selectedMemberIds = [];
    this.groupName = '';
    this.groupMemberSearch = '';
    this.communityNameDraft = '';
    this.communityChatNameDraft = '';
    this.communityInviteDraft = '';
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

  setComposeMode(mode: 'menu' | 'direct' | 'group' | 'community' | 'community-chat' | 'join-community') {
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
    if (this.forwardMessage) {
      this.messageService.sendMessage(conversation.id, account.id, this.forwardBody(), this.forwardMessage.attachments ?? [], { forwarded: true });
      this.closeForward();
      this.callNotice = 'Message forwarded to the new group.';
    }
    this.closeCompose();
    this.activeConversationId = conversation.id;
    this.activeTab = 'inbox';
    this.saveViewState();
  }

  openCommunity(community: Community) {
    if (!community.memberIds.includes(this.selectedAccount()?.id ?? -1)) return;
    this.selectedCommunityId = community.id;
    this.activeTab = 'community';
    this.communityNotice = '';
    this.saveViewState();
  }

  showCommunityList() {
    this.selectedCommunityId = null;
    this.communityNotice = '';
    this.saveViewState();
  }

  async createCommunity() {
    const account = this.selectedAccount();
    if (!account || !this.communityNameDraft.trim()) return;
    const community = await this.messageService.createCommunity(this.communityNameDraft, account.id);
    if (!community) {
      this.communityNotice = 'The community could not be saved. Please try again.';
      return;
    }
    this.communityNotice = '';
    this.closeCompose();
    this.openCommunity(community);
  }

  async createCommunityChat() {
    const community = this.selectedCommunity;
    if (!community || !this.communityChatNameDraft.trim()) return;
    const conversation = await this.messageService.createCommunityChat(community.id, this.communityChatNameDraft);
    if (!conversation) {
      this.communityNotice = 'The topic chat could not be saved. Please try again.';
      return;
    }
    this.communityNotice = '';
    this.closeCompose();
    this.openConversation(conversation.id);
  }

  async copyCommunityInvite(community: Community) {
    const inviteUrl = `${location.origin}${this.router.serializeUrl(this.router.createUrlTree(['/messages'], { queryParams: { communityInvite: community.inviteCode } }))}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      this.communityNotice = 'Invite link copied. In this local app, the community must be stored in the same browser profile to join.';
    } catch {
      this.communityNotice = 'Could not copy the invite link on this device.';
    }
  }

  async joinCommunity() {
    const account = this.selectedAccount();
    if (!account || !this.communityInviteDraft.trim()) return;
    const community = await this.messageService.joinCommunityByInvite(this.communityCodeFromInput(this.communityInviteDraft), account.id);
    if (!community) {
      this.communityNotice = 'Could not join. Check the invite link and try again.';
      return;
    }
    this.closeCompose();
    this.openCommunity(community);
  }

  private async handleCommunityInvite(inviteCode: string) {
    this.handledCommunityInvites.add(inviteCode);
    await this.messageService.communityDataHydrated;
    const account = this.selectedAccount();
    if (!account) {
      this.communityNotice = 'Select an account before joining this community.';
      return;
    }
    const community = await this.messageService.joinCommunityByInvite(inviteCode, account.id);
    this.activeTab = 'community';
    if (!community) {
      this.communityNotice = 'This community invite link is invalid or could not be saved.';
      this.selectedCommunityId = null;
      return;
    }
    this.openCommunity(community);
  }

  private communityCodeFromInput(value: string) {
    try {
      return new URL(value, location.origin).searchParams.get('communityInvite') ?? value.trim();
    } catch {
      return value.trim();
    }
  }

  conversationTitle(conversation: Conversation) {
    if (conversation.groupName) return conversation.groupName;
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    const otherAccount = this.accounts().find((account) => account.id === otherId);
    const nickname = this.messageService.settingsFor(conversation.id).nicknames[String(otherId)];
    return nickname?.trim() || otherAccount?.name || otherAccount?.username || 'Account unavailable';
  }

  groupMembers(conversation: Conversation, showAll = false) {
    const members = conversation.memberIds.map((id) => this.accounts().find((account) => account.id === id))
      .filter((account): account is Account => !!account);
    return showAll ? members : members.slice(0, 7);
  }

  presenceLabel(_account: Account) { return 'Last seen unavailable'; }

  formatMessageTime(date: Date) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  replyAuthorLabel(senderId: number) {
    if (senderId === this.selectedAccount()?.id) return 'yourself';
    const peer = this.activeChatAccount;
    if (peer?.id === senderId && this.activeConversation) return this.conversationTitle(this.activeConversation);
    return this.accountName(senderId) ?? 'Former account';
  }

  ngAfterViewChecked() {
    const footer = this.chatFooterRef?.nativeElement;
    if (footer !== this.observedFooter) {
      this.footerResizeObserver?.disconnect();
      this.observedFooter = footer;
      if (!footer) this.chatFooterHeight = 0;
      else {
        this.footerResizeObserver = new ResizeObserver(() => {
          this.chatFooterHeight = Math.ceil(footer.getBoundingClientRect().height);
        });
        this.footerResizeObserver.observe(footer);
      }
    }
  }

  ngOnDestroy() {
    this.footerResizeObserver?.disconnect();
    if (this.revealActionsTimer) clearTimeout(this.revealActionsTimer);
    if (this.replyHighlightTimer) clearTimeout(this.replyHighlightTimer);
    if (this.scrollUpdateFrame !== null) cancelAnimationFrame(this.scrollUpdateFrame);
  }

  scrollToLatest() {
    this.isThreadAtBottom = true;
    this.isScrollButtonVisible = false;
    this.newMessagesWhileAway = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { void this.chatContent?.scrollToBottom(300); }));
  }

  onThreadScroll(_event: Event) {
    if (!this.activeConversation || this.showChatSettings || this.showGroupInfo || this.scrollUpdateFrame !== null) return;
    this.scrollUpdateFrame = requestAnimationFrame(() => {
      this.scrollUpdateFrame = null;
      void this.chatContent?.getScrollElement().then((scrollElement) => {
        const distanceFromBottom = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop;
        const atBottom = distanceFromBottom <= 88;
        this.isThreadAtBottom = atBottom;
        this.isScrollButtonVisible = distanceFromBottom > 200;
        if (atBottom) this.newMessagesWhileAway = 0;
      });
    });
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

  messageAuthorInitials(message: ChatMessage) {
    return this.messageAuthorName(message)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  messageTimestampInBubble(message: ChatMessage) {
    return !!message.body && !this.hasPhotoAttachment(message)
      && !(message.attachments ?? []).some((attachment) => attachment.kind === 'voice');
  }

  accountName(accountId: number) {
    return this.accounts().find((account) => account.id === accountId)?.name;
  }

  messageWasReadByOther(message: ChatMessage) {
    const accountId = this.selectedAccount()?.id;
    return accountId !== undefined && (message.seenBy ?? message.readBy ?? []).some((readerId) => readerId !== accountId);
  }

  messageDeliveryStatus(message: ChatMessage): 'sending' | 'sent' | 'seen' | 'failed' {
    const localState = this.messageService.sendStates()[message.id];
    if (localState === 'sending' || localState === 'failed') return localState;
    if (message.senderId === this.selectedAccount()?.id && this.messageWasReadByOther(message)) return 'seen';
    return 'sent';
  }

  voiceDeliveryLabel(message: ChatMessage) {
    const status = this.messageDeliveryStatus(message);
    return status === 'sending' ? 'Sending…' : status === 'failed' ? 'Failed' : status === 'seen' ? 'Seen' : 'Delivered';
  }

  replyPreviewText(message: ChatMessage | { messageId: string; body: string }) {
    const target = this.replyTarget(message);
    const attachments = target?.attachments ?? [];
    const photos = attachments.filter((item) => item.kind === 'photo' || item.kind === 'gif');
    if (photos.length > 1) return `${photos.length} photos`;
    if (photos.length === 1) return 'Photo';
    const attachment = attachments[0];
    if (attachment?.kind === 'voice') return `Voice message ${this.formatVoiceDuration(attachment.durationSeconds ?? 0)}`;
    if (attachment?.kind === 'video') return 'Video';
    if (attachment?.kind === 'file') return attachment.name || 'File';
    return target?.body?.trim() || message.body?.trim() || 'Message';
  }

  private replyTarget(message: ChatMessage | { messageId: string; body: string }) {
    return 'messageId' in message
      ? this.activeConversation?.messages.find((item) => item.id === message.messageId)
      : message as ChatMessage;
  }

  replyPreviewAttachment(message: ChatMessage | { messageId: string; body: string } | string) {
    const target = typeof message === 'string'
      ? this.activeConversation?.messages.find((item) => item.id === message)
      : this.replyTarget(message);
    return target?.attachments?.find((item) => item.kind === 'photo' || item.kind === 'gif');
  }

  replyPreviewKind(message: ChatMessage) {
    if (message.attachments?.some((item) => item.kind === 'photo' || item.kind === 'gif')) return 'photo';
    return message.attachments?.[0]?.kind ?? 'text';
  }

  replyPreviewIcon(message: ChatMessage) {
    const kind = this.replyPreviewKind(message);
    return kind === 'voice' ? 'mic-outline' : kind === 'video' ? 'videocam-outline' : 'document-outline';
  }

  setReplyToMessage(message: ChatMessage) {
    this.replyToMessage = message;
    this.scrollToLatest();
  }

  clearReply() {
    this.replyToMessage = null;
    this.scrollToLatest();
  }

  navigateToReply(messageId: string) {
    const target = document.getElementById(`message-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.highlightedReplyMessageId = messageId;
    if (this.replyHighlightTimer) clearTimeout(this.replyHighlightTimer);
    this.replyHighlightTimer = setTimeout(() => {
      this.highlightedReplyMessageId = null;
      this.replyHighlightTimer = null;
    }, 1600);
  }

  quickReactionLabel() {
    const emoji = this.activeChatSettings?.reactionEmoji || '❤️';
    return emoji === '❤️' ? '♥' : emoji;
  }

  async retryMessage(message: ChatMessage) {
    const conversation = this.activeConversation;
    if (conversation) await this.messageService.retryMessage(conversation.id, message.id);
  }

  imageLoadState(url: string) { return this.imageLoadStates[url] ?? 'loading'; }

  hasPhotoAttachment(message: ChatMessage) {
    return (message.attachments ?? []).some((item) => item.kind === 'photo' || item.kind === 'gif');
  }

  photoAttachmentCount(message: ChatMessage) {
    return (message.attachments ?? []).filter((item) => item.kind === 'photo' || item.kind === 'gif').length;
  }

  photoAttachments(message: ChatMessage) {
    return (message.attachments ?? []).filter((item) => item.kind === 'photo' || item.kind === 'gif');
  }

  photoStackHeight(message: ChatMessage) {
    const count = this.photoAttachmentCount(message);
    return count > 1 ? 164 + (count - 1) * 82 : 0;
  }

  photoAttachmentIndex(message: ChatMessage, attachment: ChatAttachment) {
    if (attachment.kind !== 'photo' && attachment.kind !== 'gif') return -1;
    return (message.attachments ?? [])
      .filter((item) => item.kind === 'photo' || item.kind === 'gif')
      .findIndex((item) => item.url === attachment.url);
  }

  photoStackActionIndex(message: ChatMessage) {
    return Math.floor((this.photoAttachmentCount(message) - 1) / 2);
  }

  isFirstImageAttachment(message: ChatMessage, attachment: ChatAttachment) {
    return this.photoAttachmentIndex(message, attachment) === 0;
  }

  isLastImageAttachment(message: ChatMessage, attachment: ChatAttachment) {
    const photos = (message.attachments ?? []).filter((item) => item.kind === 'photo' || item.kind === 'gif');
    return photos.at(-1)?.url === attachment.url;
  }

  setImageLoadState(url: string, state: 'loaded' | 'error') {
    this.imageLoadStates = { ...this.imageLoadStates, [url]: state };
  }

  onChatImageLoad(url: string) {
    this.setImageLoadState(url, 'loaded');
    if (this.isThreadAtBottom) this.scrollToLatest();
  }

  get composerEmojiResults() {
    const query = this.composerEmojiSearch.trim().toLowerCase();
    const groups = query ? this.composerEmojiGroups : this.composerEmojiGroups.filter((group) => group.name === this.composerEmojiCategory);
    return groups.flatMap((group) => group.emojis.filter((emoji) => !query || group.name.toLowerCase().includes(query) || emoji.includes(query)));
  }

  toggleComposerEmojiPicker() {
    this.showComposerEmojiPicker = !this.showComposerEmojiPicker;
    if (this.showComposerEmojiPicker) this.composerEmojiSearch = '';
  }

  insertComposerEmoji(emoji: string) {
    const input = this.chatMessageInput?.nativeElement;
    const start = input?.selectionStart ?? this.messageDraft.length;
    const end = input?.selectionEnd ?? start;
    const next = this.messageDraft.slice(0, start) + emoji + this.messageDraft.slice(end);
    this.updateDraftTyping(next);
    this.showComposerEmojiPicker = false;
    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + emoji.length;
      input?.setSelectionRange(cursor, cursor);
    });
  }

  @HostListener('document:click', ['$event'])
  closeComposerEmojiOnOutsideClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.composer-emoji-picker, .composer-emoji-control')) {
      this.showComposerEmojiPicker = false;
    }
    if (!target.closest('.message-action-controls, .message-action-menu') && this.messageActionsId !== null) {
      this.messageActionsId = null;
      this.messageActionsMenuPosition = null;
    }
  }

  @HostListener('document:keydown.escape')
  closeComposerEmojiOnEscape() {
    this.showComposerEmojiPicker = false;
    this.messageActionsId = null;
    this.messageActionsMenuPosition = null;
  }

  fileAttachmentIcon(filename: string) {
    const extension = filename.split('.').at(-1)?.toLowerCase();
    if (extension === 'zip') return 'archive-outline';
    if (extension === 'xls' || extension === 'xlsx') return 'grid-outline';
    if (extension === 'ppt' || extension === 'pptx') return 'stats-chart-outline';
    if (extension === 'doc' || extension === 'docx' || extension === 'pdf' || extension === 'txt') return 'document-text-outline';
    return 'document-outline';
  }

  formatAttachmentSize(sizeBytes = 0) {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  retryInlineImage(url: string) {
    this.imageLoadStates = { ...this.imageLoadStates, [url]: 'loading' };
  }

  openImageViewer(message: ChatMessage, attachment: ChatAttachment) {
    const attachments = (message.attachments ?? []).filter((item) => item.kind === 'photo' || item.kind === 'gif');
    const index = attachments.findIndex((item) => item.url === attachment.url);
    this.activeImageViewer = { message, attachments, index: Math.max(0, index) };
  }

  navigateImageViewer(direction: -1 | 1) {
    const viewer = this.activeImageViewer;
    if (!viewer || viewer.attachments.length < 2) return;
    const index = (viewer.index + direction + viewer.attachments.length) % viewer.attachments.length;
    this.activeImageViewer = { ...viewer, index };
  }

  replyToViewedPhoto() {
    const viewer = this.activeImageViewer;
    if (!viewer) return;
    this.activeImageViewer = null;
    this.messageAction(viewer.message, 'reply');
  }

  shouldShowDateSeparator(index: number) {
    if (index === 0) return true;
    const messages = this.visibleMessages;
    return !this.sameCalendarDay(messages[index - 1].createdAt, messages[index].createdAt);
  }

  messageDateLabel(date: Date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (this.sameCalendarDay(date, today)) return 'Today';
    if (this.sameCalendarDay(date, yesterday)) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  private sameCalendarDay(first: Date, second: Date) {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
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
    const accountId = this.selectedAccount()?.id;
    const targetConversation = this.conversations().find((conversation) => conversation.id === conversationId);
    if (accountId === undefined || !targetConversation || !this.canAccessConversation(targetConversation, accountId)) return;
    this.openConversationMenuId = null;
    this.activeConversationId = conversationId;
    const openedConversation = targetConversation;
    this.observedMessageCounts.set(conversationId, openedConversation?.messages.length ?? 0);
    this.conversationSearch = '';
    this.reactionPickerMessageId = null;
    this.saveViewState();
    this.messageService.markRead(conversationId, accountId);
    this.scrollToLatest();
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
    this.showGroupInfo = false;
    this.settingsNotice = andReport ? 'This person was blocked and reported.' : '';
  }

  closeConversation() {
    this.clearTyping();
    this.activeConversationId = null;
    this.messageDraft = '';
    this.showChatSettings = false;
    this.showGroupInfo = false;
    this.showSharedItems = false;
    this.saveViewState();
  }

  closeChatSettings() {
    this.showChatSettings = false;
    this.showGroupInfo = false;
    this.saveViewState();
  }

  openGroupInfo() {
    if (!this.activeConversation?.groupName) return;
    this.showChatSettings = false;
    this.showGroupInfo = true;
    this.showAllGroupMembers = false;
    this.saveViewState();
  }

  openChatSettings() {
    const conversation = this.activeConversation;
    if (!conversation) return;
    const otherId = conversation.memberIds.find((id) => id !== this.selectedAccount()?.id);
    this.nicknameDraft = this.messageService.settingsFor(conversation.id).nicknames[String(otherId)] ?? '';
    this.settingsNotice = '';
    this.showSharedItems = false;
    this.showAllGroupMembers = false;
    this.showGroupInfo = false;
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
    this.showGroupInfo = false;
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
    this.reactionPickerExpanded = false;
    this.reactionPickerForMedia = false;
  }

  isMyReaction(message: ChatMessage, emoji: string) {
    const accountId = this.selectedAccount()?.id;
    return accountId !== undefined && (message.reactions?.[emoji] ?? []).includes(accountId);
  }

  get reactionDetailsMessage() {
    const messageId = this.reactionDetailMessageId;
    return messageId ? this.activeConversation?.messages.find((message) => message.id === messageId) ?? null : null;
  }

  get selectedReactionEmoji() {
    const selected = this.reactionDetailEmoji;
    const message = this.reactionDetailsMessage;
    if (!message) return null;
    return message.reactions && selected && selected in message.reactions ? selected : null;
  }

  selectedReactionAccounts(message: ChatMessage) {
    const emoji = this.selectedReactionEmoji;
    if (emoji) return this.reactionAccounts(message, emoji);
    const reactedIds = new Set(Object.values(message.reactions ?? {}).flat());
    return this.accounts().filter((account) => reactedIds.has(account.id));
  }

  reactionEmojisForAccount(message: ChatMessage, accountId: number) {
    return this.messageReactionList(message)
      .filter((reaction) => (message.reactions?.[reaction.emoji] ?? []).includes(accountId))
      .map((reaction) => reaction.emoji);
  }

  totalReactionCount(message: ChatMessage) {
    return this.messageReactionList(message).reduce((total, reaction) => total + reaction.count, 0);
  }

  onReactionChipClick(message: ChatMessage, emoji: string) {
    this.reactionDetailMessageId = message.id;
    this.reactionDetailEmoji = null;
  }

  removeReactionFromDetails(message: ChatMessage, accountId: number) {
    const emoji = this.selectedReactionEmoji ?? this.reactionEmojisForAccount(message, accountId)[0];
    const conversation = this.activeConversation;
    if (emoji && conversation) this.messageService.toggleReaction(conversation.id, message.id, accountId, emoji);
    if (!this.messageReactionList(message).length) this.closeReactionDetails();
  }

  closeReactionDetails() {
    this.reactionDetailMessageId = null;
    this.reactionDetailEmoji = null;
  }

  reactionAccounts(message: ChatMessage, emoji: string) {
    const reactedIds = message.reactions?.[emoji] ?? [];
    return this.accounts().filter((account) => reactedIds.includes(account.id));
  }

  startReactionPress(message: ChatMessage) {
    this.clearReactionPress();
    this.reactionPressTimer = setTimeout(() => {
      this.openMessageActions(message);
      this.reactionPressTimer = null;
    }, 450);
  }

  openMessageActions(message: ChatMessage, target?: EventTarget | null) {
    this.clearReactionPress();
    this.reactionPickerMessageId = null;
    this.reactionPickerExpanded = false;
    this.reactionPickerForMedia = false;
    this.revealedMessageActionsId = message.id;
    if (this.revealActionsTimer) clearTimeout(this.revealActionsTimer);
    this.revealActionsTimer = setTimeout(() => {
      this.revealedMessageActionsId = null;
      this.revealActionsTimer = null;
    }, 1800);
    this.messageActionsId = message.id;
    const element = target instanceof HTMLElement
      ? target
      : document.getElementById(`message-${message.id}`);
    this.positionMessageActionsMenu(message, element);
  }

  toggleMessageActions(message: ChatMessage, event: Event) {
    event.stopPropagation();
    if (this.messageActionsId === message.id) {
      this.messageActionsId = null;
      this.messageActionsMenuPosition = null;
      return;
    }
    const button = event.currentTarget;
    this.openMessageActions(message, button);
  }

  private positionMessageActionsMenu(message: ChatMessage, element: HTMLElement | null) {
    const bounds = element?.getBoundingClientRect();
    if (!bounds) {
      this.messageActionsMenuPosition = { left: 12, top: 12 };
      return;
    }
    const menuWidth = Math.min(184, window.innerWidth - 24);
    const menuHeight = message.senderId === this.selectedAccount()?.id ? 184 : 140;
    const rightPosition = bounds.right + 8;
    const leftPosition = bounds.left - menuWidth - 8;
    const left = rightPosition + menuWidth <= window.innerWidth - 12
      ? rightPosition
      : leftPosition >= 12
        ? leftPosition
        : Math.max(12, window.innerWidth - menuWidth - 12);
    const top = Math.min(
      Math.max(12, bounds.top),
      Math.max(12, window.innerHeight - menuHeight - 12),
    );
    this.messageActionsMenuPosition = { left, top };
  }

  openReactionPicker(message: ChatMessage) {
    this.messageActionsId = null;
    this.messageActionsMenuPosition = null;
    this.reactionPickerMessageId = message.id;
    this.reactionPickerExpanded = false;
    this.reactionPickerForMedia = false;
  }

  openMediaReactionPicker(message: ChatMessage) {
    this.messageActionsId = null;
    this.reactionPickerMessageId = message.id;
    this.reactionPickerExpanded = false;
    this.reactionPickerForMedia = true;
    this.reactionDetailMessageId = null;
    this.reactionDetailEmoji = null;
  }

  expandMediaReactionPicker() {
    this.reactionPickerExpanded = true;
  }

  closeMediaReactionPicker() {
    this.reactionPickerMessageId = null;
    this.reactionPickerExpanded = false;
    this.reactionPickerForMedia = false;
  }

  handleMediaTap(message: ChatMessage, attachment: ChatAttachment, event: Event) {
    if (this.reactionPickerForMedia && this.reactionPickerMessageId === message.id) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const now = Date.now();
    const previousTap = this.mediaTapTimes.get(message.id) ?? 0;
    if (now - previousTap < 280) {
      event.preventDefault();
      event.stopPropagation();
      if (this.mediaTapTimer !== null) clearTimeout(this.mediaTapTimer);
      this.mediaTapTimer = null;
      this.pendingMediaTap = null;
      this.mediaTapTimes.delete(message.id);
      this.openMediaReactionPicker(message);
      return;
    }

    if (this.mediaTapTimer !== null) {
      clearTimeout(this.mediaTapTimer);
      if (this.pendingMediaTap) this.openImageViewer(this.pendingMediaTap.message, this.pendingMediaTap.attachment);
    }
    this.mediaTapTimes.set(message.id, now);
    this.pendingMediaTap = { message, attachment };
    this.mediaTapTimer = setTimeout(() => {
      const pendingTap = this.pendingMediaTap;
      this.mediaTapTimer = null;
      this.pendingMediaTap = null;
      this.mediaTapTimes.delete(message.id);
      if (pendingTap) this.openImageViewer(pendingTap.message, pendingTap.attachment);
    }, 280);
  }

  startMediaReactionPress(message: ChatMessage) {
    this.clearReactionPress();
    if (this.mediaTapTimer !== null) clearTimeout(this.mediaTapTimer);
    this.mediaTapTimer = null;
    this.pendingMediaTap = null;
    this.mediaTapTimes.delete(message.id);
    this.reactionPressTimer = setTimeout(() => {
      this.revealedMessageActionsId = message.id;
      if (this.revealActionsTimer) clearTimeout(this.revealActionsTimer);
      this.revealActionsTimer = setTimeout(() => {
        this.revealedMessageActionsId = null;
        this.revealActionsTimer = null;
      }, 1800);
      this.openMediaReactionPicker(message);
      this.reactionPressTimer = null;
    }, 450);
  }

  async copyMessage(message: ChatMessage) {
    this.messageActionsId = null;
    this.messageActionsMenuPosition = null;
    const content = message.body || (message.attachments ?? []).map((item) => item.name).join('\n');
    try {
      await navigator.clipboard.writeText(content);
      this.callNotice = 'Message copied.';
    } catch {
      this.callNotice = 'Could not copy this message on this device.';
    }
  }

  requestMessageDelete(message: ChatMessage) {
    if (message.senderId !== this.selectedAccount()?.id) return;
    this.messageActionsId = null;
    this.pendingDeleteMessage = message;
  }

  confirmMessageDelete() {
    const message = this.pendingDeleteMessage;
    const conversation = this.activeConversation;
    if (message && conversation && message.senderId === this.selectedAccount()?.id) {
      this.messageService.deleteMessage(conversation.id, message.id);
    }
    this.pendingDeleteMessage = null;
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
    this.messageActionsMenuPosition = null;
    if (action === 'delete') {
      this.requestMessageDelete(message);
    } else if (action === 'reply') {
      this.setReplyToMessage(message);
    } else if (action === 'forward') {
      this.forwardMessage = message;
      this.forwardSearch = '';
      this.forwardNote = '';
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

  closeForward() { this.forwardMessage = null; this.forwardSearch = ''; this.forwardNote = ''; }

  openForwardGroupCreation() {
    this.composeMode = 'group';
    this.selectedMemberIds = [];
    this.groupName = '';
    this.groupMemberSearch = '';
  }

  forwardBody() {
    const message = this.forwardMessage;
    if (!message) return '';
    return this.forwardNote.trim() ? `${this.forwardNote.trim()}\n\n${message.body}` : message.body;
  }

  forwardToAccount(accountId: number) {
    const account = this.selectedAccount();
    const message = this.forwardMessage;
    if (!account || !message) return;
    const conversation = this.messageService.openDirectConversation(account.id, accountId);
    this.messageService.sendMessage(conversation.id, account.id, this.forwardBody(), message.attachments ?? [], { forwarded: true });
    this.closeForward();
    this.callNotice = 'Message forwarded.';
  }

  forwardToConversation(conversation: Conversation) {
    const account = this.selectedAccount();
    const message = this.forwardMessage;
    if (!account || !message) return;
    this.messageService.sendMessage(conversation.id, account.id, this.forwardBody(), message.attachments ?? [], { forwarded: true });
    this.closeForward();
    this.callNotice = 'Message forwarded.';
  }

  mentionAccount(username: string) {
    const normalized = username.toLowerCase().replace(/^@/, '');
    return this.accounts().find((account) => account.username.toLowerCase().replace(/^@/, '') === normalized);
  }

  messageParts(body: string) {
    return body.split(/(https?:\/\/\S+|@everyone|@[\w.]+)/g).filter(Boolean);
  }

  communityInviteCodeFromUrl(value: string) {
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin || !url.pathname.endsWith('/messages')) return null;
      return url.searchParams.get('communityInvite');
    } catch {
      return null;
    }
  }

  clearTyping() {
    const accountId = this.selectedAccount()?.id;
    const conversation = this.activeConversation;
    if (accountId !== undefined && conversation) this.messageService.setTyping(conversation.id, accountId, false);
  }

  private resolveEmojiFromEvent(event: Event): string | null {
    const detail = (event as CustomEvent<{ unicode?: string; emoji?: string }>).detail;
    return detail?.unicode ?? detail?.emoji ?? null;
  }

  onEmojiSelected(event: Event, message: ChatMessage) {
    const emoji = this.resolveEmojiFromEvent(event);
    if (emoji) this.chooseMessageReaction(message, emoji);
  }

  onComposerEmojiSelected(event: Event) {
    const emoji = this.resolveEmojiFromEvent(event);
    if (emoji) this.updateDraftTyping(this.messageDraft + emoji);
    this.showComposerEmojiPicker = false;
  }

  resizeComposerInput(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement | null;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  private resetComposerInputHeight() {
    requestAnimationFrame(() => {
      const input = this.chatMessageInput?.nativeElement;
      if (!input) return;
      input.style.removeProperty('height');
      input.scrollTop = 0;
    });
  }
  messageReactionList(message: ChatMessage) {
    return Object.entries(message.reactions ?? {})
      .filter(([, users]) => users.length > 0)
      .map(([emoji, users]) => ({ emoji, count: users.length }));
  }

  attachSelectedFile(event: Event, kind: 'photo' | 'video' | 'gif' | 'file') {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);
    input.value = '';
    if (!selectedFiles.length) return;
    if (kind === 'photo') {
      const remaining = Math.max(0, 15 - this.pendingAttachments.filter((attachment) => attachment.kind === 'photo').length);
      if (!remaining) {
        this.callNotice = 'You can send up to 15 photos in one message.';
        return;
      }
      const files = selectedFiles.slice(0, remaining);
      const exceededLimit = selectedFiles.length > remaining;
      const validFiles = files.filter((file) => file.size <= 15 * 1024 * 1024);
      const rejectedSize = validFiles.length !== files.length;
      this.isReadingPhotoAttachments = true;
      if (exceededLimit) this.callNotice = `Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be sent in one message.`;
      else if (rejectedSize) this.callNotice = 'Photos must be smaller than 15 MB each.';
      void Promise.all(validFiles.map((file) => this.readAttachment(file, 'photo'))).then((attachments) => {
        const loaded = attachments.filter((attachment): attachment is ChatAttachment => attachment !== null);
        if (loaded.length) {
          this.pendingAttachments = [...this.pendingAttachments, ...loaded];
        }
        if (loaded.length !== validFiles.length) this.callNotice = 'Some photos could not be loaded.';
        else if (!loaded.length && !this.callNotice) this.callNotice = 'No photos could be loaded.';
      }).finally(() => { this.isReadingPhotoAttachments = false; });
      return;
    }
    const file = selectedFiles[0];
    if (kind === 'file') {
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
      if (!this.allowedDocumentExtensions.has(extension)) {
        this.callNotice = 'Choose a PDF, Office document, text file, or ZIP archive.';
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        this.callNotice = 'Files must be 25 MB or smaller.';
        return;
      }
    } else if (file.size > 15 * 1024 * 1024) {
      this.callNotice = 'Choose a file smaller than 15 MB.';
      return;
    }
    void this.readAttachment(file, kind).then((attachment) => {
      if (!attachment) {
        this.callNotice = 'This file could not be loaded.';
        return;
      }
      this.pendingAttachments = [...this.pendingAttachments, attachment];
      this.sendMessage();
    });
  }

  private readAttachment(file: File, kind: ChatAttachment['kind']): Promise<ChatAttachment | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string'
        ? { kind, name: file.name, url: reader.result, ...(kind === 'file' ? { sizeBytes: file.size } : {}) }
        : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  removePendingAttachment(attachment: ChatAttachment) {
    this.pendingAttachments = this.pendingAttachments.filter((item) => item !== attachment);
  }

  async toggleVoiceRecording() {
    const started = await this.voiceService.start();
    if (!started && this.voiceService.error()) this.callNotice = this.voiceService.error()!;
  }

  micPressStart() { void this.toggleVoiceRecording(); }
  micPressEnd() { /* Recording continues until send or discard. */ }

  async sendVoiceRecording() {
    const account = this.selectedAccount();
    const conversation = this.activeConversation;
    if (!account || !conversation) return;
    const recording = this.voiceService.completed() ?? (this.voiceService.recording() ? await this.voiceService.stop() : null);
    if (!recording) { this.callNotice = 'The voice message could not be prepared. Please try again.'; return; }
    this.messageService.sendMessage(conversation.id, account.id, '', [{
      kind: 'voice', name: 'Voice message', url: recording.url, audioUrl: recording.url,
      durationSeconds: recording.durationSeconds, peaks: recording.peaks,
    }]);
    this.scrollToLatest();
    this.callNotice = '';
    this.voiceService.completed.set(null);
  }

  async cancelVoiceRecording() {
    await this.voiceService.stop(true);
  }

  discardCompletedVoice() { this.voiceService.completed.set(null); }

  formatVoiceDuration(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }

  voiceBarHeight(index: number) {
    return 18 + ((index * 29 + 17) % 72);
  }

  updateVoiceProgress(url: string, player: HTMLAudioElement) {
    const progress = Number.isFinite(player.duration) && player.duration > 0 ? Math.min(1, Math.max(0, player.currentTime / player.duration)) : 0;
    this.voicePlaybackProgress = { ...this.voicePlaybackProgress, [url]: progress };
  }
  voiceBarPlayed(url: string, index: number) { return (index + 1) / this.voiceWaveBars.length <= (this.voicePlaybackProgress[url] ?? 0); }
  async toggleVoicePlayback(player: HTMLAudioElement) { if (player.paused) { try { await player.play(); } catch { this.callNotice = 'This voice message could not be played.'; } } else player.pause(); }
  voicePlaybackPaused(url: string) { if (this.voicePlayingUrl === url) this.voicePlayingUrl = null; }
  voicePlaybackEnded(url: string) { this.voicePlaybackProgress = { ...this.voicePlaybackProgress, [url]: 1 }; this.voicePlaybackPaused(url); }

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
    this.scrollToLatest();
    this.clearTyping();
    this.messageDraft = '';
    this.resetComposerInputHeight();
    this.replyToMessage = null;
    this.saveViewState();
    this.pendingAttachments = [];
  }

  sendQuickReaction() {
    const conversation = this.activeConversation;
    const account = this.selectedAccount();
    if (!conversation || !account || this.isPreferenceEnabled('blockedFor')) return;
    const emoji = this.messageService.settingsFor(conversation.id).reactionEmoji || '❤️';
    const targetMessage = conversation.messages.at(-1);
    if (targetMessage) {
      this.messageService.toggleReaction(conversation.id, targetMessage.id, account.id, emoji);
      return;
    }
    this.messageService.sendMessage(conversation.id, account.id, emoji);
  }
}

const sampleChatAccounts: Account[] = [
  { id: -1001, name: 'Mika Santos', username: '@mika.santos', contact: 'mika@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
  { id: -1002, name: 'Alex Rivera', username: '@alex.rivera', contact: 'alex@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
  { id: -1003, name: 'Sam Lee', username: '@sam.lee', contact: 'sam@example.invalid', password: '', bio: 'Sample account', followersIds: [], followingIds: [] },
];
