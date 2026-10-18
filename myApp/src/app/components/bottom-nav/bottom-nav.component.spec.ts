import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../services/account.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';
import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent route selection', () => {
  let currentUrl = '/home';
  let nav: BottomNavComponent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { get url() { return currentUrl; } } },
        AccountService,
        NotificationService,
        ViewStateService,
      ],
    });
    currentUrl = '/home';
    nav = TestBed.createComponent(BottomNavComponent).componentInstance;
  });

  it('highlights the route tab for home, explore/search, nested profile, and notifications', () => {
    currentUrl = '/home';
    expect(nav.tabs.filter((tab) => nav.isActive(tab)).map((tab) => tab.key)).toEqual(['home']);

    currentUrl = '/search';
    expect(nav.tabs.filter((tab) => nav.isActive(tab)).map((tab) => tab.key)).toEqual(['explore']);

    currentUrl = '/add-post';
    expect(nav.tabs.filter((tab) => nav.isActive(tab)).map((tab) => tab.key)).toEqual(['create']);

    currentUrl = '/profile/42';
    expect(nav.tabs.filter((tab) => nav.isActive(tab)).map((tab) => tab.key)).toEqual(['profile']);

    currentUrl = '/activity?section=notifications';
    expect(nav.tabs.filter((tab) => nav.isActive(tab)).map((tab) => tab.key)).toEqual(['activity']);
  });

  it('treats home as exact and matches settings to profile', () => {
    currentUrl = '/home/settings';
    expect(nav.tabs.some((tab) => tab.key === 'home' && nav.isActive(tab))).toBe(false);
    currentUrl = '/settings';
    expect(nav.tabs.some((tab) => tab.key === 'profile' && nav.isActive(tab))).toBe(true);
  });
});
