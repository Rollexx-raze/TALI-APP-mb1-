import { Injectable } from '@angular/core';
import { PostAttachment } from './post.service';

const maxVideoBytes = 20 * 1024 * 1024;
const maxVideoDurationSeconds = 60;

@Injectable({ providedIn: 'root' })
export class MediaAttachmentService {
  async readAttachments(
    files: File[],
    onProgress: (progress: number) => void = () => undefined,
    onFileProgress: (fileIndex: number, progress: number) => void = () => undefined,
  ) {
    const attachments: PostAttachment[] = [];
    const errors: string[] = [];
    const videos = files.filter((file) => file.type.startsWith('video/'));
    if (videos.length > 1) errors.push('Attach one video per post.');
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;
    let acceptedVideo = false;

    for (const [fileIndex, file] of files.entries()) {
      if (file.type.startsWith('video/')) {
        if (acceptedVideo || videos.length > 1) {
          onFileProgress(fileIndex, 100);
          completedBytes += file.size;
          onProgress(totalBytes ? Math.round(completedBytes / totalBytes * 100) : 100);
          continue;
        }
        if (file.size > maxVideoBytes) {
          errors.push(`${file.name} exceeds the 20 MB video limit.`);
          onFileProgress(fileIndex, 100);
          completedBytes += file.size;
          onProgress(totalBytes ? Math.round(completedBytes / totalBytes * 100) : 100);
          continue;
        }
        try {
          const duration = await this.getVideoDuration(file);
          if (!Number.isFinite(duration) || duration > maxVideoDurationSeconds) {
            errors.push(`${file.name} exceeds the 60 second video limit.`);
            onFileProgress(fileIndex, 100);
            completedBytes += file.size;
            onProgress(totalBytes ? Math.round(completedBytes / totalBytes * 100) : 100);
            continue;
          }
        } catch (error) {
          console.error('Could not validate video duration.', error);
          errors.push(`${file.name} could not be validated. Please choose another video.`);
          onFileProgress(fileIndex, 100);
          completedBytes += file.size;
          onProgress(totalBytes ? Math.round(completedBytes / totalBytes * 100) : 100);
          continue;
        }
      }

      try {
        attachments.push(await this.readFile(file, (loaded) => {
          onProgress(totalBytes ? Math.min(99, Math.round((completedBytes + loaded) / totalBytes * 100)) : 100);
          onFileProgress(fileIndex, file.size ? Math.min(99, Math.round(loaded / file.size * 100)) : 100);
        }));
        onFileProgress(fileIndex, 100);
        if (file.type.startsWith('video/')) acceptedVideo = true;
      } catch (error) {
        console.error(`Could not read attachment ${file.name}.`, error);
        errors.push(`${file.name} could not be added. Please try again.`);
        onFileProgress(fileIndex, 100);
      }
      completedBytes += file.size;
      onProgress(totalBytes ? Math.round(completedBytes / totalBytes * 100) : 100);
    }

    return { attachments, errors };
  }

  private readFile(file: File, onProgress: (loaded: number) => void): Promise<PostAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
      reader.onload = () => resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl: String(reader.result),
      });
      reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  private getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        cleanup();
        resolve(video.duration);
      };
      video.onerror = () => {
        cleanup();
        reject(new Error(`Could not read duration for ${file.name}.`));
      };
      video.src = objectUrl;
    });
  }
}
