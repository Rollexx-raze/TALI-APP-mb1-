import {
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonButton, IonFooter, IonToolbar } from '@ionic/angular';
import {
  NavigationStart,
  Router,
  RouterLink,
} from '@angular/router';

import { AccountService } from '../../services/account.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import {
  BottomNavVisibilityService,
} from '../../services/bottom-nav-visibility.service';

type BottomTab = {
  key: 'home' | 'explore' | 'create' | 'activity' | 'profile';
  label: string;
  path: string;
  matches: readonly string[];
  stateKey: string;
};

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
  imports: [IonButton, IonFooter, IonToolbar, RouterLink],
  host: {
    '[class.nav-hidden]': 'navigationHidden',
  },
})
export class BottomNavComponent {
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly notificationService = inject(NotificationService);
  private readonly viewState = inject(ViewStateService);
  private readonly navVisibility = inject(BottomNavVisibilityService);

  private readonly mobileLayout = signal(
    typeof window !== 'undefined' && window.innerWidth < 1024,
  );

  readonly tabs: readonly BottomTab[] = [
    {
      key: 'home',
      label: 'Home',
      path: '/home',
      matches: ['/home'],
      stateKey: 'tali-view-home',
    },
    {
      key: 'explore',
      label: 'Chat',
      path: '/messages',
      matches: ['/messages', '/search'],
      stateKey: 'tali-view-messages',
    },
    {
      key: 'create',
      label: 'Create',
      path: '/add-post',
      matches: ['/add-post'],
      stateKey: 'tali-post-draft',
    },
    {
      key: 'activity',
      label: 'Alerts',
      path: '/activity',
      matches: ['/activity'],
      stateKey: 'tali-view-activity',
    },
    {
      key: 'profile',
      label: 'Profile',
      path: '/profile',
      matches: ['/profile', '/settings'],
      stateKey: 'tali-view-profile:current',
    },
  ];

  constructor() {
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.navVisibility.show();
        }
      });
  }

  get navigationHidden() {
    return this.mobileLayout() &&
      this.pathname === '/home' &&
      this.navVisibility.hidden();
  }

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;

    return accountId === undefined
      ? 0
      : this.notificationService.unreadCount(accountId);
  }

  private get pathname() {
    return this.router.url
      .split(/[?#]/, 1)[0]
      .replace(/\/+$/, '') || '/';
  }

  isActive(tab: BottomTab) {
    const pathname = this.pathname;

    return tab.key === 'home'
      ? pathname === '/home'
      : tab.matches.some(
        (path) =>
          pathname === path ||
          pathname.startsWith(`${path}/`),
      );
  }

  onTabTap(tab: BottomTab) {
    this.navVisibility.show();
    this.viewState.handleTabTap(tab.path, tab.stateKey);
  }

  onFloatingCreate() {
    this.navVisibility.show();
    this.viewState.handleTabTap('/add-post', 'tali-post-draft');
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.mobileLayout.set(window.innerWidth < 1024);

    if (!this.mobileLayout()) {
      this.navVisibility.show();
    }
  }
}