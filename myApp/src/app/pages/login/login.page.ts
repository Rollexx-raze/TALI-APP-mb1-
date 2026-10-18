import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonButton } from '@ionic/angular';
import { AccountService } from '../../services/account.service';
import { AuthError, AuthService, isValidContact } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonButton],
})
export class LoginPage {
  @ViewChild('passwordInput') private passwordInput?: ElementRef<HTMLInputElement>;
  identifier = '';
  password = '';
  submitted = false;
  welcomeName = '';
  isSigningIn = false;
  showPassword = false;
  errorMessage = '';

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly accountService = inject(AccountService);

  ionViewWillEnter() {
    const shouldFocusPassword = this.prepareSelectedAccountLogin();
    if (shouldFocusPassword) setTimeout(() => this.passwordInput?.nativeElement.focus(), 0);
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
    this.errorMessage = '';
    return !!account;
  }

  get identifierError() {
    if (!this.submitted) return '';
    if (!this.identifier.trim()) return 'Enter your email or phone number.';
    return isValidContact(this.identifier.trim()) ? '' : 'Enter a valid email address or phone number.';
  }

  get passwordError() {
    return this.submitted && !this.password ? 'Enter your password.' : '';
  }

  async logIn() {
    this.submitted = true;
    this.errorMessage = '';

    if (this.isSigningIn || this.identifierError || this.passwordError) return;

    this.isSigningIn = true;
    try {
      await new Promise<void>((resolve) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0));
      await this.auth.login(this.identifier, this.password);
      await this.router.navigateByUrl('/home');
    } catch (error) {
      this.errorMessage = error instanceof AuthError && error.code === 'invalid_credentials'
        ? error.message
        : error instanceof AuthError && error.code === 'network'
          ? 'We could not reach the sign-in service. Check your connection and try again.'
          : 'Sign in could not be completed. Please try again.';
    } finally {
      this.isSigningIn = false;
    }
  }

  goToSelectAccount() {
    this.router.navigateByUrl('/select-account');
  }

  goToCreateAccount() {
    this.router.navigateByUrl('/create-account');
  }
}
