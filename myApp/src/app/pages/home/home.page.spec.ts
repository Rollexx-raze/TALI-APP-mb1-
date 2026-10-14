import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../services/account.service';
import { Group } from '../../services/group.service';
import { Post } from '../../services/post.service';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('includes public and member-visible group posts but hides private posts from nonmembers', () => {
    const viewer = makeAccount(10);
    component.accountService.selectedAccount.set(viewer);
    component.accountService.accounts.set([viewer]);
    component.groupService.groups.set([
      makeGroup('public-group', 'public', [20]),
      makeGroup('private-member-group', 'private', [10, 20]),
      makeGroup('private-outsider-group', 'private', [20]),
    ]);
    component.postService.posts.set([
      makeGroupPost('public-post', 'public-group'),
      makeGroupPost('private-member-post', 'private-member-group'),
      makeGroupPost('private-outsider-post', 'private-outsider-group'),
    ]);

    expect(component.feedPosts.map((post) => post.id)).toEqual(['public-post', 'private-member-post']);
  });
});

function makeAccount(id: number): Account {
  return {
    id,
    name: `Account ${id}`,
    username: `@account${id}`,
    contact: `account${id}@example.com`,
    password: 'test',
    bio: '',
    followersIds: [],
    followingIds: [],
  };
}

function makeGroup(id: string, privacy: Group['privacy'], memberIds: number[]): Group {
  return {
    id,
    name: id,
    nameLower: id,
    description: '',
    privacy,
    adminId: 20,
    moderatorIds: [],
    memberIds,
    pendingRequests: [],
    createdAt: new Date(),
  };
}

function makeGroupPost(id: string, groupId: string): Post {
  return {
    id,
    authorId: 20,
    groupId,
    authorName: 'Group author',
    authorUsername: '@author',
    body: id,
    attachments: [],
    audience: 'only-me',
    audienceAccountIds: [],
    likes: [],
    comments: [],
    reposts: [],
    createdAt: new Date(),
  };
}
