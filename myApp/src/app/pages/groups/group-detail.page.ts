import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AlertController, IonAvatar, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonProgressBar, IonSpinner, IonTextarea, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, ellipsisVertical, imageOutline, linkOutline, personCircleOutline, playOutline, videocamOutline } from 'ionicons/icons';
import { PostCardComponent } from '../../components/post-card/post-card.component';
import { Group, GroupService } from '../../services/group.service';
import { Account, AccountService } from '../../services/account.service';
import { PostAttachment, PostService } from '../../services/post.service';
import { MediaAttachmentService } from '../../services/media-attachment.service';

interface PendingMediaUpload {
  file: File;
  previewUrl: string;
  progress: number;
}

@Component({
  standalone: true,
  selector: 'app-group-detail',
  templateUrl: './group-detail.page.html',
  styleUrls: ['./groups.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink, IonAvatar, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonProgressBar, IonSpinner, IonTextarea, IonTitle, IonToolbar, PostCardComponent],
})
export class GroupDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly groupService = inject(GroupService);
  readonly accountService = inject(AccountService);
  readonly postService = inject(PostService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly mediaAttachmentService = inject(MediaAttachmentService);
  activeTab: 'posts' | 'about' | 'members' = 'posts';
  postDraft = '';
  postError = '';
  postAttachments: PostAttachment[] = [];
  pendingMediaUploads: PendingMediaUpload[] = [];
  mediaError = '';
  mediaUploading = false;
  mediaUploadProgress = 0;
  showGroupMenu = false;

  constructor() {
    addIcons({ closeOutline, ellipsisVertical, imageOutline, linkOutline, personCircleOutline, playOutline, videocamOutline });
  }

  ngOnInit() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    console.log('Group membership check', {
      groupId: group?.id,
      userId,
      member: !!group && userId !== undefined && group.memberIds.includes(userId),
    });
  }

  ngOnDestroy() {
    this.clearPendingMediaUploads();
  }

  get group(): Group | null {
    const groupId = this.route.snapshot.paramMap.get('groupId');
    return groupId ? this.groupService.getGroupById(groupId) : null;
  }

  get isGroupAdmin() {
    return this.group?.adminId === this.accountService.selectedAccount()?.id;
  }

  get isGroupModerator() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    return !!group && userId !== undefined && !this.isGroupAdmin && group.moderatorIds.includes(userId);
  }

  get canUseGroupMenu() {
    return this.isGroupAdmin || this.isGroupModerator || this.isGroupMember;
  }

  get isGroupMember() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    return !!group && userId !== undefined && group.memberIds.includes(userId);
  }

  get canPost() {
    return !!this.accountService.selectedAccount() && this.isGroupMember;
  }

  get canViewPosts() {
    const group = this.group;
    return !!group && (group.privacy === 'public' || this.isGroupMember);
  }

  get isJoinRequested() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    return !!group && userId !== undefined && group.pendingRequests.includes(userId);
  }

  get groupPosts() {
    const groupId = this.group?.id;
    return groupId ? this.postService.posts().filter((post) => post.groupId === groupId) : [];
  }

  get groupMembers() {
    const group = this.group;
    if (!group) return [];
    return group.memberIds
      .map((id) => this.accountService.accounts().find((account) => account.id === id))
      .filter((account) => account !== undefined);
  }

  canViewMemberPhoto(member: Account) {
    return this.accountService.canViewProfileImage(member, this.accountService.selectedAccount());
  }

  setTab(tab: 'posts' | 'about' | 'members') {
    this.activeTab = tab;
    this.showGroupMenu = false;
  }

  toggleGroupMenu() {
    if (!this.groupService.loading() && !this.canUseGroupMenu) return;
    this.showGroupMenu = !this.showGroupMenu;
  }

  async joinOrRequest() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    if (!group || userId === undefined) {
      await this.showToast('Select an account before joining a group.', 'danger');
      return;
    }
    const updated = group.privacy === 'private'
      ? this.groupService.requestToJoin(group.id, userId)
      : this.groupService.joinGroup(group.id, userId);
    console.log('Group membership check', { groupId: group.id, userId, member: group.memberIds.includes(userId), updated });
    if (!updated) {
      await this.showToast('Could not update group membership. Please try again.', 'danger');
      return;
    }
    await this.showToast(group.privacy === 'private' ? 'Join request sent' : 'Joined group');
  }

  async leaveGroup() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    if (!group || userId === undefined) return;
    if (!this.groupService.leaveGroup(group.id, userId)) {
      await this.showToast('Could not leave group. Admins cannot leave their group.', 'danger');
      return;
    }
    await this.showToast('Left group');
  }

  async onPostFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.mediaError = '';
    this.postError = '';
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
      this.mediaError = 'Choose image or video files only.';
      await this.showToast(this.mediaError, 'danger');
      return;
    }
    if (this.postAttachments.some((attachment) => attachment.type.startsWith('video/')) &&
      files.some((file) => file.type.startsWith('video/'))) {
      this.mediaError = 'Attach one video per post.';
      await this.showToast(this.mediaError, 'danger');
      return;
    }

    this.mediaUploading = true;
    this.mediaUploadProgress = 0;
    this.pendingMediaUploads = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
    }));
    try {
      const { attachments, errors } = await this.mediaAttachmentService.readAttachments(files, (progress) => {
        this.mediaUploadProgress = progress;
      }, (fileIndex, progress) => {
        this.pendingMediaUploads = this.pendingMediaUploads.map((upload, index) =>
          index === fileIndex ? { ...upload, progress } : upload);
      });
      this.postAttachments = [...this.postAttachments, ...attachments];
      this.mediaError = errors.join(' ');
      if (this.mediaError) await this.showToast(this.mediaError, 'danger');
    } catch (error) {
      console.error('Could not upload group post attachments.', error);
      this.mediaError = 'Could not upload attachments. Please try again.';
      await this.showToast(this.mediaError, 'danger');
    } finally {
      this.mediaUploading = false;
      this.mediaUploadProgress = 0;
      this.clearPendingMediaUploads();
    }
  }

  private clearPendingMediaUploads() {
    this.pendingMediaUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
    this.pendingMediaUploads = [];
  }

  removePostAttachment(index: number) {
    this.postAttachments = this.postAttachments.filter((_, attachmentIndex) => attachmentIndex !== index);
    this.mediaError = '';
  }

  async addGroupLink() {
    const alert = await this.alertController.create({
      header: 'Add a link',
      inputs: [{ name: 'url', type: 'url', placeholder: 'https://example.com' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Add link', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values?: { url?: string } }>();
    const link = data?.values?.url?.trim();
    if (role !== 'confirm' || !link) return;

    try {
      const parsed = new URL(link);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Unsupported link protocol.');
    } catch {
      this.mediaError = 'Enter a valid web link beginning with http:// or https://.';
      await this.showToast(this.mediaError, 'danger');
      return;
    }

    this.postDraft = `${this.postDraft.trim()}${this.postDraft.trim() ? '\n' : ''}${link}`;
    this.mediaError = '';
  }

  async submitGroupPost() {
    const group = this.group;
    const account = this.accountService.selectedAccount();
    const body = this.postDraft.trim();
    if (this.mediaUploading || !group || !account || (!body && !this.postAttachments.length) || !this.canPost) return;

    try {
      const post = this.postService.addGroupPost({
        authorId: account.id,
        groupId: group.id,
        authorName: account.name,
        authorUsername: account.username,
        body,
        attachments: [...this.postAttachments],
        audience: 'public',
        audienceAccountIds: [],
      }, account, this.accountService.accounts());
      console.log('Group post saved', { groupId: group.id, postId: post.id });
      this.postDraft = '';
      this.postAttachments = [];
      this.postError = '';
    } catch (error) {
      console.error('Could not save group post.', error);
      this.postError = 'Could not save your post. Please try again.';
      await this.showToast(this.postError, 'danger');
    }
  }

  async editGroup() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    if (!group || userId === undefined || !this.isGroupAdmin) return;
    this.showGroupMenu = false;
    const alert = await this.alertController.create({
      header: 'Edit group',
      inputs: [
        { name: 'name', type: 'text', value: group.name, placeholder: 'Group name' },
        { name: 'description', type: 'textarea', value: group.description, placeholder: 'Description' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values?: { name?: string; description?: string } }>();
    if (role !== 'confirm') return;
    const values = data?.values;
    if (!values?.name?.trim()) {
      await this.showToast('Enter a group name.', 'danger');
      return;
    }
    if (!this.groupService.updateGroupInfo(group.id, userId, values.name, values.description ?? '')) {
      await this.showToast('Could not update group information.', 'danger');
      return;
    }
    await this.showToast('Group updated');
  }

  manageMembers() {
    if (!this.canModerateGroup()) return;
    this.setTab('members');
  }

  async removeGroupMember(userId: number) {
    const group = this.group;
    const actorId = this.accountService.selectedAccount()?.id;
    if (!group || actorId === undefined || !this.isGroupAdmin || group.adminId === userId) return;
    if (!this.groupService.removeMember(group.id, actorId, userId)) {
      await this.showToast('Could not remove this member.', 'danger');
      return;
    }
    await this.showToast('Member removed');
  }

  async manageJoinRequests() {
    const group = this.group;
    if (!group || !this.canModerateGroup()) return;
    this.showGroupMenu = false;
    const requests = [...group.pendingRequests];
    if (!requests.length) {
      await this.showToast('There are no pending join requests.');
      return;
    }
    for (const userId of requests) {
      const person = this.accountService.accounts().find((account) => account.id === userId);
      const name = person?.name ?? `Account ${userId}`;
      const alert = await this.alertController.create({
        header: 'Join request',
        message: `${name} wants to join ${group.name}.`,
        buttons: [
          { text: 'Decline', role: 'decline' },
          { text: 'Approve', role: 'approve' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      const actorId = this.accountService.selectedAccount()?.id;
      if (actorId === undefined) return;
      if (role === 'approve' && !this.groupService.approveRequest(group.id, actorId, userId)) {
        await this.showToast(`Could not approve ${name}'s request.`, 'danger');
      } else if (role === 'decline' && !this.groupService.declineRequest(group.id, actorId, userId)) {
        await this.showToast(`Could not decline ${name}'s request.`, 'danger');
      }
    }
  }

  async leaveGroupFromMenu() {
    if (!this.isGroupMember || this.isGroupAdmin) return;
    this.showGroupMenu = false;
    await this.leaveGroup();
  }

  private canModerateGroup() {
    const group = this.group;
    const userId = this.accountService.selectedAccount()?.id;
    return !!group && userId !== undefined && this.groupService.canModerate(group, userId);
  }

  async confirmDeleteGroup() {
    const group = this.group;
    if (!group || !this.isGroupAdmin) return;
    this.showGroupMenu = false;
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
      await this.router.navigateByUrl('/groups');
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
