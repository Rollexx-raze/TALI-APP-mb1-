import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonInput, IonButton } from '@ionic/angular';
import { AccountService } from '../../services/account.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonItem, IonInput, IonButton],
})
export class LoginPage {
  identifier = '';
  password = '';
  submitted = false;
  welcomeName = '';

  private readonly router = inject(Router);
  readonly accountService = inject(AccountService);

  ionViewWillEnter() {
    this.prepareSelectedAccountLogin();
  }

  private prepareSelectedAccountLogin() {
    const account = this.accountService.consumeAccountLoginPrefill();
    if (account) {
      this.welcomeName = account.name.trim().split(/\s+/)[0] ?? '';
      this.identifier = account.contact;
      this.password = this.accountService.isPasswordSaved(account.id) ? account.password : '';
    }
    else {
      this.welcomeName = '';
      this.identifier = '';
      this.password = '';
    }
    this.submitted = false;
  }

  logIn() {
    this.submitted = true;

    if (!this.identifier.trim() || !this.password.trim()) {
      return;
    }

    const account = this.accountService.authenticate(this.identifier, this.password);
    if (!account) {
      return;
    }

    this.accountService.selectAccount(account);

    this.router.navigateByUrl('/home');
  }

  goToSelectAccount() {
    this.router.navigateByUrl('/select-account');
  }

  goToCreateAccount() {
    this.router.navigateByUrl('/create-account');
  }
}
