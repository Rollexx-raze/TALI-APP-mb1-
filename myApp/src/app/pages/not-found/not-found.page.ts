import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, IonButton, IonContent],
  template: `
    <ion-content class="page-content not-found-content" [fullscreen]="true">
      <main class="not-found-card" data-surface="surface">
        <p class="not-found-code">404</p>
        <h1>Page not found</h1>
        <p>That page may have moved or the address may be incorrect.</p>
        <ion-button routerLink="/home">Go home</ion-button>
      </main>
    </ion-content>
  `,
  styles: [`
    :host { display:block; }
    .not-found-content { --background:var(--bg); --color:var(--text); }
    .not-found-card { display:grid; min-height:100%; align-content:center; justify-items:center; gap:16px; box-sizing:border-box; padding:32px; text-align:center; }
    .not-found-code { margin:0; color:var(--text-muted); font-size:24px; font-weight:700; }
    h1, p { margin:0; color:var(--on-surface); }
    .not-found-card ion-button { min-height:48px; }
  `],
})
export class NotFoundPage {}
