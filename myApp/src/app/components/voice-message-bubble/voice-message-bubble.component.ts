import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { pauseOutline, playOutline } from 'ionicons/icons';

@Component({ selector: 'app-voice-message-bubble', standalone: true, imports: [IonIcon], template: `
<div class="bubble" [class.sent]="sent">
  <audio #audio [src]="audioUrl" (play)="claimPlayback()" (timeupdate)="sync()" (ended)="ended()" (pause)="sync()"></audio>
  <button type="button" [attr.aria-label]="playing ? 'Pause voice message' : 'Play voice message'" (click)="toggle()"><ion-icon [name]="playing ? 'pause-outline' : 'play-outline'"></ion-icon></button>
  <div class="wave" role="slider" tabindex="0" aria-label="Seek voice message" [attr.aria-valuenow]="progress * 100" aria-valuemin="0" aria-valuemax="100" (pointerdown)="seek($event)" (pointermove)="drag($event)">@for (peak of bars; track $index) { <i [class.played]="$index / bars.length <= progress" [style.height.%]="Math.max(14, peak * 100)"></i> }</div>
  <span class="duration">{{ timeLabel }}</span>
</div>
<div class="status">{{ status }}</div>`, styles: [`
:host { display:block; max-width:100%; animation:appear 180ms ease both; }
.bubble { display:flex; align-items:center; gap:10px; width:min(350px,75vw); min-height:64px; padding:10px 14px; border-radius:20px; background:var(--surface-2); color:var(--text); }
.bubble.sent { margin-left:auto; background:var(--primary); color:var(--on-primary); }
audio { display:none; }
button { display:grid; flex:0 0 36px; width:36px;height:36px;place-items:center;border:0;border-radius:50%;background:#fff;color:var(--primary);cursor:pointer;transition:transform 150ms ease; }
button:active { transform:scale(.95); } button ion-icon { color:var(--primary); font-size:20px; }
.wave { display:flex; flex:1; min-width:50px; height:34px; align-items:center; gap:3px; cursor:pointer; touch-action:none; }
.wave i { flex:1 1 2px; min-width:2px; max-width:5px; border-radius:5px; background:rgba(255,255,255,.5); }
.wave i.played { background:#fff; }
.duration { min-width:34px; text-align:right; font-size:12px; font-variant-numeric:tabular-nums; }
.status { min-height:14px; padding:3px 5px 0; color:var(--text-muted); font-size:11px; text-align:right; }
@keyframes appear { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
@media(prefers-reduced-motion:reduce){:host,button{animation:none!important;transition:none!important}}
` ] })
export class VoiceMessageBubbleComponent implements OnChanges, OnDestroy {
  @Input() audioUrl = '';
  @Input() peaks: number[] = [];
  @Input() duration = 0;
  @Input() sent = false;
  @Input() status = '';
  @Input() messageId = '';
  @ViewChild('audio', { static: true }) audioRef!: ElementRef<HTMLAudioElement>;
  static active?: HTMLAudioElement;
  playing = false;
  progress = 0;
  Math = Math;
  private generatedPeaks: number[] = [];
  private decodeContext?: AudioContext;

  constructor() { addIcons({ pauseOutline, playOutline }); }
  get bars() {
    if (this.isUsable(this.peaks)) return this.peaks.slice(0, 40);
    return this.isUsable(this.generatedPeaks) ? this.generatedPeaks : this.pattern(this.messageId || this.audioUrl);
  }
  get timeLabel() {
    const audio = this.audioRef?.nativeElement;
    const seconds = this.playing && audio && !Number.isNaN(audio.duration) ? Math.floor(audio.currentTime) : Math.floor(this.duration);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['audioUrl'] || changes['peaks'] || changes['messageId']) {
      this.generatedPeaks = this.pattern(this.messageId || this.audioUrl);
      if (!this.isUsable(this.peaks) && this.audioUrl) void this.decodePeaks(this.audioUrl);
    }
  }
  private isUsable(peaks: number[] | undefined) {
    return !!peaks && peaks.length >= 4 && peaks.some((value) => Number.isFinite(value)) && Math.max(...peaks) - Math.min(...peaks) > .025;
  }
  private pattern(seedText: string) {
    let seed = 2166136261;
    for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return Array.from({ length: 40 }, (_, index) => {
      seed = (Math.imul(seed, 1664525) + 1013904223 + index) >>> 0;
      return .18 + (seed / 4294967295) * .78;
    });
  }
  private async decodePeaks(url: string) {
    try {
      this.decodeContext = new AudioContext();
      const response = await fetch(url);
      const decoded = await this.decodeContext.decodeAudioData(await response.arrayBuffer());
      const channel = decoded.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(channel.length / 40));
      const peaks = Array.from({ length: 40 }, (_, index) => {
        let maximum = 0;
        for (let i = index * blockSize; i < Math.min(channel.length, (index + 1) * blockSize); i++) maximum = Math.max(maximum, Math.abs(channel[i]));
        return maximum;
      });
      const max = Math.max(...peaks);
      if (max > .001) this.generatedPeaks = peaks.map((peak) => peak / max);
    } catch {
      // The deterministic message-id pattern remains visible when stored audio cannot be decoded.
    } finally {
      await this.decodeContext?.close();
      this.decodeContext = undefined;
    }
  }
  claimPlayback() {
    const audio = this.audioRef.nativeElement;
    if (VoiceMessageBubbleComponent.active && VoiceMessageBubbleComponent.active !== audio) VoiceMessageBubbleComponent.active.pause();
    VoiceMessageBubbleComponent.active = audio;
    this.playing = true;
  }
  async toggle() {
    const audio = this.audioRef.nativeElement;
    if (audio.paused) { try { await audio.play(); } catch { this.playing = false; } }
    else audio.pause();
    this.sync();
  }
  sync() {
    const audio = this.audioRef.nativeElement;
    this.progress = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
    this.playing = !audio.paused;
  }
  ended() { this.progress = 0; this.playing = false; }
  seek(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const audio = this.audioRef.nativeElement;
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * audio.duration;
    this.sync();
  }
  drag(event: PointerEvent) { if (event.buttons === 1) this.seek(event); }
  ngOnDestroy() {
    const audio = this.audioRef?.nativeElement;
    audio?.pause();
    if (VoiceMessageBubbleComponent.active === audio) VoiceMessageBubbleComponent.active = undefined;
    void this.decodeContext?.close();
  }
}
