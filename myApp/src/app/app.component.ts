import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { AppearanceService } from './services/appearance.service';

@Component({
	selector: 'app-root',
	standalone: true,
	templateUrl: './app.component.html',
	imports: [IonApp, IonRouterOutlet, BottomNavComponent],
})
export class AppComponent {
	private readonly router = inject(Router);
	private readonly appearance = inject(AppearanceService);
	readonly showBottomNav = signal(true);

	constructor() {
		void this.appearance;
		const updateRouteState = (url = this.router.url) => {
			if (typeof document !== 'undefined') document.documentElement.classList.add('app-web-shell');
			const path = url.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
			this.showBottomNav.set(!['/login', '/create-account', '/select-account', '/more-accounts'].includes(path));
		};
		updateRouteState();
		this.router.events.subscribe((event) => {
			if (event instanceof NavigationEnd) updateRouteState(event.urlAfterRedirects);
		});
	}

}
