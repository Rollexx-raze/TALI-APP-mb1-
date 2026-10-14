import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { imageOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { GroupService } from '../../services/group.service';

@Component({
  standalone: true,
  selector: 'app-create-group',
  templateUrl: './create-group.page.html',
  styleUrls: ['./create-group.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonBackButton, IonButton, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar],
})
export class CreateGroupPage {
  readonly accountService = inject(AccountService);
  private readonly groupService = inject(GroupService);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  name = '';
  description = '';
  photo?: string;
  photoError = '';
  submitAttempted = false;
  saving = false;

  constructor() {
    addIcons({ imageOutline });
  }

  get nameError() {
    return this.submitAttempted && !this.name.trim();
  }

  get accountError() {
    return this.submitAttempted && !this.accountService.selectedAccount();
  }

  async onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.photoError = 'Choose an image file for the group photo.';
      return;
    }
    try {
      this.photo = await this.readPhoto(file);
      this.photoError = '';
    } catch (error) {
      console.error('Could not read the selected group photo.', error);
      this.photoError = 'The group photo could not be loaded. Please try another image.';
    }
  }

  removePhoto() {
    this.photo = undefined;
    this.photoError = '';
  }

  async submit() {
    if (this.saving) return;
    this.submitAttempted = true;
    const account = this.accountService.selectedAccount();
    if (!this.name.trim() || !account) return;
    this.saving = true;
    try {
      const group = await this.groupService.createGroup(this.name, this.description, this.photo, account);
      console.log('Redirecting to created group', { groupId: group.id });
      await this.showToast('Group created');
      await this.router.navigate(['/groups', group.id], { replaceUrl: true });
    } catch (error) {
      console.error('Could not create group.', error);
      await this.showToast('Could not save group. Please try again.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({ message, duration: 2200, color });
    await toast.present();
  }

  private readPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
