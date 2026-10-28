<script lang="ts">
	import { enhance } from '$app/forms';
	import SiteFooter from '../SiteFooter.svelte';
	import Wordmark from '../Wordmark.svelte';
	import { sampleReceipts } from './sample-receipts';

	let { form } = $props();
	let starting = $state(false);
</script>

<svelte:head>
	<title>Try it live · Billie</title>
	<meta name="description" content="Try Billie without signing in: a guest account with a sample shopper's receipts, and real receipt reading." />
</svelte:head>

<div class="screen">
	<header class="top">
		<div class="site-top">
			<Wordmark />
			<a href="/#start" class="other">Sign in</a>
		</div>
	</header>

	<main>
		<h1 class="large-title">Try Billie live, no sign-in.</h1>
		<p class="lead">
			You get a guest account that already holds a sample shopper’s {sampleReceipts.length} receipts. Add a photo of your own and it’s read
			for real.
		</p>

		<ul class="group">
			<li><strong>10 receipt reads</strong> come with each guest session.</li>
			<li>
				<strong>Receipts are read by Kimi K2.7</strong> on Nebius Token Factory, with NVIDIA Nemotron 3.5 Super VL as the backup reader.
				Nemotron 3 Super names every item.
			</li>
			<li><strong>Everything is deleted</strong> three hours after you start, or as soon as you tap End session.</li>
		</ul>

		<form
			method="POST"
			action="?/start"
			use:enhance={() => {
				starting = true;
				return async ({ update }) => {
					await update();
					starting = false;
				};
			}}
		>
			<button class="pill-button start" disabled={starting}>{starting ? 'Setting up your guest account…' : 'Start the guest session'}</button>
			{#if form?.problem}<p class="problem" role="alert">{form.problem}</p>{/if}
		</form>
	</main>

	<div class="bottom"><SiteFooter /></div>
</div>

<style>
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

	.other {
		margin-left: auto;
		font-size: 0.9375rem;
		color: var(--color-accent);
	}

	main {
		display: grid;
		gap: 1.5rem;
		margin: 0 auto;
		max-width: 40rem;
		padding: 2.5rem var(--gutter) calc(4rem + env(safe-area-inset-bottom));
	}

	.lead {
		font-size: 1.1875rem;
		line-height: 1.45;
		color: var(--color-muted);
		text-wrap: pretty;
	}

	li {
		padding: 1rem 1.25rem;
		line-height: 1.45;
		color: var(--color-muted);
	}

	strong {
		font-weight: 600;
		color: var(--color-ink);
	}

	.start {
		width: 100%;
		justify-content: center;
		padding-block: 0.9rem;
		font-size: 1.0625rem;
	}

	.problem {
		margin-top: 0.75rem;
		color: var(--color-up);
	}

	.bottom {
		margin: 0 auto;
		max-width: var(--page);
		border-top: 1px solid rgb(60 60 67 / 0.1);
		padding: 1rem var(--gutter) 2rem;
	}

	.other:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
		border-radius: 4px;
	}
</style>
