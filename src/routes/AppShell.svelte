<script lang="ts" module>
	// set by the page being left, read by the page arriving: only a tap between pages eases the new
	// one in, never a first load or a refresh
	let arrivedByTap = false;
	// the page slide running now, shared by every page's shell
	let moving: ViewTransition | null = null;
	let release: (() => void) | null = null;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { beforeNavigate, invalidateAll, onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { navigating, page } from '$app/state';
	import { clearRestored, markAppStart, reloadRestored } from '../app-visit';
	import AccountMenu from './AccountMenu.svelte';
	import ThemePicker from './ThemePicker.svelte';
	import Toaster from './Toaster.svelte';
	import Wordmark from './Wordmark.svelte';

	let { firstName, fit = false, children }: { firstName: string | null; fit?: boolean; children: Snippet } = $props();

	const links = [
		{ href: '/home', label: 'Home', icon: 'M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z' },
		{ href: '/receipts', label: 'Receipts', icon: 'M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21zM9 8h6M9 12h6M9 16h4' },
		{ href: '/prices', label: 'Prices', icon: 'M3.5 12.5 11 5h8v8l-7.5 7.5a1.5 1.5 0 0 1-2.1 0L3.5 14.6a1.5 1.5 0 0 1 0-2.1zM15.5 8.5h.01' },
		{ href: '/list', label: 'Lists', icon: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' }
	];
	const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
	// The tab follows the tap at once: while the next page's data loads, the link being opened is
	// already the selected one, instead of nothing changing until the server answers.
	const path = $derived(navigating.to?.url.pathname ?? page.url.pathname);
	const selected = $derived(links.findIndex((link) => under(path, link.href)));

	// the old page stays put until the next one has its data, which then rises in; browsers that can
	// slide whole pages (below) do that instead
	const entering = arrivedByTap && typeof document !== 'undefined' && !document.startViewTransition;
	arrivedByTap = false;

	// Pages move like a phone app's: a deeper page slides in from the right, going back slides it
	// away, a tab cross-fades. Safari's own edge swipe has already moved the page, so it gets none.
	const depth = (url: URL) => url.pathname.split('/').filter(Boolean).length + (url.searchParams.has('item') ? 1 : 0);
	let swiped = false;
	onNavigate((navigation) => {
		const { from, to } = navigation;
		// A quick back in the middle of a slide cancels the page it was waiting for, so that slide is let
		// go and jumps to its end, and this change happens without one.
		const sliding = moving;
		release?.();
		moving?.skipTransition();
		const skip = sliding || swiped || !document.startViewTransition || !from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches;
		swiped = false;
		if (skip || (from.url.pathname === to.url.pathname && depth(from.url) === depth(to.url))) return;
		const step = depth(to.url) - depth(from.url);
		const section = (url: URL) => url.pathname.split('/')[1];
		document.documentElement.dataset.nav = section(to.url) !== section(from.url) || step === 0 ? 'tab' : step > 0 ? 'forward' : 'back';
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await new Promise<void>((done) => {
					release = done;
					navigation.complete.then(done, done);
				});
			});
			moving = transition;
			transition.finished.finally(() => moving === transition && (moving = null));
		});
	});
	beforeNavigate(({ to }) => {
		arrivedByTap = !!to && to.route.id !== page.route.id;
	});

	// the pill starts where it belongs, and only slides once the page is on screen
	let ready = $state(false);
	onMount(() => {
		markAppStart();
		clearRestored();
		requestAnimationFrame(() => (ready = true));
	});

	// a quick glance away doesn't refetch
	let awayAt = 0;
	function away() {
		awayAt ||= Date.now();
	}
	function back() {
		if (document.hidden) return away();
		if (awayAt && Date.now() - awayAt > 5000) invalidateAll();
		awayAt = 0;
	}

	// with a mouse, buttons and rows carry a light that follows the pointer (drawn in app.css)
	const LIT = '.pill-button, .small-button, .drop, a.row, button.row, .tile';
	let frame = 0;
	function light(event: PointerEvent) {
		if (event.pointerType !== 'mouse') return;
		const target = (event.target as Element).closest<HTMLElement>(LIT);
		if (!target) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const box = target.getBoundingClientRect();
			target.style.setProperty('--x', `${event.clientX - box.left}px`);
			target.style.setProperty('--y', `${event.clientY - box.top}px`);
		});
	}
