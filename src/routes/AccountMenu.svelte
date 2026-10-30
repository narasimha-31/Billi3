<script lang="ts">
	import { enhance } from '$app/forms';
	import { leaveApp } from '../app-visit';
	import { backStep } from '../back-step.svelte';

	let { firstName }: { firstName: string | null } = $props();

	let menu: HTMLDetailsElement;
	const step = backStep('account', () => (menu.open = false));
	const initial = $derived((firstName ?? 'B').charAt(0).toUpperCase());

	// a <details> menu works with the keyboard and without JavaScript; this only closes it on an outside click
	function closeOutside(event: MouseEvent) {
		if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
	}
</script>

<svelte:window onclick={closeOutside} />

<div class="account">
	<details bind:this={menu} ontoggle={() => (menu.open ? step.opened() : step.closed())}>
		<summary aria-label="Account menu" title="Account">
			<span class="initial">{initial}</span>
		</summary>
		<div class="menu">
			<form method="POST" action="/?/signout" use:enhance={leaveApp}>
				<button>Sign out</button>
			</form>
		</div>
	</details>
</div>

<style>
	.account {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
	}

	details {
		position: relative;
	}

	summary {
		position: relative;
		list-style: none;
		border-radius: 999px;
	}

	summary::after {
		content: '';
		position: absolute;
		inset: -4px;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.initial {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		background: var(--color-brand);
		font-weight: 600;
		color: #fff;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		z-index: 10;
		display: grid;
		min-width: 13rem;
		border-radius: 0.75rem;
		background: var(--color-receipt);
		padding: 0.35rem;
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.08),
			0 12px 28px -10px rgb(0 0 0 / 0.35);
	}

	.menu button {
		display: block;
		width: 100%;
		border-radius: 0.5rem;
		padding: 0.6rem 0.75rem;
		text-align: left;
		font-size: 0.9rem;
		color: var(--color-receipt-ink);
	}

	@media (hover: hover) {
		.menu button:hover {
			background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		}
	}

	.menu button:focus-visible {
		outline: 2px solid var(--color-accent);
	}
</style>
