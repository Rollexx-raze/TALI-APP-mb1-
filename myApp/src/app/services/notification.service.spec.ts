import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let notifications: NotificationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [NotificationService] });
    notifications = TestBed.inject(NotificationService);
  });

  it('marks notifications read and clears only the selected account list', () => {
    const actor = { id: 1, name: 'Rae Santos', username: '@rae.santos' };
    notifications.notifyFollow(actor, 2);
    notifications.notifyFollow(actor, 3);

    const accountTwo = notifications.forAccount(2)[0];
    expect(notifications.unreadCount(2)).toBe(1);
    notifications.markRead(accountTwo.id, 2);
    expect(notifications.unreadCount(2)).toBe(0);

    notifications.clearForAccount(2);
    expect(notifications.forAccount(2)).toHaveLength(0);
    expect(notifications.forAccount(3)).toHaveLength(1);
  });
});
