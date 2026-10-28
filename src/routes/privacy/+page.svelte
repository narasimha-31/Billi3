<script lang="ts">
	import SiteFooter from '../SiteFooter.svelte';
	import Wordmark from '../Wordmark.svelte';

	let { data } = $props();

	const promises = [
		['We never sell or share your data.', 'No ads, no trackers, no "partners". Your receipts are not a product.'],
		['Card details are never saved.', 'We keep the items, prices, store and date. The card digits, cash given and change stay on the paper.'],
		['The photo is deleted once it is read.', 'Unless you choose to keep it. What stays is the list of items, not the picture.'],
		[
			'The AI reads it and forgets it.',
			'Open models on Nebius read your receipt with zero data retention. Nothing is stored after the read, and nothing is used for training.'
		],
		[
			'Name lookups send only the printed line and the store.',
			'When a line like "CF ORGT SAUCE" is hard to read, the web search sees that line and "Walmart". Never you, your address or your city.'
		],
		[
			'Store map: off until you turn it on.',
			'Then we keep your ZIP code, never your address. To find a store’s branches, OpenStreetMap gets the store’s name and an area about 35 miles across, not your ZIP. While you type a store or street, what you typed and a point about a kilometre from your ZIP’s centre go to Photon, an OpenStreetMap search, to suggest places near you. A store address on a receipt, or one you type, goes to the US Census map lookup. Map pictures come through our server, so the map site never sees you. Directions open Google Maps only when you tap them.'
		],
		['Cookies only keep you signed in.', 'No tracking or ad cookies, which is why there is no cookie banner.'],
		['Only you can see your receipts.', 'Locked to your account in the database itself. Delete your account in Settings and every receipt goes with it.']
	];
</script>

<svelte:head>
	<title>Privacy · Billie</title>
	<meta name="description" content="What Billie does with your receipts: what is read, what is kept, and what is deleted." />
</svelte:head>

<div class="screen">
	<header class="top">
		<div class="site-top">
			{#if data.signedIn}
				<Wordmark href="/home" />
				<a href="/home" class="demo">Home</a>
			{:else}
				<Wordmark />
				<a href="/demo" class="demo">Try it live</a>
			{/if}
		</div>
	</header>

	<main>
		<div class="intro">
			<h1 class="large-title">Private by design.</h1>
			<p class="lead">What happens to your receipts, line by line.</p>
			{#if data.signedIn}
				<p class="manage">Choose what’s kept in <a href="/settings">Settings</a>.</p>
			{:else}
				<p class="manage">Once you sign in, you choose what’s kept in Settings.</p>
			{/if}
		</div>

		<div class="promises">
			<ul class="group">
				{#each promises as [promise, detail] (promise)}
					<li>
						<h2>{promise}</h2>
						<p>{detail}</p>
					</li>
				{/each}
			</ul>
			<p class="end">That's it. Told you it was short.</p>
		</div>
	</main>
	<footer class="bottom"><SiteFooter /></footer>
</div>

<style>
	.bottom {
		margin: 0 auto;
		max-width: var(--page);
		border-top: 1px solid rgb(60 60 67 / 0.1);
		padding: 1rem var(--gutter) 2rem;
	}

	.screen {
		min-height: 100dvh;
		background: var(--color-raised);
	}

	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--color-raised) 82%, transparent);
		backdrop-filter: saturate(1.8) blur(20px);
	}

	.demo {
		margin-left: auto;
		font-size: 0.9375rem;
		color: var(--color-accent);
	}

	.demo:focus-visible,
	.manage a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
		border-radius: 4px;
	}

	main {
		display: grid;
		gap: 1.75rem;
		margin: 0 auto;
		max-width: var(--page);
		padding: 2rem var(--gutter) calc(4rem + env(safe-area-inset-bottom));
	}

	.lead {
		margin-top: 0.5rem;
		font-size: 1.1875rem;
		line-height: 1.45;
		color: var(--color-muted);
		text-wrap: balance;
	}

	.manage {
		margin-top: 1.25rem;
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	.manage a {
		color: var(--color-accent);
	}

	li {
		padding: 1.05rem 1.25rem 1.1rem;
	}

	h2 {
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	li p {
		margin-top: 0.3rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--color-muted);
	}

	.end {
		margin: 1rem 1.25rem 0;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	/* a wide screen sets the promises two by two, each still a short read */
	@media (min-width: 1440px) {
		.promises .group {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.promises .group > li:nth-child(2)::before {
			content: none;
		}
	}

	/* laptops: the heading stays in view on the left while the promises fill the right */
	@media (min-width: 960px) {
		main {
			grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
			align-items: start;
			gap: 4rem;
			padding-top: 3.5rem;
		}

		.intro {
			position: sticky;
			top: 6rem;
		}

		.large-title {
			font-size: 2.75rem;
		}

		li {
			padding: 1.25rem 1.5rem 1.3rem;
		}
	}
</style>
