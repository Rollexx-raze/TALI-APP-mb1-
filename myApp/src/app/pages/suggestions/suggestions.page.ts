import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonAvatar, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, atOutline, chatbubbleOutline, heartOutline, homeOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, repeatOutline, shareOutline, trendingUpOutline } from 'ionicons/icons';
import { Account, AccountService } from '../../services/account.service';
import { AppNotification, NotificationService } from '../../services/notification.service';
import { PostService } from '../../services/post.service';
import { Conversation, MessageService } from '../../services/message.service';
import { ViewStateService } from '../../services/view-state.service';

@Component({
  selector: 'app-suggestions',
  standalone: true,
  templateUrl: './suggestions.page.html',
  styleUrls: ['./suggestions.page.scss'],
  imports: [CommonModule, RouterLink, IonAvatar, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonToolbar],
})
export class SuggestionsPage {
  readonly viewState = inject(ViewStateService);
  private readonly viewStateKey = 'tali-view-activity';
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly notificationService = inject(NotificationService);
  readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  selectedSection: 'suggestions' | 'notifications' = 'suggestions';
  selectedCategory: 'people' | 'posts' | 'groups' = 'people';
  pendingUnfollow: Account | null = null;

  get groups() {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('tali-community-groups') ?? '[]');
      return Array.isArray(value) ? value.filter((item) => !!item && typeof item.name === 'string') as { id: string; name: string; description: string }[] : [];
    } catch { return []; }
  }

  get groupChats() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? [] : this.messageService.conversations()
      .filter((conversation) => !!conversation.groupName && conversation.memberIds.includes(accountId))
      .sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());
  }

  get groupActivityUnreadCount() {
    return this.groupChats.reduce((total, conversation) => total + this.groupUnreadCount(conversation), 0);
  }

  groupUnreadCount(conversation: Conversation) {
    const accountId = this.accountService.selectedAccount()?.id;
    if (accountId === undefined) return 0;
    const messageCount = conversation.messages.filter((message) =>
      message.senderId !== accountId && !(message.readBy ?? []).includes(accountId),
    ).length;
    return Math.max(messageCount, this.messageService.settingsFor(conversation.id).unreadFor.includes(accountId) ? 1 : 0);
  }

  groupChatPreview(conversation: Conversation) {
    const latest = conversation.messages.at(-1);
    return latest?.body || `${conversation.memberIds.length} members · Start the conversation`;
  }

  openGroupChat(conversationId: string) {
    const accountId = this.accountService.selectedAccount()?.id;
    if (accountId !== undefined) this.messageService.markRead(conversationId, accountId);
    const saved = this.viewState.read<Record<string, unknown>>('tali-view-messages', {});
    this.viewState.write('tali-view-messages', { ...saved, activeConversationId: conversationId, composeMode: null });
    void this.router.navigate(['/messages']);
  }

  createGroupChat() {
    const saved = this.viewState.read<Record<string, unknown>>('tali-view-messages', {});
    this.viewState.write('tali-view-messages', { ...saved, activeConversationId: null, composeMode: 'group' });
    void this.router.navigate(['/messages']);
  }

  get people() {
    const selectedId = this.accountService.selectedAccount()?.id;
    return this.accountService.accounts().filter((account) => account.id !== selectedId);
  }

  get posts() {
    const viewer = this.accountService.selectedAccount();
    const accounts = this.accountService.accounts();
    return this.postService.posts().filter((post) =>
      post.authorId !== viewer?.id && this.postService.canViewPost(post, viewer, accounts),
    );
  }

  constructor() {
    addIcons({ addCircle, atOutline, chatbubbleOutline, heartOutline, homeOutline, notificationsOutline, peopleOutline, personAddOutline, personCircleOutline, repeatOutline, shareOutline, trendingUpOutline });
    const saved = this.viewState.read<Partial<{ selectedSection: 'suggestions' | 'notifications'; selectedCategory: 'people' | 'posts' | 'groups' }>>(this.viewStateKey, {});
    if (saved.selectedSection) this.selectedSection = saved.selectedSection;
    if (saved.selectedCategory) this.selectedCategory = saved.selectedCategory;
  }

  setSection(section: 'suggestions' | 'notifications') {
    this.selectedSection = section;
    this.saveViewState();
  }

  setCategory(category: 'people' | 'posts' | 'groups') {
    this.selectedCategory = category;
    this.saveViewState();
  }

  private saveViewState() {
    this.viewState.write(this.viewStateKey, { selectedSection: this.selectedSection, selectedCategory: this.selectedCategory });
  }

  get notifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? [] : this.notificationService.forAccount(accountId);
  }

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  notificationMessage(notification: AppNotification) {
    switch (notification.type) {
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'followed you';
      case 'share': return 'shared your post';
      case 'repost': return 'reposted your post';
      case 'mention': return 'mentioned you';
      case 'message_request': return 'sent you a message request';
    }
  }

  markNotificationRead(notification: AppNotification) {
    this.notificationService.markRead(notification.id, notification.recipientId);
    if (notification.type === 'message_request' && notification.conversationId) {
      const messagesStateKey = 'tali-view-messages';
      const saved = this.viewState.read<Record<string, unknown>>(messagesStateKey, {});
      this.viewState.write(messagesStateKey, { ...saved, activeConversationId: notification.conversationId });
      void this.router.navigate(['/messages']);
      return;
    }
    if (notification.type === 'follow') {
      void this.router.navigate(['/profile', notification.actorId]);
      return;
    }

    const post = notification.postId
      ? this.postService.posts().find((item) => item.id === notification.postId)
      : undefined;
    void this.router.navigate(['/home'], {
      queryParams: {
        postId: post?.id ?? notification.postId,
        openComments: ['like', 'comment', 'repost'].includes(notification.type) ? 'true' : null,
        notificationId: notification.id,
      },
    });
  }

  markAllNotificationsRead() {
    const accountId = this.accountService.selectedAccount()?.id;
    if (accountId !== undefined) this.notificationService.markAllRead(accountId);
  }

  toggleFollow(person: Account) {
    if (this.isFollowing(person)) this.pendingUnfollow = person;
    else this.accountService.followAccount(person.id);
  }

  cancelUnfollow() {
    this.pendingUnfollow = null;
  }

  confirmUnfollow() {
    const person = this.pendingUnfollow;
    if (person && this.isFollowing(person)) this.accountService.unfollowAccount(person.id);
    this.pendingUnfollow = null;
  }

  isFollowing(person: Account) {
    return this.accountService.selectedAccount()?.followingIds.includes(person.id) ?? false;
  }
}
