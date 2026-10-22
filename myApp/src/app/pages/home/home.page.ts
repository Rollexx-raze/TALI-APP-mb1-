import { ElementRef,
  AfterViewInit,
  Component,
  OnDestroy,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButton,
  IonIcon,
  IonAvatar,
  ToastController,
} from '@ionic/angular';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  addCircle,
  chatbubbleOutline,
  createOutline,
  documentOutline,
  ellipsisHorizontal,
  heartOutline,
  homeSharp,
  notificationsOutline,
  optionsOutline,
  personCircleOutline,
  personOutline,
  repeatOutline,
  searchOutline,
  shareOutline,
} from 'ionicons/icons';

import { AccountService } from '../../services/account.service';
import { PostService } from '../../services/post.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { GroupService } from '../../services/group.service';
import {
  BottomNavVisibilityService,
} from '../../services/bottom-nav-visibility.service';
import {
  PostCardComponent,
} from '../../components/post-card/post-card.component';
import {
  FeedMenuComponent,
} from '../../components/feed-menu/feed-menu.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonAvatar,
    CommonModule,
    FormsModule,
    RouterLink,
    PostCardComponent,
    FeedMenuComponent,
  ],
})
export class HomePage implements AfterViewInit, OnDestroy {
  private readonly homeElement = inject(ElementRef<HTMLElement>);

  @ViewChild(IonContent) private content?: IonContent;

  private readonly route = inject(ActivatedRoute);
  private readonly toastController = inject(ToastController);
  private readonly navVisibility = inject(BottomNavVisibilityService);

  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  readonly notificationService = inject(NotificationService);
  readonly groupService = inject(GroupService);
  readonly viewState = inject(ViewStateService);

  private readonly viewStateKey = 'tali-view-home';
  private readonly scrollThreshold = 12;

  private homeActive = true;
  private restoringScroll = false;
  private lastScrollTop = 0;
  private scrollDirection = 0;
  private scrollDistance = 0;

  activeFeed: 'for-you' | 'following' = 'for-you';

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;

    return accountId === undefined
      ? 0
      : this.notificationService.unreadCount(accountId);
  }

  get feedPosts() {
    const viewer = this.accountService.selectedAccount();
    const accounts = this.accountService.accounts();

    return this.postService.posts().filter((post) =>
      !post.archivedAt &&
      !post.trashedAt &&
      (
        post.groupId
          ? this.groupService.canViewGroupPost(post.groupId, viewer?.id)
          : this.postService.canViewPost(post, viewer, accounts)
      ),
    );
  }

  get visiblePosts() {
    const posts = this.feedPosts;

    if (this.activeFeed === 'for-you') return posts;

    const viewer = this.accountService.selectedAccount();
    const followingIds = viewer?.followingIds ?? [];

    return posts.filter((post) =>
      post.groupId
        ? (
          this.groupService
            .getGroupById(post.groupId)
            ?.memberIds.includes(viewer?.id ?? -1) ?? false
        )
        : (
          post.authorId !== null &&
          followingIds.includes(post.authorId)
        ),
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

  constructor() {
    addIcons({
      addCircle,
      chatbubbleOutline,
      createOutline,
      documentOutline,
      ellipsisHorizontal,
      heartOutline,
      homeSharp,
      notificationsOutline,
      optionsOutline,
      personCircleOutline,
      personOutline,
      repeatOutline,
      searchOutline,
      shareOutline,
    });

    effect(() => {
      const error = this.postService.loadError();

      if (error) void this.showToast(error);
    });
  }

  profileImageFor(authorId: number | null) {
    const author = this.accountService.accounts().find(
      (account) => account.id === authorId,
    );

    return author &&
      this.accountService.canViewProfileImage(
        author,
        this.accountService.selectedAccount(),
      )
      ? author.profileImage
      : undefined;
  }

  setFeed(feed: 'for-you' | 'following') {
    this.activeFeed = feed;
    this.resetScrollDirection();
    this.navVisibility.show();
  }

  retryLoadingPosts() {
    if (typeof window !== 'undefined') window.location.reload();
  }

  ngAfterViewInit() {
    if (this.focusedPostId) return;

    const savedScrollTop = this.viewState.read<number>(
      this.viewStateKey,
      0,
    );

    if (savedScrollTop > 0) void this.restoreScroll(savedScrollTop);
  }

  ionViewWillEnter() {
    this.homeActive = true;
    this.resetScrollDirection();
    this.navVisibility.show();

    if (this.focusedPostId) this.activeFeed = 'for-you';
  }

  ionViewWillLeave() {
    this.releaseHomeFocus();
    this.homeActive = false;
    this.resetScrollDirection();
    this.navVisibility.show();
  }

  ngOnDestroy() {
    this.homeActive = false;
    this.navVisibility.show();
  }

  saveScroll(event: CustomEvent<{ scrollTop: number }>) {
    if (!this.homeActive) return;

    const scrollTop = Math.max(0, event.detail.scrollTop);
    this.viewState.write(this.viewStateKey, scrollTop);

    if (this.restoringScroll) {
      this.lastScrollTop = scrollTop;
      return;
    }

    const delta = scrollTop - this.lastScrollTop;
    this.lastScrollTop = scrollTop;

    if (scrollTop <= 20) {
      this.resetScrollDirection();
      this.navVisibility.show();
      return;
    }

    if (Math.abs(delta) < 1) return;

    const direction = delta > 0 ? 1 : -1;

    if (direction !== this.scrollDirection) {
      this.scrollDirection = direction;
      this.scrollDistance = 0;
    }

    this.scrollDistance += Math.abs(delta);

    if (this.scrollDistance < this.scrollThreshold) return;

    if (direction > 0) this.navVisibility.hide();
    else this.navVisibility.show();

    this.scrollDistance = 0;
  }

  private releaseHomeFocus() {
    const page = this.homeElement.nativeElement;
    const focused = page.ownerDocument.activeElement;

    if (focused instanceof HTMLElement && page.contains(focused)) {
      focused.blur();
    }
  }

  private resetScrollDirection() {
    this.scrollDirection = 0;
    this.scrollDistance = 0;
  }

  private async restoreScroll(scrollTop: number) {
    this.restoringScroll = true;
    this.lastScrollTop = scrollTop;

    try {
      await this.content?.scrollToPoint(0, scrollTop, 0);
    } finally {
      this.restoringScroll = false;
      this.resetScrollDirection();
      this.navVisibility.show();
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2600,
      color: 'danger',
    });

    await toast.present();
  }
}