</script>

<!-- coming back to the tab picks up what changed on another device meanwhile -->
<svelte:document onvisibilitychange={back} />
<!-- a page kept from before a sign-out asks the server again -->
<svelte:window
	onblur={away}
	onfocus={back}
	onpointermove={light}
	onpageshow={(e) => e.persisted && reloadRestored()}
	onpopstate={(e) => (swiped = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true)}
/>

<div class="app" class:fit>
	<header class="top">
		<div class="site-top">
			<Wordmark href="/home" />
			<nav aria-label="Main" class:ready style:--selected={selected} style:--tabs={links.length}>
				{#if selected >= 0}<span class="pill" aria-hidden="true"></span>{/if}
				<!-- like a phone app: tabs open from Home stack one deep, so back goes Home, then out -->
				{#each links as link, i (link.href)}
					<a href={link.href} data-sveltekit-replacestate={page.url.pathname === '/home' ? 'off' : ''} aria-current={under(page.url.pathname, link.href) ? 'page' : undefined} class:on={i === selected}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d={link.icon} /></svg>
						<span>{link.label}</span>
					</a>
				{/each}
			</nav>
			<div class="end">
				<ThemePicker />
				<a class="settings" href="/settings" aria-label="Settings" aria-current={under(page.url.pathname, '/settings') ? 'page' : undefined}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
				</a>
				<AccountMenu {firstName} />
			</div>
		</div>
	</header>

	<div class="page" class:entering>
		{@render children()}
	</div>
	<Toaster />
</div>

<style>
	.end {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* signed-in pages sit on Apple's grouped grey, so white lists and cards read as surfaces */
	/* the theme's three lights sit still behind the page while it scrolls */
	.app {
		min-height: 100dvh;
		background:
			radial-gradient(ellipse 70% 55% at 0% 0%, var(--glow-a), transparent 70%),
			radial-gradient(ellipse 60% 50% at 100% 15%, var(--glow-b), transparent 70%),
			radial-gradient(ellipse 80% 55% at 45% 105%, var(--glow-c), transparent 70%),
			var(--color-raised);
		background-attachment: fixed;
	}

	/* the bars stay put while the page under them moves */
	.top {
		view-transition-name: top-bar;
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--color-raised) 82%, transparent);
		backdrop-filter: saturate(1.8) blur(20px);
		box-shadow: 0 1px 0 rgb(0 0 0 / 0.06);
	}

	.page.entering {
		animation: page-in 200ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
	}

	@keyframes page-in {
		from {
			opacity: 0.6;
			transform: translateY(6px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.page.entering {
			animation: none;
		}

		nav.ready .pill,
		nav a {
			transition: none;
		}

		nav a:active {
			transform: none;
		}
	}

	.page {
		margin: 0 auto;
		max-width: var(--page);
		padding: 1.75rem var(--gutter) 4rem;
	}

	/* on a laptop a fitted page is exactly one screen tall; its own lists scroll instead of the page */
	@media (min-width: 1024px) and (min-height: 600px) {
		.app.fit {
			display: flex;
			flex-direction: column;
			height: 100dvh;
		}

		.app.fit .page {
			display: flex;
			flex: 1;
			flex-direction: column;
			width: 100%;
			min-height: 0;
			padding-bottom: 1.5rem;
		}
	}

	/* a segmented control on wide screens: equal segments, so one pill can slide between them */
	nav {
		--pad: 2px;
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--tabs), minmax(0, 1fr));
		margin: 0 auto;
		border-radius: 11px;
		background: color-mix(in srgb, var(--color-sep) 7%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-sep) 9%, transparent);
		padding: var(--pad);
	}

	/* The selection is one pill that moves, on the iOS curve: quick to leave, soft to land. It is
	   placed without motion on arrival and only slides between taps. */
	.pill {
		position: absolute;
		top: var(--pad);
		bottom: var(--pad);
		left: var(--pad);
		width: calc((100% - 2 * var(--pad)) / var(--tabs));
		border-radius: 9px;
		background: var(--color-selected);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.12),
			0 0 0 1px color-mix(in srgb, var(--color-sep) 8%, transparent),
			0 2px 6px rgb(0 0 0 / 0.14);
		transform: translateX(calc(var(--selected) * 100%));
	}

	/* a thin line in the theme's colour under the chosen tab, lit like an indicator, riding with the pill */
	.pill::after {
		content: '';
		position: absolute;
		bottom: 3px;
		left: 50%;
		width: 1.1rem;
		height: 2px;
		border-radius: 2px;
		background: var(--color-accent);
		box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent) 70%, transparent);
		translate: -50% 0;
	}

	nav.ready .pill {
		transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	nav a {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		padding: 0.3rem 1.1rem 0.55rem;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-muted);
		-webkit-tap-highlight-color: transparent;
		transition:
			color 160ms,
			transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	nav a.on {
		color: var(--color-ink);
	}

	/* pressed: a small give under the finger, at once, then it springs back */
	nav a:active {
		transform: scale(0.94);
		transition-duration: 160ms, 80ms;
	}

	nav a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	nav svg {
		display: none;
	}

	.settings {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		color: var(--color-muted);
		-webkit-tap-highlight-color: transparent;
		transition:
			color 160ms,
			background-color 160ms,
			transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.settings svg {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.settings[aria-current='page'] {
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-accent);
	}

	.settings:active {
		transform: scale(0.92);
		transition-duration: 160ms, 160ms, 80ms;
	}

	.settings:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.settings:hover {
			color: var(--color-ink);
			background: color-mix(in srgb, var(--color-sep) 8%, transparent);
		}
	}

	/* on phones the same links become a floating tab bar, lifted clear of the home indicator
	   and the browser's own toolbar, the way iOS apps place it */
	@media (max-width: 640px) {
		/* a blur on the header would pin the fixed tab bar to the header instead of the screen */
		.top {
			backdrop-filter: none;
			background: var(--color-raised);
		}

		.page {
			padding-bottom: calc(7rem + env(safe-area-inset-bottom));
		}

		.end {
			margin-left: auto;
		}

		nav {
			view-transition-name: tab-bar;
			--pad: 0.3rem;
			position: fixed;
			right: 1rem;
			bottom: calc(0.85rem + env(safe-area-inset-bottom));
			left: 1rem;
			z-index: 20;
			margin: 0;
			border-radius: 999px;
			/* its own colour and a fine edge, so it stands off the cards behind it in either look */
			background: color-mix(in srgb, var(--color-bar) 90%, transparent);
			backdrop-filter: saturate(1.8) blur(22px);
			box-shadow:
				0 10px 30px -8px rgb(0 0 0 / 0.35),
				0 0 0 1px color-mix(in srgb, var(--color-sep) 16%, transparent);
		}

		.pill {
			border-radius: 999px;
			background: color-mix(in srgb, var(--color-accent) 12%, transparent);
			box-shadow: none;
		}

		.pill::after {
			content: none;
		}

		nav a {
			flex: 1;
			flex-direction: column;
			gap: 0.1rem;
			border-radius: 999px;
			padding: 0.4rem 0 0.35rem;
			font-size: 0.6875rem;
			font-weight: 500;
			color: var(--color-muted);
		}

		nav a.on {
			color: var(--color-accent);
		}

		nav svg {
			display: block;
			width: 1.5rem;
			height: 1.5rem;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.7;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
	}
</style>
