import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AccountService, AuthService],
    });
    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('prefills the selected account contact and saved password when the login page initializes', async () => {
    const auth = TestBed.inject(AuthService);
    const account = await auth.register({
      firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'strong-pass-123',
    });
    const accounts = TestBed.inject(AccountService);
    accounts.prepareAccountLogin(account);
    fixture.destroy();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.identifier).toBe('rae@example.com');
    expect(component.password).toBe('strong-pass-123');
  });

  it('signs in a valid local account and routes home', async () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const account = await auth.register({
      firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'strong-pass-123',
    });
    await auth.logout();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.identifier = 'rae@example.com';
    component.password = 'strong-pass-123';

    await component.logIn();

    expect(auth.getSession()?.id).toBe(account.id);
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(component.errorMessage).toBe('');
  });

  it('shows an inline error for invalid credentials without navigating', async () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    await auth.register({
      firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'strong-pass-123',
    });
    await auth.logout();
    const navigate = vi.spyOn(router, 'navigateByUrl');
    component.identifier = 'rae@example.com';
    component.password = 'wrong-password';

    await component.logIn();

    expect(component.errorMessage).toContain('password is incorrect');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('toggles password visibility state from the show/hide control', () => {
    const toggle = fixture.nativeElement.querySelector('.login-password-toggle') as HTMLButtonElement;
    expect(component.showPassword).toBe(false);

    toggle.click();
    fixture.detectChanges();
    expect(component.showPassword).toBe(true);

    toggle.click();
    fixture.detectChanges();
    expect(component.showPassword).toBe(false);
  });
});
