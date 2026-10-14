import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonAvatar, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonSearchbar, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, chatbubbleOutline, homeOutline, notificationsOutline, peopleOutline, personCircleOutline, searchOutline, trendingUpOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { GroupService } from '../../services/group.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';

@Component({
  selector: 'app-search',
  standalone: true,
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  imports: [FormsModule, RouterLink, IonAvatar, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonSearchbar, IonToolbar],
})
export class SearchPage {
  private readonly stateKey = 'tali-view-search';
  readonly accountService = inject(AccountService);
  readonly groupService = inject(GroupService);
  readonly notificationService = inject(NotificationService);
  readonly viewState = inject(ViewStateService);
  query = '';
  activeFilter: 'all' | 'people' | 'groups' = 'all';
  readonly topics = ['Good questions', 'Creative practice', 'Daily reflections', 'Community care'];

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;
    return accountId === undefined ? 0 : this.notificationService.unreadCount(accountId);
  }

  constructor() {
    addIcons({ addCircle, chatbubbleOutline, homeOutline, notificationsOutline, peopleOutline, personCircleOutline, searchOutline, trendingUpOutline });
    this.query = this.viewState.read(this.stateKey, '');
  }

  setQuery(query: string) {
    this.query = query;
    this.viewState.write(this.stateKey, query);
  }

  setFilter(filter: 'all' | 'people' | 'groups') {
    this.activeFilter = filter;
  }

  get filteredPeople() {
    const query = this.query.trim().toLowerCase();
    const selectedId = this.accountService.selectedAccount()?.id;
    return this.accountService.accounts()
      .filter((person) => person.id !== selectedId)
      .filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(query));
  }

  get filteredTopics() {
    const query = this.query.trim().toLowerCase();
    return this.topics.filter((topic) => topic.toLowerCase().includes(query));
  }

  get filteredGroups() {
    const query = this.query.trim().toLocaleLowerCase();
    return this.groupService.getGroups().filter((group) =>
      !query || group.nameLower.includes(query) || group.description.toLocaleLowerCase().includes(query),
    );
  }

  profileImageFor(personId: number) {
    const person = this.accountService.accounts().find((account) => account.id === personId);
    return person && this.accountService.canViewProfileImage(person, this.accountService.selectedAccount())
      ? person.profileImage
      : undefined;
  }
}
