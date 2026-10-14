import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AnimationBuilder, createAnimation, IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
	selector: 'app-root',
	standalone: true,
	templateUrl: './app.component.html',
	imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
	private readonly router = inject(Router);
	readonly pageTransition: AnimationBuilder = (baseEl, options) =>
		createAnimation()
			.addElement(options?.enteringEl ?? baseEl)
			.fromTo('opacity', '0', '1')
			.fromTo('transform', 'translateY(4px)', 'translateY(0)')
			.duration(180)
			.easing('cubic-bezier(0.2, 0.8, 0.2, 1)');

	constructor() {
		if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;

		const savedDarkMode = localStorage.getItem('tali-setting-darkMode') ?? localStorage.getItem('tali-dark-mode');
		document.documentElement.classList.toggle('app-light', savedDarkMode === 'false');

		const updateWebShell = (url: string) => {
			const path = url.split(/[?#]/, 1)[0];
			const isSignedInPage = ['/home', '/search', '/messages', '/add-post', '/activity', '/suggestions', '/profile', '/settings']
				.some((route) => path === route || path.startsWith(`${route}/`));
			document.documentElement.classList.toggle('app-web-shell', isSignedInPage);
		};

		updateWebShell(this.router.url);
		this.router.events.subscribe((event) => {
			if (event instanceof NavigationEnd) updateWebShell(event.urlAfterRedirects);
		});
	}
}
