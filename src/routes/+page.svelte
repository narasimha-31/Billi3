<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { inView } from 'motion';
	import NumberFlow from '@number-flow/svelte';
	import AppReveal from './AppReveal.svelte';
	import GoogleButton from './GoogleButton.svelte';
	import TownFlight, { SCENES } from './TownFlight.svelte';
	import Wordmark from './Wordmark.svelte';
	import { skipStaleAppPage } from '../app-visit';
	import { cartTotals } from './store-prices';

	let { data } = $props();

	const TITLE = 'Billie · Grocery receipt app that finds the cheaper store';
	const DESCRIPTION = 'Billie is a free app for your grocery receipts. Snap a receipt and it remembers every price you paid, store by store, so you see where things cost less, when prices go up, and when food you bought is recalled.';
	const home = `${page.url.origin}/`;

	// every price here is a sourced 2026 shelf price; every sum and gap is worked out below, in cents
	const carts = cartTotals();
	const weekly = carts.at(-1)!.cents - carts[0].cents;
	const yearlyDollars = Math.round((weekly * 52) / 100);

	// the real numbers show by default; they only start from zero once the page can roll them in
	let cartShown = $state(carts.map((c) => c.cents));
	// Number Flow renders differently on the server, so the plain price is drawn until the page is live
	let live = $state(false);
	let cartList: HTMLElement;

	const promises = ['Your card number is never kept.', 'The photo is deleted once it’s read.', 'Nothing is sold or shared. Ever.', 'Store map: off until you turn it on. ZIP code only, never your address.'];

	let scene = $state(0);
	let flying = $state(true);

	onMount(skipStaleAppPage);

	onMount(() => {
		live = true;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		cartShown = carts.map(() => 0);
		return inView(cartList, () => {
			cartShown = carts.map((c) => c.cents);
		}, { amount: 0.5 });
	});

	const dollars = (cents: number) => cents / 100;
	const usd = { style: 'currency', currency: 'USD' } as const;
	const money = new Intl.NumberFormat('en-US', usd);
</script>

