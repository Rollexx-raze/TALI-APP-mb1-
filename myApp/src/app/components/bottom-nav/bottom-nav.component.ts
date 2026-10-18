import { Component, inject } from '@angular/core';
import { IonButton, IonFooter, IonToolbar } from '@ionic/angular';
import { Router, RouterLink } from '@angular/router';
import { AccountService } from '../../services/account.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';

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
})
export class BottomNavComponent {
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly notificationService = inject(NotificationService);
  private readonly viewState = inject(ViewStateService);

  readonly tabs: readonly BottomTab[] = [
    { key: 'home', label: 'Home', path: '/home', matches: ['/home'], stateKey: 'tali-view-home' },
    { key: 'explore', label: 'Chat', path: '/messages', matches: ['/messages', '/search'], stateKey: 'tali-view-messages' },
    { key: 'create', label: 'Create', path: '/add-post', matches: ['/add-post'], stateKey: 'tali-post-draft' },
    { key: 'activity', label: 'Alerts', path: '/activity', matches: ['/activity'], stateKey: 'tali-view-activity' },
    { key: 'profile', label: 'Profile', path: '/profile', matches: ['/profile', '/settings'], stateKey: 'tali-view-profile:current' },
  ];

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  isActive(tab: BottomTab) {
    const pathname = this.router.url.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
    return tab.key === 'home'
      ? pathname === '/home'
      : tab.matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }

  onTabTap(tab: BottomTab) {
    this.viewState.handleTabTap(tab.path, tab.stateKey);
  }
}
