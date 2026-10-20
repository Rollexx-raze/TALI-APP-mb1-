import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { pauseOutline, playOutline } from 'ionicons/icons';

@Component({ selector: 'app-voice-message-bubble', standalone: true, imports: [IonIcon], template: `
<div class="bubble-wrap">
<div class="bubble" [class.sent]="sent">
  <audio #audio [src]="audioUrl" (play)="claimPlayback()" (timeupdate)="sync()" (ended)="ended()" (pause)="sync()"></audio>
  <button type="button" [attr.aria-label]="playing ? 'Pause voice message' : 'Play voice message'" (click)="toggle()"><ion-icon [name]="playing ? 'pause-outline' : 'play-outline'"></ion-icon></button>
  <div class="wave" role="slider" tabindex="0" aria-label="Seek voice message" [attr.aria-valuenow]="progress * 100" aria-valuemin="0" aria-valuemax="100" (pointerdown)="seek($event)" (pointermove)="drag($event)">@for (peak of bars; track $index) { <i [class.played]="$index / bars.length <= progress" [style.height.%]="Math.max(14, peak * 100)"></i> }@if (playing) { <span class="playhead" [style.left.%]="progress * 100"></span> }</div>
  <span class="duration">{{ timeLabel }}</span>
</div>
<ng-content></ng-content>
</div>
<div class="status">{{ status }}</div>`, styles: [`
:host { display:block; min-width:0; max-width:100%; animation:appear 180ms ease both; }
.bubble-wrap { position:relative; display:flex; width:fit-content; min-width:0; max-width:100%; flex-direction:column; }
.bubble-wrap.has-reaction { margin-bottom:14px; }
.bubble { position:relative; display:flex; box-sizing:border-box; min-width:min(220px,100%); width:min(350px,100%); min-height:68px; align-items:center; gap:10px; padding:9px 12px; border:1px solid color-mix(in srgb, var(--border) 80%, transparent); border-radius:18px 18px 18px 6px; background:var(--surface-2); color:var(--text); box-shadow:0 3px 10px rgba(0,0,0,.12); }
.bubble.sent { margin-left:auto; border-color:color-mix(in srgb, var(--primary) 75%, transparent); border-radius:18px 18px 6px 18px; background:var(--primary); color:var(--on-primary); }
audio { display:none; }
button { display:grid; box-sizing:border-box; flex:0 0 40px; width:40px; height:40px; place-items:center; padding:0; border:1px solid color-mix(in srgb, var(--primary) 35%, transparent); border-radius:50%; background:var(--primary); color:var(--on-primary); cursor:pointer; box-shadow:0 2px 7px rgba(0,0,0,.16); transition:background-color 150ms ease, box-shadow 150ms ease; }
button:hover { box-shadow:0 3px 9px rgba(0,0,0,.22); }
button:active { background:var(--primary-hover); }
button:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
button ion-icon { color:inherit; font-size:20px; }
.bubble.sent button { border-color:color-mix(in srgb, var(--on-primary) 28%, transparent); background:color-mix(in srgb, var(--on-primary) 16%, transparent); color:var(--on-primary); }
.wave { position:relative; display:flex; box-sizing:border-box; flex:1 1 0; min-width:0; height:36px; align-items:center; justify-content:space-between; gap:3px; overflow:hidden; padding:0 4px; border-radius:8px; background:color-mix(in srgb, currentColor 7%, transparent); cursor:pointer; touch-action:none; }
.wave i { flex:1 1 0; min-width:0; max-width:5px; border-radius:999px; background:currentColor; opacity:.34; transition:opacity 140ms ease; }
.wave i.played { opacity:.92; }
.wave:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
.playhead { position:absolute; top:4px; bottom:4px; width:2px; transform:translateX(-1px); border-radius:2px; background:currentColor; box-shadow:0 0 5px currentColor; pointer-events:none; }
.duration { box-sizing:border-box; width:38px; min-width:38px; flex:0 0 38px; color:inherit; font-size:12px; font-weight:650; text-align:right; font-variant-numeric:tabular-nums; }
.status { box-sizing:border-box; width:100%; min-height:18px; padding:5px 12px 0; color:var(--text-muted); font-size:12px; line-height:1.1; text-align:right; }
.bubble-wrap:has(.bubble.sent) { margin-left:auto; }
@keyframes appear { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
@media(max-width:360px){.bubble{gap:9px;padding-inline:10px}button{flex-basis:36px;width:36px;height:36px}.duration{min-width:34px}}
@media(prefers-reduced-motion:reduce){:host,button,.wave i{animation:none!important;transition:none!important}}
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
    if (!peaks || peaks.length < 4) return false;
    const valid = peaks.filter((value) => Number.isFinite(value));
    if (valid.length < 4 || Math.max(...valid) < .05) return false;
    return Math.max(...valid) - Math.min(...valid) > .025;
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