<!-- back to this page from the app restores a saved copy; asking again sends a signed-in shopper home -->
<svelte:window onpageshow={(e) => e.persisted && location.reload()} />

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<link rel="canonical" href={home} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Billie" />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={home} />
	<meta property="og:image" content="{home}images/laptop.jpg" />
	<meta name="twitter:card" content="summary_large_image" />
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Billie',
		url: home,
		description: DESCRIPTION,
		applicationCategory: 'ShoppingApplication',
		operatingSystem: 'Any',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
	})}</script>`}
</svelte:head>

<header class="bar">
	<div class="site-top">
		<Wordmark />
		<!-- the town's scenes, up in the bar like chapters; gone once the town scrolls away -->
		<ol class="scenes" class:gone={!flying} aria-label="Scenes">
			{#each SCENES as s, i (s.id)}
				<li><a href="#scene-{s.id}" class:on={scene === i} aria-current={scene === i ? 'step' : undefined}>{s.label}</a></li>
			{/each}
		</ol>
		<nav>
			<a class="wide-only" href="/demo">Try the demo</a>
			<a href="/privacy">Privacy</a>
		</nav>
	</div>
</header>

<main>
	<TownFlight signInFailed={data.signInFailed} bind:scene bind:flying />

	<section class="cart">
		<h2>Same cart. <span class="dear">{money.format(dollars(weekly))} a week apart.</span></h2>
		<p class="sub">Milk, eggs, chicken, ground beef, peanut butter, pasta and bananas. One of each, at four big chains.</p>
		<ul class="totals" bind:this={cartList}>
			{#each carts as cart, i (cart.store)}
				<li class:best={i === 0}>
					<span class="who">{cart.store}{#if i === 0}<span class="tag">Cheapest</span>{/if}</span>
					<span class="meter"><span style:--size={cartShown[i] / carts.at(-1)!.cents}></span></span>
					<span class="money">
						{#if live}<NumberFlow value={dollars(cartShown[i])} format={usd} />{:else}{money.format(dollars(cart.cents))}{/if}
					</span>
				</li>
			{/each}
		</ul>
		<p class="year">Buy that every week and the gap is about <strong>${yearlyDollars} a year</strong>.</p>
		<div class="ask">
			<p>See which store is cheaper for you.</p>
			<GoogleButton />
		</div>
	</section>

	<AppReveal />

	<section class="private">
		<h2>Private by design.</h2>
		<ul>
			{#each promises as promise (promise)}
				<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{promise}</li>
			{/each}
		</ul>
		<a class="fine" href="/privacy">How we handle your receipts</a>
	</section>

	<section class="close" id="start">
		<div class="sign"><Wordmark big /></div>
		<h2>Start with your <span class="hl">last receipt.</span></h2>
		<div class="actions">
			<GoogleButton />
			<a class="quiet" href="/demo">Try the demo</a>
		</div>
	</section>
</main>

<footer>
	<div class="brand">
		<Wordmark />
		<p>The grocery app that remembers every price you paid.</p>
	</div>
	<nav aria-label="Footer">
		<div>
			<h2>Product</h2>
			<a href="/demo">Try the demo</a>
			<a href="#start">Sign in</a>
		</div>
		<div>
			<h2>Help</h2>
			<a href="/privacy">Privacy</a>
			<a href="/feedback?from=/">Send feedback</a>
		</div>
	</nav>
	<p class="sources">
		Store prices on this page are typical 2026 shelf prices from published store price lists and local price trackers.
		The ground beef history is the US city average from the Bureau of Labor Statistics. The app screens show a sample shopper.
	</p>
	<p class="legal">© 2026 Billie</p>
</footer>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--color-bg) 85%, transparent);
		backdrop-filter: saturate(1.6) blur(18px);
	}

	.scenes {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		gap: 0.2rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
		padding: 0.2rem;
		translate: -50% -50%;
		transition:
			opacity 300ms,
			translate 300ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	.scenes.gone {
		opacity: 0;
		translate: -50% -80%;
		pointer-events: none;
	}

	.scenes a {
		display: block;
		border-radius: 999px;
		padding: 0.4rem 0.9rem;
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
		color: var(--color-muted);
		transition:
			background-color 300ms,
			color 300ms;
	}

	.scenes a.on {
		background: var(--color-ink);
		color: #fff;
	}

	.scenes a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.scenes a:not(.on):hover {
			color: var(--color-ink);
		}
	}

	/* on a phone the bar is solid, so the page never shows through it, and the demo lives in the page */
	@media (max-width: 759px) {
		.scenes,
		.wide-only {
			display: none;
		}

		.bar {
			backdrop-filter: none;
			background: var(--color-bg);
			box-shadow: 0 1px 0 var(--color-line);
		}

		.close {
			padding: 4.5rem var(--gutter) 3.5rem;
		}

		.close .actions {
			flex-direction: column;
			align-items: stretch;
			gap: 0.65rem;
		}

		.close .actions :global(form),
		.close .actions :global(button) {
			width: 100%;
			justify-content: center;
		}

		.close .quiet {
			text-align: center;
		}

		footer {
			gap: 1.5rem;
			padding-top: 2rem;
		}
	}

	.bar nav {
		display: flex;
		margin-left: auto;
		gap: 1.5rem;
		font-size: 1rem;
	}

	.bar nav a,
	.quiet,
	.fine {
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.bar nav a:hover,
		.fine:hover {
			color: var(--color-accent);
		}
	}

	section {
		margin: 0 auto;
		max-width: var(--page);
		padding: 0 var(--gutter);
	}

	h2 {
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: -0.035em;
		text-wrap: balance;
		color: var(--color-ink);
	}

	h2 {
		font-size: clamp(2.1rem, 4.6vw, 3.75rem);
		line-height: 1.05;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.75rem 1.75rem;
		margin-top: 2rem;
	}

	.quiet {
		border-radius: 999px;
		padding: 0.75rem 1.25rem;
		font-size: 1.0625rem;
		font-weight: 500;
		box-shadow: inset 0 0 0 1px var(--color-line);
		transition: box-shadow 200ms;
	}

	@media (hover: hover) {
		.quiet:hover {
			box-shadow: inset 0 0 0 1px var(--color-ink);
		}
	}

	.quiet:focus-visible,
	nav a:focus-visible,
	.fine:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}


	.brand {
		display: grid;
		gap: 0.6rem;
		align-content: start;
	}

	.brand p {
		max-width: 18rem;
		line-height: 1.5;
	}

	footer nav {
		display: flex;
		gap: 3rem;
	}

	footer nav div {
		display: grid;
		gap: 0.55rem;
		align-content: start;
	}

	footer h2 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	footer nav a {
		position: relative;
		color: inherit;
		transition: color 150ms;
	}

	/* a 44px reach on small links */
	footer nav a::after {
		content: '';
		position: absolute;
		inset: -12px -6px;
	}

	@media (hover: hover) {
		footer nav a:hover {
			color: var(--color-ink);
		}
	}

	.sources,
	.legal {
		grid-column: 1 / -1;
	}

	.sources {
		max-width: 44rem;
		border-top: 1px solid var(--color-line);
		padding-top: 1.25rem;
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.legal {
		font-size: 0.8125rem;
	}

	.private {
		padding-top: clamp(6rem, 16vh, 10rem);
	}

	.private ul {
		display: grid;
		gap: 1.1rem 2.5rem;
		max-width: none;
		margin-top: 2.25rem;
	}

	@media (min-width: 760px) {
		.private ul {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* four promises side by side once the screen is wide enough to read them */
	@media (min-width: 1440px) {
		.private ul {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.private li {
		display: grid;
		grid-template-columns: 1.6rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: start;
		border-top: 1px solid var(--color-line);
		padding-top: 1.1rem;
		font-size: 1.125rem;
		font-weight: 500;
		line-height: 1.45;
		color: var(--color-ink);
	}

	.private li svg {
		width: 1.4rem;
		height: 1.4rem;
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* the words that carry each point: what you save in green, what it costs you in red */
	.hl,

	.fine {
		display: inline-block;
		margin-top: 2rem;
		font-size: 1.0625rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.close {
		padding: clamp(6rem, 16vh, 10rem) var(--gutter) clamp(5rem, 12vh, 8rem);
		text-align: center;
	}

	.sign {
		margin-bottom: 1.5rem;
	}

	footer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2rem 1rem;
		margin: 0 auto;
		max-width: var(--page);
		border-top: 1px solid var(--color-line);
		padding: 2.5rem var(--gutter);
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	@media (max-width: 599px) {
		footer {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	:global(::selection) {
		background: color-mix(in srgb, var(--color-accent) 22%, transparent);
	}
	.sub {
		margin-top: 1.25rem;
		max-width: 36rem;
		font-size: clamp(1.1875rem, 1.25vw, 1.375rem);
		line-height: 1.55;
		color: var(--color-muted);
	}

	.money {
		min-width: 4.5rem;
		text-align: right;
		font-size: 1.25rem;
		font-weight: 600;
	}

	/* same cart, four chains: the bars grow with the totals as they roll in */
	.cart {
		padding-top: clamp(6rem, 16vh, 10rem);
		text-align: center;
	}

	.cart .sub {
		margin-inline: auto;
	}

	.totals {
		margin: 3rem auto 0;
		max-width: 40rem;
		border-radius: 24px;
		background: #fff;
		padding: 0.5rem 1.5rem;
		text-align: left;
		box-shadow: 0 24px 50px -28px rgb(0 0 0 / 0.25);
	}

	.totals li {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr) 5.5rem;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0;
		font-size: 1.0625rem;
	}

	.totals li + li {
		border-top: 1px solid var(--color-receipt-line);
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.meter {
		height: 0.55rem;
		border-radius: 999px;
		background: #ececf0;
	}

	.meter span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: #aeaeb2;
		transform-origin: left;
		transform: scaleX(var(--size));
		transition: transform 1.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.best .meter span {
		background: var(--color-accent);
	}

	.totals .money {
		min-width: 0;
	}

	.year {
		margin-top: 1.75rem;
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 2.6vw, 2rem);
		font-weight: 650;
		letter-spacing: -0.025em;
		color: var(--color-ink);
		text-wrap: balance;
	}

	.ask {
		display: grid;
		justify-items: center;
		gap: 1rem;
		margin-top: 2rem;
	}

	.ask p {
		font-size: clamp(1.1875rem, 1.25vw, 1.375rem);
		color: var(--color-muted);
	}

	@media (max-width: 560px) {
		.totals {
			padding: 0.25rem 1rem;
		}

		.totals li {
			grid-template-columns: minmax(0, 1fr) 4.75rem;
			gap: 0.4rem 0.75rem;
		}

		.meter {
			grid-column: 1 / -1;
			grid-row: 2;
		}

	}

	@media (prefers-reduced-motion: reduce) {
		.meter span {
			transition: none;
		}
	}

	.best .money {
		color: var(--color-accent);
	}

	.tag {
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		padding: 0.15rem 0.55rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-accent);
	}

	.dear {
		color: var(--color-up);
	}

	.year strong {
		color: var(--color-accent);
	}
</style>
