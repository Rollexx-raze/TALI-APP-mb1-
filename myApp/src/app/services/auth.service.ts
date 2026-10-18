import { Injectable, inject } from '@angular/core';
import { Account, AccountService } from './account.service';

export type AuthErrorCode = 'invalid_input' | 'invalid_credentials' | 'account_exists' | 'network';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface RegistrationDetails {
  firstName: string;
  lastName: string;
  username: string;
  contact: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accounts = inject(AccountService);

  // Mock provider boundary: replace these local AccountService calls with the real API adapter
  // while preserving this login/register/logout/getSession interface.
  async login(identifier: string, password: string): Promise<Account> {
    const contact = identifier.trim();
    if (!contact || !password) throw new AuthError('invalid_input', 'Enter your sign-in details.');
    if (!isValidContact(contact)) throw new AuthError('invalid_input', 'Enter a valid email address or phone number.');

    const account = this.accounts.authenticate(contact, password);
    if (!account) throw new AuthError('invalid_credentials', 'That account does not exist or the password is incorrect.');

    this.accounts.selectAccount(account);
    return account;
  }

  async register(details: RegistrationDetails): Promise<Account> {
    const firstName = details.firstName.trim();
    const lastName = details.lastName.trim();
    const username = details.username.trim().replace(/^@+/, '');
    const contact = details.contact.trim();
    if (!firstName || !lastName || !isValidUsername(username) || !isValidContact(contact) || details.password.length < 8) {
      throw new AuthError('invalid_input', 'Check the account details and try again.');
    }

    const account = this.accounts.createAccount(firstName, lastName, username, contact, details.password);
    if (!account) throw new AuthError('account_exists', 'That username or email/number is already in use.');
    return account;
  }

  async logout(): Promise<void> {
    this.accounts.logout();
  }

  getSession(): Account | null {
    return this.accounts.selectedAccount();
  }
}

export function isValidContact(contact: string) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return true;
  const digits = contact.replace(/\D/g, '');
  return /^[+\d\s().-]+$/.test(contact) && digits.length >= 7 && digits.length <= 15;
}

export function isValidUsername(username: string) {
  return /^[a-z0-9._]{3,30}$/i.test(username);
}
