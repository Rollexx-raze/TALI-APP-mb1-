import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { AuthError, AuthService, isValidContact, isValidUsername } from '../../services/auth.service';

@Component({
  selector: 'app-create-account',
  standalone: true,
  templateUrl: './create-account.page.html',
  styleUrls: ['./create-account.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonHeader, IonToolbar, IonButtons, IonBackButton],
})
export class CreateAccountPage {
  readonly totalSteps = 3;
  step: 1 | 2 = 1;
  firstName = '';
  lastName = '';
  username = '';
  emailOrNumber = '';
  password = '';
  confirmPassword = '';
  submitted = false;
  accountError = '';
  created = false;
  isSubmitting = false;
  showPassword = false;

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  get activeStep() {
    return this.created ? 3 : this.step;
  }

  get progressPercent() {
    return Math.round((this.activeStep / this.totalSteps) * 10000) / 100;
  }

  get usernameError() {
    const username = this.username.trim().replace(/^@+/, '');
    return username && !isValidUsername(username) ? 'Use 3–30 letters, numbers, periods, or underscores.' : '';
  }

  get contactError() {
    const contact = this.emailOrNumber.trim();
    return contact && !isValidContact(contact) ? 'Enter a valid email address or phone number.' : '';
  }

  get passwordError() {
    return this.password && this.password.length < 8 ? 'Use at least 8 characters.' : '';
  }

  get confirmPasswordError() {
    return this.confirmPassword && this.confirmPassword !== this.password ? 'Passwords do not match.' : '';
  }

  get passwordStrength() {
    if (!this.password) return 0;
    const score = Number(this.password.length >= 8) +
      Number(/[a-z]/i.test(this.password) && /\d/.test(this.password)) +
      Number(/[^a-z0-9]/i.test(this.password) || this.password.length >= 12);
    return Math.min(3, score);
  }

  get passwordStrengthLabel() {
    return ['', 'Weak', 'Fair', 'Strong'][this.passwordStrength];
  }

  get isAccountStepValid() {
    const username = this.username.trim().replace(/^@+/, '');
    return isValidUsername(username) && isValidContact(this.emailOrNumber.trim()) &&
      this.password.length >= 8 && this.confirmPassword === this.password;
  }

  get isDetailsStepValid() {
    return !!this.firstName.trim() && !!this.lastName.trim();
  }

  nextStep() {
    this.submitted = true;
    this.accountError = '';
    if (!this.isAccountStepValid) {
      this.focusFirstInvalidAccountField();
      return;
    }
    this.submitted = false;
    this.step = 2;
  }

  private focusFirstInvalidAccountField() {
    if (typeof document === 'undefined') return;
    const username = this.username.trim().replace(/^@+/, '');
    const fieldId = !isValidUsername(username)
      ? 'signup-username'
      : !isValidContact(this.emailOrNumber.trim())
        ? 'signup-contact'
        : this.password.length < 8
          ? 'signup-password'
          : 'signup-confirm-password';
    setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
  }

  goBackStep() {
    this.accountError = '';
    this.submitted = false;
    if (this.step === 2) this.step = 1;
    else this.goToLogin();
  }

  async createAccount() {
    this.submitted = true;
    this.accountError = '';
    if (!this.isDetailsStepValid || !this.isAccountStepValid || this.isSubmitting) return;

    this.isSubmitting = true;
    try {
      await this.auth.register({
        firstName: this.firstName,
        lastName: this.lastName,
        username: this.username,
        contact: this.emailOrNumber,
        password: this.password,
      });
      this.created = true;
    } catch (error) {
      if (error instanceof AuthError && error.code === 'account_exists') this.accountError = error.message;
      else if (error instanceof AuthError && error.code === 'network') this.accountError = 'We could not reach the sign-up service. Check your connection and try again.';
      else this.accountError = error instanceof AuthError ? error.message : 'Your account could not be created. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  goToHome() {
    void this.router.navigateByUrl('/home');
  }

  goToLogin() {
    void this.router.navigateByUrl('/login');
  }
}
