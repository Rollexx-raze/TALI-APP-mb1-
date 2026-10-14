import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonAvatar, IonLabel, IonIcon,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personCircleOutline, chevronForwardOutline, ellipsisVerticalOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';

@Component({
  selector: 'app-select-account',
  standalone: true,
  templateUrl: './select-account.page.html',
  styleUrls: ['./select-account.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonIcon,
  ],
})
export class SelectAccountPage {
  public accountService = inject(AccountService);
  private router = inject(Router);
  accountMenuId: number | null = null;
  menuTop = 0;
  menuLeft = 0;

  constructor() {
    addIcons({ personCircleOutline, chevronForwardOutline, ellipsisVerticalOutline });
  }

  get previewAccounts() {
    return this.accountService.listedAccounts().slice(0, 3);
  }

  get activeMenuAccount() {
    return this.previewAccounts.find((account) => account.id === this.accountMenuId) ?? null;
  }

  chooseAccount(account: ReturnType<typeof this.accountService.accounts>[number]) {
    this.accountService.selectAccount(account);
    this.accountService.prepareAccountLogin(account);
    this.router.navigateByUrl('/login');
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

  goToMoreAccounts() {
    this.router.navigateByUrl('/more-accounts');
  }
}
