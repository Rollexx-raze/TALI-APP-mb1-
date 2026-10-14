import { AfterViewInit, Component, effect, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonButton, IonIcon, IonAvatar, IonFooter, ToastController } from '@ionic/angular';
import { AccountService } from '../../services/account.service';
import { PostService } from '../../services/post.service';
import { NotificationService } from '../../services/notification.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { addCircle, chatbubbleOutline, documentOutline, ellipsisHorizontal, heartOutline, homeSharp, notificationsOutline, personCircleOutline, personOutline, repeatOutline, searchOutline, shareOutline } from 'ionicons/icons';
import { PostCardComponent } from '../../components/post-card/post-card.component';
import { ViewStateService } from '../../services/view-state.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonButton, IonIcon, IonAvatar, IonFooter, CommonModule, FormsModule, RouterLink, PostCardComponent]
})
export class HomePage implements AfterViewInit {
  @ViewChild(IonContent) private content?: IonContent;
  private readonly route = inject(ActivatedRoute);
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly notificationService = inject(NotificationService);
  readonly groupService = inject(GroupService);
  readonly viewState = inject(ViewStateService);
  private readonly toastController = inject(ToastController);
  private readonly viewStateKey = 'tali-view-home';

  activeFeed: 'for-you' | 'following' = 'for-you';

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  get feedPosts() {
    const viewer = this.accountService.selectedAccount();
    const accounts = this.accountService.accounts();
    return this.postService.posts().filter((post) =>
      !post.archivedAt &&
      !post.trashedAt &&
      (post.groupId
        ? this.groupService.canViewGroupPost(post.groupId, viewer?.id)
        : this.postService.canViewPost(post, viewer, accounts)),
    );
  }

  get visiblePosts() {
    const posts = this.feedPosts;
    if (this.activeFeed === 'for-you') return posts;
    const viewer = this.accountService.selectedAccount();
    const followingIds = viewer?.followingIds ?? [];
    return posts.filter((post) => post.groupId
      ? this.groupService.getGroupById(post.groupId)?.memberIds.includes(viewer?.id ?? -1) ?? false
      : post.authorId !== null && followingIds.includes(post.authorId),
    );
  }

  get focusedPostId() {
    return this.route.snapshot.queryParamMap.get('postId');
  }

  get openCommentsForFocusedPost() {
    return this.route.snapshot.queryParamMap.get('openComments') === 'true';
  }

  get notificationFocusKey() {
    return this.route.snapshot.queryParamMap.get('notificationId') ?? '';
  }

  profileImageFor(authorId: number | null) {
    const author = this.accountService.accounts().find((account) => account.id === authorId);
    return author && this.accountService.canViewProfileImage(author, this.accountService.selectedAccount()) ? author.profileImage : undefined;
  }

  constructor() {
    addIcons({ addCircle, chatbubbleOutline, documentOutline, ellipsisHorizontal, heartOutline, homeSharp, notificationsOutline, personCircleOutline, personOutline, repeatOutline, searchOutline, shareOutline });
    effect(() => {
      const error = this.postService.loadError();
      if (error) void this.showToast(error);
    });
    effect(() => {
      const viewerId = this.accountService.selectedAccount()?.id;
      const posts = this.feedPosts;
      console.log('Home feed query', {
        viewerId,
        loadedPostCount: this.postService.posts().length,
        visiblePostCount: posts.length,
        groupCount: this.groupService.groups().length,
      });
    });
  }

  setFeed(feed: 'for-you' | 'following') {
    this.activeFeed = feed;
  }

  ngAfterViewInit() {
    if (this.focusedPostId) return;
    const savedScrollTop = this.viewState.read<number>(this.viewStateKey, 0);
    if (savedScrollTop > 0) void this.content?.scrollToPoint(0, savedScrollTop, 0);
  }

  saveScroll(event: CustomEvent<{ scrollTop: number }>) {
    this.viewState.write(this.viewStateKey, event.detail.scrollTop);
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({ message, duration: 2600, color: 'danger' });
    await toast.present();
  }
}