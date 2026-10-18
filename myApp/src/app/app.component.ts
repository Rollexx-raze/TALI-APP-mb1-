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
	private revealObserver?: IntersectionObserver;
	private revealMutationObserver?: MutationObserver;
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
		this.setupScrollReveals();
	}

	private setupScrollReveals() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const observeVisibleCards = () => {
			const elements = document.querySelectorAll<HTMLElement>(
				'.app-main app-post-card, .app-main .group-card, .app-main .community-card, .app-main .notification-row, .app-main .suggestion-row, .app-main .settings-info-card, .app-main .feed-empty, .app-main .thread-empty',
			);
			elements.forEach((element) => {
				if (element.dataset['revealState']) return;
				if (typeof IntersectionObserver === 'undefined') {
					element.dataset['revealState'] = 'visible';
					return;
				}
				element.dataset['revealState'] = 'pending';
				this.revealObserver ??= new IntersectionObserver((entries, observer) => {
					entries.forEach((entry) => {
						if (!entry.isIntersecting) return;
						(entry.target as HTMLElement).dataset['revealState'] = 'visible';
						observer.unobserve(entry.target);
					});
				}, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
				this.revealObserver.observe(element);
			});
		};
		const appMain = document.querySelector('.app-main');
		if (typeof MutationObserver !== 'undefined' && appMain) {
			this.revealMutationObserver = new MutationObserver(observeVisibleCards);
			this.revealMutationObserver.observe(appMain, { childList: true, subtree: true });
		}
		observeVisibleCards();
	}

}
