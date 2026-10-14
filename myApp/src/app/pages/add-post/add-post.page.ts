import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonTextarea, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, attachOutline, chatbubbleOutline, checkmarkOutline, closeCircleOutline, closeOutline, documentOutline, ellipsisVertical, homeOutline, micOutline, notificationsOutline, personCircleOutline, trendingUpOutline, videocamOutline } from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { PostAttachment, PostAudience, PostService } from '../../services/post.service';
import { MediaAttachmentService } from '../../services/media-attachment.service';
import { loadBrowserData, saveBrowserData, deleteBrowserData } from '../../services/browser-data.store';
import { ViewStateService } from '../../services/view-state.service';

interface PostDraft {
  message: string;
  pendingAttachments: PostAttachment[];
  audience: PostAudience;
  audienceAccountIds: number[];
  showAudienceMenu: boolean;
  showAudiencePicker: boolean;
}

const postDraftKey = 'tali-post-draft';
function isPostDraft(value: unknown): value is PostDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<PostDraft>;
  return typeof draft.message === 'string' && Array.isArray(draft.pendingAttachments) &&
    ['public', 'friends', 'friends-of-friends', 'selected-friends', 'hide-from', 'only-me'].includes(String(draft.audience)) &&
    Array.isArray(draft.audienceAccountIds);
}

@Component({
  selector: 'app-add-post',
  standalone: true,
  templateUrl: './add-post.page.html',
  styleUrls: ['./add-post.page.scss'],
  imports: [FormsModule, RouterLink, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonTextarea, IonToolbar],
})
export class AddPostPage {
  readonly accountService = inject(AccountService);
  private readonly postService = inject(PostService);
  private readonly mediaAttachmentService = inject(MediaAttachmentService);
  private readonly router = inject(Router);
  readonly viewState = inject(ViewStateService);
  message = '';
  publishError = '';
  pendingAttachments: PostAttachment[] = [];
  mediaError = '';
  mediaUploading = false;
  mediaUploadProgress = 0;
  showAudienceMenu = false;
  showAudiencePicker = false;
  audience: PostAudience = 'public';
  audienceAccountIds: number[] = [];
  private draftReady = false;
  private draftEdited = false;
  private draftSaveQueue: Promise<void> = Promise.resolve();
  readonly audienceOptions: { value: PostAudience; label: string }[] = [
    { value: 'public', label: 'Public' },
    { value: 'friends', label: 'Friends' },
    { value: 'friends-of-friends', label: 'Friends of Friends' },
    { value: 'selected-friends', label: 'Select Friends' },
    { value: 'hide-from', label: 'Hide From' },
    { value: 'only-me', label: 'Only Me' },
  ];

  constructor() {
    addIcons({ addCircle, attachOutline, chatbubbleOutline, checkmarkOutline, closeCircleOutline, closeOutline, documentOutline, ellipsisVertical, homeOutline, micOutline, notificationsOutline, personCircleOutline, trendingUpOutline, videocamOutline });
    void loadBrowserData<PostDraft | null>(postDraftKey, null, (value): value is PostDraft | null => value === null || isPostDraft(value)).then((draft) => {
      if (!this.draftEdited && draft) {
        this.message = draft.message;
        this.pendingAttachments = draft.pendingAttachments;
        this.audience = draft.audience;
        this.audienceAccountIds = draft.audienceAccountIds;
        this.showAudienceMenu = draft.showAudienceMenu;
        this.showAudiencePicker = draft.showAudiencePicker;
      }
      this.draftReady = true;
      if (this.draftEdited) this.persistDraft();
    });
  }

  onDraftTextChange() {
    this.publishError = '';
    this.persistDraft();
  }

  persistDraft() {
    this.draftEdited = true;
    if (!this.draftReady) return;
    const snapshot: PostDraft = {
      message: this.message, pendingAttachments: [...this.pendingAttachments], audience: this.audience,
      audienceAccountIds: [...this.audienceAccountIds], showAudienceMenu: this.showAudienceMenu,
      showAudiencePicker: this.showAudiencePicker,
    };
    this.draftSaveQueue = this.draftSaveQueue.then(() => saveBrowserData(postDraftKey, snapshot));
  }

