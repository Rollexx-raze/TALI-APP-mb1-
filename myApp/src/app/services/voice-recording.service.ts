import { Injectable, signal } from '@angular/core';

export interface VoiceRecording {
  blob: Blob;
  url: string;
  durationSeconds: number;
  peaks: number[];
}

@Injectable({ providedIn: 'root' })
export class VoiceRecordingService {
  readonly recording = signal(false);
  readonly paused = signal(false);
  readonly duration = signal(0);
  readonly levels = signal<number[]>(Array.from({ length: 42 }, () => 0.06));
  readonly error = signal<string | null>(null);
  readonly completed = signal<VoiceRecording | null>(null);
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private startedAt = 0;
  private elapsedBeforePause = 0;
  private chunks: Blob[] = [];
  private reducedMotion = false;
  private readonly maxDuration = 300;

  async start() {
    if (this.recording()) return true;
    this.error.set(null);
    this.completed.set(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.error.set('Voice recording is not supported by this browser.'); return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      const mimeType = this.chooseMimeType();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.duration.set(0); this.elapsedBeforePause = 0; this.startedAt = Date.now();
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
      this.recorder.start(200);
      this.recording.set(true); this.paused.set(false);
      this.timer = setInterval(() => {
        const elapsed = this.elapsedBeforePause + (this.paused() ? 0 : (Date.now() - this.startedAt) / 1000);
        this.duration.set(Math.min(this.maxDuration, elapsed));
        if (elapsed >= this.maxDuration) void this.stop().then((recording) => this.completed.set(recording));
      }, 100);
      this.sample();
      return true;
    } catch (error) {
      this.cleanup();
      this.error.set((error as DOMException)?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not access the microphone.');
      return false;
    }
  }

  pause() {
    if (!this.recorder || !this.recording()) return;
    if (this.paused()) {
      this.recorder.resume(); this.startedAt = Date.now(); this.paused.set(false);
      if (!this.reducedMotion) this.sample();
    } else {
      this.elapsedBeforePause += (Date.now() - this.startedAt) / 1000;
      this.recorder.pause(); this.paused.set(true); cancelAnimationFrame(this.frame);
    }
  }

  async stop(discard = false): Promise<VoiceRecording | null> {
    if (!this.recorder) return null;
    const recorder = this.recorder;
    const elapsed = Math.min(this.maxDuration, this.elapsedBeforePause + (this.paused() ? 0 : (Date.now() - this.startedAt) / 1000));
    this.duration.set(elapsed);
    return new Promise((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        let result: VoiceRecording | null = null;
        if (!discard && blob.size) {
          const peaks = await this.makePeaks(blob);
          const url = URL.createObjectURL(blob);
          // TODO: Upload the blob here when an upload service is available.
          result = { blob, url, durationSeconds: elapsed, peaks };
        }
        this.cleanup(); resolve(result);
      };
      if (recorder.state !== 'inactive') recorder.stop();
    });
  }

  private chooseMimeType() {
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type));
  }
  private sample() {
    if (!this.analyser || this.paused() || !this.recording()) return;
    const data = new Uint8Array(this.analyser.fftSize); this.analyser.getByteTimeDomainData(data);
    let sum = 0; for (const value of data) { const n = (value - 128) / 128; sum += n * n; }
    const level = Math.min(1, Math.max(.06, Math.sqrt(sum / data.length) * 5));
    this.levels.update((levels) => [...levels.slice(1), level]);
    this.frame = requestAnimationFrame(() => this.sample());
  }
  private async makePeaks(blob: Blob) {
    const peaks = Array.from({ length: 40 }, () => .08);
    try {
      const context = this.context ?? new AudioContext();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const channel = buffer.getChannelData(0), block = Math.max(1, Math.floor(channel.length / peaks.length));
      for (let i = 0; i < peaks.length; i++) { let max = 0; for (let j = i * block; j < Math.min(channel.length, (i + 1) * block); j++) max = Math.max(max, Math.abs(channel[j])); peaks[i] = max; }
      const max = Math.max(...peaks, .01); return peaks.map((value) => value / max);
    } catch { return peaks; }
  }
  private cleanup() {
    cancelAnimationFrame(this.frame); if (this.timer) clearInterval(this.timer); this.timer = undefined;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = undefined;
    void this.context?.close(); this.context = undefined; this.analyser = undefined; this.recorder = undefined;
    this.recording.set(false); this.paused.set(false);
  }
}
