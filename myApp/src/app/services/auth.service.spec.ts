import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from './account.service';
import { AuthError, AuthService, isValidContact } from './auth.service';

describe('AuthService local mock', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [AccountService, AuthService] });
    auth = TestBed.inject(AuthService);
  });

  it('registers, signs in, and restores the current session', async () => {
    const account = await auth.register({
      firstName: 'Rae',
      lastName: 'Santos',
      username: 'rae.santos',
      contact: 'rae@example.com',
      password: 'strong-pass-123',
    });

    expect(auth.getSession()?.id).toBe(account.id);
    await auth.logout();
    expect(auth.getSession()).toBeNull();

    await expect(auth.login('RAE@example.com', 'strong-pass-123')).resolves.toMatchObject({ id: account.id });
    expect(auth.getSession()?.id).toBe(account.id);
  });

  it('rejects invalid credentials and duplicate registrations with useful error codes', async () => {
    await expect(auth.login('rae@example.com', 'wrong-password')).rejects.toMatchObject({ code: 'invalid_credentials' });
    const details = { firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'strong-pass-123' };
    await auth.register(details);
    await expect(auth.register(details)).rejects.toMatchObject({ code: 'account_exists' });
  });

  it('rejects malformed contacts and weak passwords before creating an account', async () => {
    expect(isValidContact('rae@example.com')).toBe(true);
    expect(isValidContact('+1 (555) 555-1234')).toBe(true);
    expect(isValidContact('not-an-address')).toBe(false);
    await expect(auth.register({
      firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'short',
    })).rejects.toBeInstanceOf(AuthError);
  });

  it('restores the session from browser storage after service recreation', async () => {
    const account = await auth.register({
      firstName: 'Rae', lastName: 'Santos', username: 'rae.santos', contact: 'rae@example.com', password: 'strong-pass-123',
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AccountService, AuthService] });
    const restoredAuth = TestBed.inject(AuthService);
    expect(restoredAuth.getSession()?.id).toBe(account.id);
  });
});
