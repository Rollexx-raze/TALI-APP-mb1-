import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonSearchbar, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';
import { Group, GroupService } from '../../services/group.service';
import { AccountService } from '../../services/account.service';

@Component({
  standalone: true,
  selector: 'app-groups',
  templateUrl: './groups.page.html',
  styleUrls: ['./groups.page.scss'],
  imports: [CommonModule, RouterLink, IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonSearchbar, IonTitle, IonToolbar],
})
export class GroupsPage {
  readonly groupService = inject(GroupService);
  readonly accountService = inject(AccountService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  activeTab: 'discover' | 'mine' = 'mine';
  query = '';

  constructor() {
    addIcons({ trashOutline });
    effect(() => {
      const error = this.groupService.loadError();
      if (error) void this.showToast(error, 'danger');
    });
  }

  get groups(): Group[] {
    return this.groupService.getGroups();
  }

  get visibleGroups(): Group[] {
    const userId = this.accountService.selectedAccount()?.id;
    if (userId === undefined) return [];
    return this.groupService.searchGroups(this.query, userId, this.activeTab);
  }

  setTab(tab: 'discover' | 'mine') {
    this.activeTab = tab;
  }

  updateQuery(value: string | null | undefined) {
    this.query = value ?? '';
    console.log('Group search query', {
      query: this.query.trim().toLocaleLowerCase(),
      tab: this.activeTab,
      resultCount: this.visibleGroups.length,
    });
  }

  groupAdminName(group: Group) {
    return this.accountService.accounts().find((account) => account.id === group.adminId)?.name ?? 'Group admin';
  }

  isGroupAdmin(group: Group) {
    return group.adminId === this.accountService.selectedAccount()?.id;
  }

  isGroupMember(group: Group) {
    const userId = this.accountService.selectedAccount()?.id;
    return userId !== undefined && group.memberIds.includes(userId);
  }

  isJoinRequested(group: Group) {
    const userId = this.accountService.selectedAccount()?.id;
    return userId !== undefined && group.pendingRequests.includes(userId);
  }

  async handleGroupAction(group: Group) {
    const userId = this.accountService.selectedAccount()?.id;
    if (userId === undefined) {
      await this.showToast('Select an account before joining a group.', 'danger');
      return;
    }
    const updated = group.privacy === 'private'
      ? this.groupService.requestToJoin(group.id, userId)
      : this.groupService.joinGroup(group.id, userId);
    if (!updated) {
      await this.showToast(group.privacy === 'private' ? 'Could not request to join this group.' : 'Could not join this group.', 'danger');
      return;
    }
    await this.showToast(group.privacy === 'private' ? 'Join request sent' : 'Joined group');
  }

  async confirmDeleteGroup(group: Group) {
    const alert = await this.alertController.create({
      header: 'Delete group?',
      message: 'Delete this group? This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;

    try {
      const userId = this.accountService.selectedAccount()?.id;
      if (userId === undefined || !this.groupService.deleteGroup(group.id, userId)) throw new Error('Group is no longer available.');
      await this.showToast('Group deleted');
    } catch (error) {
      console.error('Could not delete group.', error);
      await this.showToast('Could not delete group. Please try again.', 'danger');
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({ message, duration: 2200, color });
    await toast.present();
  }
}
