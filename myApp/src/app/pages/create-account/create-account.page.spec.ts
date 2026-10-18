import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { CreateAccountPage } from './create-account.page';

describe('CreateAccountPage flow state', () => {
  let fixture: ComponentFixture<CreateAccountPage>;
  let page: CreateAccountPage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(CreateAccountPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('requires a valid contact, strong password, and matching confirmation before Next enables', () => {
    page.username = 'rae.santos';
    page.emailOrNumber = 'rae@example.com';
    page.password = 'short';
    page.confirmPassword = 'short';
    expect(page.isAccountStepValid).toBe(false);
    page.password = 'long-enough-123';
    expect(page.isAccountStepValid).toBe(false);
    page.confirmPassword = 'long-enough-123';
    expect(page.isAccountStepValid).toBe(true);
  });

  it('moves to Details and Back preserves the entered account fields', () => {
    page.username = 'rae.santos';
    page.emailOrNumber = 'rae@example.com';
    page.password = 'long-enough-123';
    page.confirmPassword = 'long-enough-123';
    page.nextStep();
    expect(page.step).toBe(2);
    page.firstName = 'Rae';
    page.lastName = 'Santos';

    page.goBackStep();
    expect(page.step).toBe(1);
    expect(page.username).toBe('rae.santos');
    expect(page.password).toBe('long-enough-123');
    expect(page.firstName).toBe('Rae');
  });

  it('advances from the actual Next control when the account fields are valid', () => {
    page.username = 'rae.santos';
    page.emailOrNumber = 'rae@example.com';
    page.password = 'long-enough-123';
    page.confirmPassword = 'long-enough-123';
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelector('.signup-actions .create-account-button') as HTMLIonButtonElement;
    expect(nextButton.disabled).toBe(false);
    nextButton.click();
    fixture.detectChanges();

    expect(page.step).toBe(2);
  });

  it('keeps Next actionable and validates the first step before advancing', () => {
    page.username = 'rae.santos';
    page.emailOrNumber = 'not-a-contact';
    page.password = 'long-enough-123';
    page.confirmPassword = 'long-enough-123';
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelector('.signup-actions .create-account-button') as HTMLIonButtonElement;
    expect(nextButton.disabled).toBe(false);
    nextButton.click();
    fixture.detectChanges();

    expect(page.submitted).toBe(true);
    expect(page.step).toBe(1);
    expect(page.contactError).toContain('valid email address or phone number');
  });

  it('completes the Details and Done steps, signs in, and routes home', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    page.username = 'rae.santos';
    page.emailOrNumber = 'rae@example.com';
    page.password = 'long-enough-123';
    page.confirmPassword = 'long-enough-123';
    page.nextStep();
    page.firstName = 'Rae';
    page.lastName = 'Santos';

    await page.createAccount();

    expect(page.created).toBe(true);
    expect(page.activeStep).toBe(3);
    expect(TestBed.inject(AuthService).getSession()?.contact).toBe('rae@example.com');
    expect(navigate).toHaveBeenCalledWith('/home');
  });
});
