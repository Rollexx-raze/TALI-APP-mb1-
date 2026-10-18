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
		const revealSelector = 'app-post-card, .group-card, .community-card, .notification-row, .suggestion-row, .settings-info-card, .feed-empty, .thread-empty';
		const observeCardsIn = (root: ParentNode) => {
			const elements: HTMLElement[] = [];
			if (root instanceof HTMLElement && root.matches(revealSelector)) elements.push(root);
			elements.push(...root.querySelectorAll<HTMLElement>(revealSelector));
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
			this.revealMutationObserver = new MutationObserver((records) => {
				records.forEach((record) => record.addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) observeCardsIn(node);
				}));
			});
			this.revealMutationObserver.observe(appMain, { childList: true, subtree: true });
		}
		if (appMain) observeCardsIn(appMain);
	}

}
