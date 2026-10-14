import { Component, inject, OnInit } from '@angular/core';
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
export class LoginPage implements OnInit {
  identifier = '';
  password = '';
  submitted = false;

  private readonly router = inject(Router);
  readonly accountService = inject(AccountService);

  ngOnInit() {
    this.prepareSelectedAccountLogin();
  }

  ionViewWillEnter() {
    this.prepareSelectedAccountLogin();
  }

  private prepareSelectedAccountLogin() {
    const account = this.accountService.selectedAccount();
    if (account) {
      this.identifier = account.contact;
      this.password = this.accountService.isPasswordSaved(account.id) ? account.password : '';
    }
    else {
      this.identifier = '';
      this.password = '';
    }
    this.submitted = false;
  }

  get welcomeName() {
    return this.accountService.selectedAccount()?.name.trim().split(/\s+/)[0] ?? '';
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
