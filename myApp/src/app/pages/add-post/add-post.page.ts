import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTextarea, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircle, attachOutline, chatbubbleOutline, checkmarkOutline, chevronForwardOutline, closeCircleOutline, closeOutline, documentOutline, ellipsisVertical, homeOutline, imageOutline, micOutline, notificationsOutline, peopleOutline, personCircleOutline, stopCircleOutline, trendingUpOutline, videocamOutline } from 'ionicons/icons';
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
  imports: [FormsModule, RouterLink, IonContent, IonHeader, IonIcon, IonTextarea, IonToolbar],
})
export class AddPostPage implements OnDestroy {
  readonly accountService = inject(AccountService);
  private readonly postService = inject(PostService);
  private readonly mediaAttachmentService = inject(MediaAttachmentService);
  private readonly router = inject(Router);
  readonly viewState = inject(ViewStateService);
  message = '';
  publishError = '';
  isPublishing = false;
  isRecordingVoice = false;
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
  private voiceRecorder: MediaRecorder | null = null;
  private voiceStream: MediaStream | null = null;
  private discardVoiceRecording = false;
  readonly audienceOptions: { value: PostAudience; label: string }[] = [
    { value: 'public', label: 'Public' },
    { value: 'friends', label: 'Friends' },
    { value: 'friends-of-friends', label: 'Friends of Friends' },
    { value: 'selected-friends', label: 'Select Friends' },
    { value: 'hide-from', label: 'Hide From' },
    { value: 'only-me', label: 'Only Me' },
  ];

  constructor() {
    addIcons({ addCircle, attachOutline, chatbubbleOutline, checkmarkOutline, chevronForwardOutline, closeCircleOutline, closeOutline, documentOutline, ellipsisVertical, homeOutline, imageOutline, micOutline, notificationsOutline, peopleOutline, personCircleOutline, stopCircleOutline, trendingUpOutline, videocamOutline });
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

  async toggleVoiceRecording() {
    if (this.voiceRecorder?.state === 'recording') {
      this.voiceRecorder.stop();
      return;
    }
    this.mediaError = '';
    if (!this.mediaPermissionEnabled) {
      this.mediaError = 'Allow media attachments in Settings before recording audio.';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.mediaError = 'Voice recording is not supported by this browser.';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      const chunks: BlobPart[] = [];
      this.discardVoiceRecording = false;
      this.voiceStream = stream;
      this.voiceRecorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.voiceStream = null;
        this.voiceRecorder = null;
        this.isRecordingVoice = false;
        this.mediaError = 'The voice recording could not be completed. Please try again.';
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.voiceStream = null;
        this.voiceRecorder = null;
        this.isRecordingVoice = false;
        if (this.discardVoiceRecording) return;
        const recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!recording.size) {
          this.mediaError = 'No audio was recorded. Try again.';
          return;
        }
        if (recording.size > 15 * 1024 * 1024) {
          this.mediaError = 'The voice recording is larger than 15 MB.';
          return;
        }
        const extension = recording.type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([recording], `Voice note.${extension}`, { type: recording.type });
        this.mediaUploading = true;
        void this.mediaAttachmentService.readAttachments([file], (progress) => { this.mediaUploadProgress = progress; })
          .then(({ attachments, errors }) => {
            this.pendingAttachments = [...this.pendingAttachments, ...attachments];
            this.mediaError = errors.join(' ');
            this.persistDraft();
          })
          .catch(() => { this.mediaError = 'The voice recording could not be added. Please try again.'; })
          .finally(() => { this.mediaUploading = false; this.mediaUploadProgress = 0; });
      };
      recorder.start(250);
      this.isRecordingVoice = true;
    } catch {
      this.mediaError = 'Microphone access was not granted.';
    }
  }

  ngOnDestroy() {
    this.discardVoiceRecording = true;
    if (this.voiceRecorder?.state !== 'inactive') this.voiceRecorder?.stop();
    this.voiceStream?.getTracks().forEach((track) => track.stop());
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
    } catch {
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

  async publish() {
    if (this.mediaUploading || this.isPublishing || this.isRecordingVoice || !this.canPublish) return;
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
    this.isPublishing = true;
    try {
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
      await this.router.navigateByUrl('/home');
    } catch {
      this.publishError = 'Your post could not be saved. Please retry.';
    } finally {
      this.isPublishing = false;
    }
  }

}
