import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'create-account',
    loadComponent: () =>
      import('./pages/create-account/create-account.page').then((m) => m.CreateAccountPage),
  },
  {
    path: 'select-account',
    loadComponent: () =>
      import('./pages/select-account/select-account.page').then((m) => m.SelectAccountPage),
  },
  {
    path: 'more-accounts',
    loadComponent: () =>
      import('./pages/more-accounts/more-accounts.page').then((m) => m.MoreAccountsPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'search',
    loadComponent: () => import('./pages/search/search.page').then((m) => m.SearchPage),
  },
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages/messages.page').then((m) => m.MessagesPage),
  },
  {
    path: 'add-post',
    loadComponent: () => import('./pages/add-post/add-post.page').then((m) => m.AddPostPage),
  },
  {
    path: 'activity',
    loadComponent: () => import('./pages/suggestions/suggestions.page').then((m) => m.SuggestionsPage),
  },
  { path: 'groups/create', loadComponent: () => import('./pages/groups/create-group.page').then((m) => m.CreateGroupPage) },
  { path: 'groups/:groupId', loadComponent: () => import('./pages/groups/group-detail.page').then((m) => m.GroupDetailPage) },
  { path: 'groups', loadComponent: () => import('./pages/groups/groups.page').then((m) => m.GroupsPage) },
  { path: 'suggestions', redirectTo: 'activity', pathMatch: 'full' },
  {
    path: 'profile/:accountId',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
];
