import { Component, EventEmitter, Output, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { pauseOutline, playOutline, paperPlaneOutline, trashOutline } from 'ionicons/icons';
import { VoiceRecordingService } from '../../services/voice-recording.service';

@Component({ selector: 'app-voice-recorder-bar', standalone: true, imports: [IonIcon], template: `
<div class="recording-bar" role="group" aria-label="Voice recording controls">
  <button class="trash" type="button" aria-label="Discard recording" (click)="discard.emit()"><ion-icon name="trash-outline"></ion-icon></button>
  <div class="recording-pill">
    <button type="button" aria-label="{{ voice.paused() ? 'Resume recording' : 'Pause recording' }}" (click)="voice.pause()"><ion-icon [name]="voice.paused() ? 'play-outline' : 'pause-outline'"></ion-icon></button>
    <span class="live-wave" aria-label="Live audio waveform">@for (level of voice.levels(); track $index) { <i [style.height.%]="level * 100"></i> }</span>
    <span class="timer"><i [class.paused]="voice.paused()"></i>{{ time }}</span>
  </div>
  <button class="send" type="button" aria-label="Send voice message" (click)="send.emit()"><ion-icon name="paper-plane-outline"></ion-icon></button>
</div>`, styles: [`
:host { display:block; flex:1; min-width:0; animation: rise 180ms ease both; }
.recording-bar { display:flex; align-items:center; gap:8px; width:100%; min-height:54px; }
button { display:grid; place-items:center; flex:0 0 42px; width:42px; height:42px; border:0; border-radius:50%; background:transparent; color:var(--text); cursor:pointer; transition:transform 150ms ease; }
button:active { transform:scale(.95); }
button ion-icon { font-size:21px; }
.trash { color:var(--text-muted); animation:shrink-in 180ms ease both; }
.recording-pill { display:flex; min-width:0; flex:1; align-items:center; gap:9px; height:48px; padding:0 12px; border-radius:999px; background:var(--primary); color:var(--on-primary); }
.recording-pill button { width:32px; height:32px; flex-basis:32px; color:inherit; background:color-mix(in srgb,var(--on-primary) 16%,transparent); }
.live-wave { display:flex; flex:1; align-items:center; justify-content:flex-end; gap:3px; height:28px; overflow:hidden; }
.live-wave i { display:block; flex:1 1 2px; max-width:4px; min-height:3px; border-radius:4px; background:var(--on-primary); opacity:.9; }
.timer { display:flex; align-items:center; gap:6px; min-width:45px; font-variant-numeric:tabular-nums; font-size:13px; }
.timer i { width:7px; height:7px; border-radius:50%; background:#ff4d5e; animation:pulse 900ms ease-in-out infinite alternate; }
.timer i.paused { animation:none; opacity:.45; }
.send { background:var(--primary); color:var(--on-primary); }
@keyframes rise { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
@keyframes shrink-in { from { opacity:0; transform:scale(.7) } to { opacity:1; transform:scale(1) } }
@keyframes pulse { to { opacity:.45; transform:scale(.78) } }
@media (prefers-reduced-motion:reduce) { :host,button,.trash,.timer i { animation:none!important; transition:none!important } }
` ] })
export class VoiceRecorderBarComponent {
  @Output() send = new EventEmitter<void>();
  @Output() discard = new EventEmitter<void>();
  readonly voice = inject(VoiceRecordingService);
  constructor() { addIcons({ pauseOutline, playOutline, paperPlaneOutline, trashOutline }); }
  get time() { const seconds = Math.floor(this.voice.duration()); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`; }
}
