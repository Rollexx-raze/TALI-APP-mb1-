import { Routes } from '@angular/router';
import { guestOnlyGuard, requireAuthGuard } from './auth.guards';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'create-account',
    loadComponent: () => import('./pages/create-account/create-account.page').then((m) => m.CreateAccountPage),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'select-account',
    loadComponent: () => import('./pages/select-account/select-account.page').then((m) => m.SelectAccountPage),
  },
  {
    path: 'more-accounts',
    loadComponent: () => import('./pages/more-accounts/more-accounts.page').then((m) => m.MoreAccountsPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'search',
    loadComponent: () => import('./pages/search/search.page').then((m) => m.SearchPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages/messages.page').then((m) => m.MessagesPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'add-post',
    loadComponent: () => import('./pages/add-post/add-post.page').then((m) => m.AddPostPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'activity',
    loadComponent: () => import('./pages/suggestions/suggestions.page').then((m) => m.SuggestionsPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'groups/create',
    loadComponent: () => import('./pages/groups/create-group.page').then((m) => m.CreateGroupPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'groups/:groupId',
    loadComponent: () => import('./pages/groups/group-detail.page').then((m) => m.GroupDetailPage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'groups',
    loadComponent: () => import('./pages/groups/groups.page').then((m) => m.GroupsPage),
    canActivate: [requireAuthGuard],
  },
  { path: 'suggestions', redirectTo: 'activity', pathMatch: 'full' },
  {
    path: 'profile/:accountId',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
    canActivate: [requireAuthGuard],
  },
  { path: 'not-found', loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage) },
  { path: '**', redirectTo: 'not-found' },
];
