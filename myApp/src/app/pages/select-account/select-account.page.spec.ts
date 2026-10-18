import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '../../services/account.service';
import { SelectAccountPage } from './select-account.page';

describe('SelectAccountPage', () => {
  let component: SelectAccountPage;
  let fixture: ComponentFixture<SelectAccountPage>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SelectAccountPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('selects a saved account and prepares its identifier for sign-in', () => {
    const accounts = TestBed.inject(AccountService);
    const router = TestBed.inject(Router);
    const account = accounts.createAccount('Rae', 'Santos', 'rae.santos', 'rae@example.com', 'strong-pass-123');
    expect(account).not.toBeNull();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.chooseAccount(account!);

    expect(accounts.consumeAccountLoginPrefill()?.id).toBe(account!.id);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
