import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonAvatar, IonLabel, IonIcon,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline, ellipsisHorizontalOutline, ellipsisVerticalOutline } from 'ionicons/icons';
import { AccountService, Account } from '../../services/account.service';

@Component({
  selector: 'app-more-accounts',
  standalone: true,
  templateUrl: './more-accounts.page.html',
  styleUrls: ['./more-accounts.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonAvatar, IonLabel, IonIcon],
})
export class MoreAccountsPage {
  public accountService = inject(AccountService);
  private router = inject(Router);
  accountMenuId: number | null = null;
  menuTop = 0;
  menuLeft = 0;

  constructor() {
    addIcons({ personCircleOutline, ellipsisHorizontalOutline, ellipsisVerticalOutline });
  }

  accountInitials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  goBack() {
    void this.router.navigateByUrl('/select-account');
  }

  chooseAccount(account: Account) {
    if (this.accountService.selectedAccount()) this.accountService.logout();
    this.accountService.prepareAccountLogin(account);
    this.router.navigateByUrl('/login');
  }

  get activeMenuAccount() {
    return this.accountService.listedAccounts().find((account) => account.id === this.accountMenuId) ?? null;
  }

  toggleAccountMenu(event: Event, accountId: number) {
    event.stopPropagation();
    if (this.accountMenuId === accountId) {
      this.accountMenuId = null;
      return;
    }
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const menuHeight = 104;
    const menuWidth = 190;
    const belowTop = rect.bottom + 6;
    this.menuTop = belowTop + menuHeight <= window.innerHeight - 12 ? belowTop : Math.max(12, rect.top - menuHeight - 6);
    this.menuLeft = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    this.accountMenuId = accountId;
  }

  removePassword(event: Event, accountId: number) {
    event.stopPropagation();
    this.accountService.removePasswordFromChooser(accountId);
    this.accountMenuId = null;
  }

  removeAccount(event: Event, accountId: number) {
    event.stopPropagation();
    this.accountService.removeAccountFromChooser(accountId);
    this.accountMenuId = null;
  }
}