  private clearDraft() {
    this.draftReady = false;
    this.draftEdited = false;
    this.draftSaveQueue = this.draftSaveQueue.then(() => deleteBrowserData(postDraftKey));
  }

  get canPublish() {
    const hasContent = this.message.trim() || this.pendingAttachments.length;
    const hasSelectedAudience = this.audience !== 'selected-friends' || this.audienceAccountIds.length > 0;
    return Boolean(this.accountService.selectedAccount() && hasContent && hasSelectedAudience);
  }

  get audienceAccounts() {
    const selectedId = this.accountService.selectedAccount()?.id;
    return this.accountService.accounts().filter((account) => account.id !== selectedId);
  }

  get audienceAccountPrompt() {
    return this.audience === 'hide-from' ? 'Choose who to hide this post from' : 'Choose friends who can see this post';
  }

  get selectedAudienceLabel() {
    return this.audienceOptions.find((option) => option.value === this.audience)?.label ?? 'Public';
  }

  selectAudience(audience: PostAudience) {
    this.publishError = '';
    if (this.audience !== audience) this.audienceAccountIds = [];
    this.audience = audience;
    this.showAudienceMenu = false;
    this.showAudiencePicker = audience === 'selected-friends' || audience === 'hide-from';
    this.persistDraft();
  }

  toggleAudienceAccount(accountId: number) {
    this.publishError = '';
    this.audienceAccountIds = this.audienceAccountIds.includes(accountId)
      ? this.audienceAccountIds.filter((id) => id !== accountId)
      : [...this.audienceAccountIds, accountId];
    this.persistDraft();
  }

  get mediaPermissionEnabled() {
    return typeof localStorage === 'undefined' || localStorage.getItem('tali-setting-mediaPermission') !== 'false';
  }

  async onFilesSelected(event: Event) {
    if (!this.mediaPermissionEnabled) return;
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.mediaError = '';
    this.publishError = '';

    if (files.length === 0) return;
    this.mediaUploading = true;
    this.mediaUploadProgress = 0;
    try {
      const { attachments, errors } = await this.mediaAttachmentService.readAttachments(files, (progress) => {
        this.mediaUploadProgress = progress;
      });
      this.pendingAttachments = [...this.pendingAttachments, ...attachments];
      this.persistDraft();
      this.mediaError = errors.join(' ');
    } catch (error) {
      console.error('Could not add post attachments.', error);
      this.mediaError = 'Attachments could not be uploaded. Please try again.';
    } finally {
      this.mediaUploading = false;
      this.mediaUploadProgress = 0;
    }
  }

  removeAttachment(index: number) {
    this.pendingAttachments = this.pendingAttachments.filter((_, attachmentIndex) => attachmentIndex !== index);
    this.publishError = '';
    this.persistDraft();
  }

  publish() {
    if (this.mediaUploading) return;
    const account = this.accountService.selectedAccount();
    if (!account) {
      this.publishError = 'Select an account before publishing.';
      return;
    }
    if (!this.message.trim() && this.pendingAttachments.length === 0) {
      this.publishError = 'Write something or attach a photo, video, or file.';
      return;
    }
    if (this.audience === 'selected-friends' && this.audienceAccountIds.length === 0) {
      this.publishError = 'Select at least one account for this audience.';
      return;
    }

    this.publishError = '';
    this.postService.addPost({
      authorId: account.id,
      authorName: account.name,
      authorUsername: account.username,
      body: this.message.trim(),
      attachments: [...this.pendingAttachments],
      audience: this.audience,
      audienceAccountIds: [...this.audienceAccountIds],
    }, account, this.accountService.accounts());
    this.clearDraft();
    this.message = '';
    this.pendingAttachments = [];
    this.audience = 'public';
    this.audienceAccountIds = [];
    this.showAudienceMenu = false;
    this.showAudiencePicker = false;
    void this.router.navigateByUrl('/home');
  }

}
