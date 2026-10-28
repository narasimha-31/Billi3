<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { backStep } from '../back-step.svelte';
	import { directionsTo, streetOf, townOf, type Placed } from '../branches';
	import { shortMiles, type Point } from '../distance';
	import { money, storeName } from '../format';
	import MapUnlock from './MapUnlock.svelte';
	import StoreMap from './StoreMap.svelte';

	type Details = {
		store: { id: string; name: string; visits: number };
		map: { on: boolean; zip: string | null; you: Point | null };
		branches: Placed[];
		unplaced: number;
		cheapest: { name: string; per: string; cents: number; next_cents: number }[];
	};

	// One store, opened from a pin, a receipt or Settings. Null closes it.
	let { storeId = $bindable(null) }: { storeId?: string | null } = $props();

	let dialog: HTMLDialogElement;
	const step = backStep('store', () => dialog.open && dialog.close());
	let details = $state<Details | null>(null);
	let problem = $state('');
	let busy = $state(false);
	let typing = $state<string | null>(null);
	// the branch whose address is being corrected, and what is typed for it
	let fixing = $state<string | null>(null);
	let fixed = $state('');

	async function load(id: string) {
		details = null;
		problem = '';
		const response = await fetch(`/stores/${id}`);
		if (response.ok) details = await response.json();
		else problem = 'This store couldn’t be loaded. Try again.';
	}

	$effect(() => {
		if (storeId) {
			if (!dialog.open) dialog.showModal();
			untrack(step.opened);
			load(storeId);
		} else if (dialog.open) dialog.close();
	});

	async function send(body: object) {
		if (!storeId) return;
		busy = true;
		problem = '';
		const response = await fetch(`/stores/${storeId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const answer = await response.json().catch(() => ({ problem: 'That didn’t save. Try again.' }));
		busy = false;
		if (!response.ok) {
			problem = answer.problem ?? 'That didn’t save. Try again.';
			return;
		}
		details = answer;
		typing = null;
		fixing = null;
		if (answer.problem) problem = answer.problem;
		await invalidateAll();
	}

	// Places on OpenStreetMap matching what's typed, listed the way a map app does, so the store is
	// picked instead of its address guessed; it starts from the store's own name. A pause after
	// typing before each search keeps to OpenStreetMap's one request a second.
	type Place = { name: string | null; address: string; miles: number };
	let places = $state<Place[] | null>(null);
	let fromWeb = $state(false);
	let webClosed = $state(false);
	let searching = $state(false);
	// which box the suggestions belong to: finding the store, or a branch's address being changed
	let searchFor = $state<string>('find');
	let timer: ReturnType<typeof setTimeout> | undefined;
	function search(text: string, target = 'find') {
		clearTimeout(timer);
		searchFor = target;
		const id = storeId;
		if (!id || text.trim().length < 3) {
			places = null;
			return;
		}
		searching = true;
		timer = setTimeout(async () => {
			const response = await fetch(`/stores/${id}/nearby?q=${encodeURIComponent(text.trim())}`).catch(() => null);
			const answer = response?.ok ? await response.json() : { places: [] };
			if (id !== storeId || text !== (target === 'find' ? typing : fixed)) return;
			places = answer.places ?? [];
			fromWeb = answer.fromWeb === true;
			webClosed = answer.searchClosed === true;
			searching = false;
		}, /^\d/.test(text.trim()) ? 300 : 700);
	}

	$effect(() => {
		if (details && typing === null && (details.unplaced > 0 || details.branches.length === 0)) {
			typing = storeName(details.store.name) ?? '';
			search(typing);
		}
	});

	const pins = $derived(details?.branches.map((b) => ({ id: b.key, lat: b.lat, lng: b.lng, label: streetOf(b.address) ?? storeName(b.name), title: streetOf(b.address) ?? storeName(b.name) ?? '', guess: b.guess })) ?? []);
</script>

{#snippet suggestions(pick: (address: string) => void)}
	{#if searching}
		<p class="sub" aria-live="polite">Searching the map…</p>
	{:else if places?.length}
		<ul class="places" aria-label="Places found">
			{#each places as place (place.address)}
				<li>
					<button type="button" disabled={busy} onclick={() => pick(place.address)}>
						<span class="place-name">{place.name ?? streetOf(place.address)}</span>
						<span class="sub">{place.address}</span>
						<span class="far">{shortMiles(place.miles)}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if fromWeb}<p class="sub">Not on OpenStreetMap, so these addresses come from the web. Pick the one you went to.</p>{/if}
	{:else if places}
		<p class="sub" aria-live="polite">
			{webClosed ? 'Not on OpenStreetMap, and web search is used up for today. Type the street address instead.' : 'Nothing found by that name nearby. Try the street address.'}
		</p>
	{/if}
{/snippet}

<dialog bind:this={dialog} class="store-sheet" aria-labelledby="store-sheet-title" onclose={() => {
		step.closed();
		storeId = null;
		details = null;
		typing = null;
		places = null;
	}} onclick={(e) => e.target === dialog && dialog.close()}>
	<div class="body">
		<header>
			<div>
				<h2 id="store-sheet-title">{storeName(details?.store.name ?? null) ?? 'Store'}</h2>
				{#if details}<p class="sub">{details.store.visits} {details.store.visits === 1 ? 'receipt' : 'receipts'}{#if details.branches.length > 1} · {details.branches.length} branches you use{/if}</p>{/if}
			</div>
			<button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
			</button>
		</header>

		{#if !details}
			{#if problem}<p class="problem" role="alert">{problem}</p>{:else}<p class="sub loading">Loading…</p>{/if}
		{:else if !details.map.on}
			<p class="lead">Turn on the store map to see where {storeName(details.store.name)} is and how far.</p>
			<MapUnlock />
		{:else}
			{#if pins.length}
				<div class="mini"><StoreMap you={details.map.you} {pins} label="Where {storeName(details.store.name)} is" /></div>
			{/if}

			<ul class="branches">
				{#each details.branches as branch (branch.key)}
					<li>
						<div class="line">
							<span class="street">{streetOf(branch.address) ?? 'Branch'}</span>
							<span class="far">{branch.away ? `Away · ${townOf(branch.address) ?? ''}` : shortMiles(branch.miles)}</span>
						</div>
						<p class="sub">
							{[`${branch.visits} ${branch.visits === 1 ? 'visit' : 'visits'}`, branch.address].filter(Boolean).join(' · ')}
						</p>
						{#if branch.guess}
							<div class="guess">
								<p>Probably this branch. Is it?</p>
								<button type="button" class="pill-button small" disabled={busy} onclick={() => send({ action: 'confirm', key: branch.key })}>Yes, that’s it</button>
							</div>
						{/if}
						{#if fixing === branch.key}
							<form
								class="where"
								onsubmit={(e) => {
									e.preventDefault();
									send({ action: 'move', key: branch.key, address: fixed });
								}}
							>
								<label>
									<span>The right address for this branch</span>
									<input bind:value={fixed} oninput={() => search(fixed, branch.key)} placeholder="Street, city and state" autocomplete="off" maxlength="200" required disabled={busy} />
								</label>
								{#if searchFor === branch.key}{@render suggestions((address) => send({ action: 'move', key: branch.key, address }))}{/if}
								<div class="actions">
									<button class="pill-button small" disabled={busy}>{busy ? 'Finding it…' : 'Save'}</button>
									<button type="button" class="text" onclick={() => (fixing = null)}>Cancel</button>
								</div>
							</form>
						{:else}
							<div class="links">
								<a class="go" href={directionsTo(branch)} target="_blank" rel="noopener">Directions</a>
								<button
									type="button"
									class="go"
									onclick={() => {
										fixing = branch.key;
										fixed = branch.address ?? '';
									}}>Change address</button
								>
							</div>
						{/if}
					</li>
				{/each}
			</ul>

			{#if details.unplaced > 0 || details.branches.length === 0}
				<form
					class="where"
					onsubmit={(e) => {
						e.preventDefault();
						send({ action: 'address', address: typing ?? '' });
					}}
				>
					<label>
						<span>{details.unplaced === 1 ? 'One receipt here isn’t' : `${details.unplaced} receipts here aren’t`} on the map yet. Find the store:</span>
						<input bind:value={typing} oninput={() => search(typing ?? '')} type="search" placeholder="Store name or address" autocomplete="off" maxlength="200" required disabled={busy} />
					</label>
					{#if searchFor === 'find'}{@render suggestions((address) => send({ action: 'address', address }))}{/if}
					<div class="actions">
						<button class="pill-button small" disabled={busy}>{busy ? 'Finding it…' : 'Use what I typed'}</button>
					</div>
				</form>
			{/if}

			{#if details.cheapest.length}
				<h3>Cheapest here for you</h3>
				<ul class="cheapest">
					{#each details.cheapest as item (item.name + item.per)}
						<li>
							<span>{item.name}</span>
							<span class="save">{money(item.cents)}{item.per === 'lb' ? '/lb' : ''} · {money(item.next_cents - item.cents)} less</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
		{/if}
	</div>
</dialog>

<style>
	/* a bottom sheet on a phone, a card in the middle on a laptop */
	.store-sheet {
		width: min(28rem, 100vw);
		max-width: 100vw;
		max-height: min(88dvh, 44rem);
		margin: auto;
		border: 0;
		border-radius: 20px;
		background: var(--color-surface);
		padding: 0;
		color: var(--color-ink);
		box-shadow:
			0 24px 60px -16px rgb(0 0 0 / 0.35),
			0 0 0 0.5px rgb(0 0 0 / 0.08);
	}

	.store-sheet[open] {
		animation: sheet-in 260ms var(--ease);
	}

	.store-sheet::backdrop {
		background: color-mix(in srgb, var(--color-shade) 28%, transparent);
		animation: fade-in 200ms var(--ease);
	}

	@keyframes sheet-in {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@media (max-width: 640px) {
		.store-sheet {
			width: 100vw;
			margin: auto 0 0;
			border-radius: 20px 20px 0 0;
		}

		@keyframes sheet-in {
			from {
				transform: translateY(100%);
			}
		}
	}

	.body {
		display: grid;
		gap: 0.9rem;
		padding: 1.1rem 1.25rem calc(1.4rem + env(safe-area-inset-bottom));
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.375rem;
		font-weight: 650;
		letter-spacing: -0.02em;
	}

	h3 {
		margin-top: 0.25rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	.sub,
	.lead {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.lead {
		color: var(--color-ink);
	}

	.close {
		display: grid;
		place-items: center;
		flex: none;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: rgb(118 118 128 / 0.12);
		transition: transform var(--standard) var(--ease);
	}

	.close:active {
		transform: scale(0.92);
		transition-duration: var(--quick);
	}

	.close svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 2.2;
		stroke-linecap: round;
	}

	.close:focus-visible,
	.go:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.mini {
		overflow: hidden;
		height: 9.5rem;
		border-radius: 14px;
		box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.08);
	}

	.branches {
		display: grid;
	}

	.branches li {
		display: grid;
		gap: 0.2rem;
		padding: 0.7rem 0;
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 12%, transparent);
	}

	.branches li:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.line {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-weight: 600;
	}

	.far {
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
		white-space: nowrap;
	}

	.guess {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin-top: 0.3rem;
		font-size: 0.875rem;
	}

	.go {
		justify-self: start;
		font-size: 0.875rem;
		color: var(--color-accent);
	}

	.go:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.links,
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.text {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.where {
		display: grid;
		gap: 0.5rem;
		justify-items: start;
	}

	.where label {
		display: grid;
		gap: 0.35rem;
		width: 100%;
		font-size: 0.875rem;
	}

	/* 16px text: iOS Safari zooms the page on any smaller field */
	.where input {
		border: 1px solid color-mix(in srgb, var(--color-sep) 18%, transparent);
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
		font-size: 1rem;
	}

	.where input:focus {
		border-color: var(--color-accent);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent);
	}

	.places {
		width: 100%;
		overflow: hidden;
		border-radius: 12px;
		background: var(--color-raised);
		box-shadow: 0 0 0 1px var(--color-line);
	}

	.places li + li {
		border-top: 1px solid var(--color-line);
	}

	.places button {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.1rem 0.75rem;
		width: 100%;
		padding: 0.65rem 0.85rem;
		text-align: left;
		color: var(--color-ink);
		transition: background-color 120ms;
	}

	.places button:active {
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}

	@media (hover: hover) {
		.places button:hover {
			background: color-mix(in srgb, var(--color-accent) 5%, transparent);
		}
	}

	.places button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.place-name {
		font-weight: 600;
	}

	.places .sub {
		grid-column: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.places .far {
		grid-row: 1;
		grid-column: 2;
		font-size: 0.875rem;
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
	}

	.cheapest li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		font-size: 0.9375rem;
	}

	.save {
		color: var(--color-cheaper);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.pill-button.small {
		padding: 0.4rem 0.9rem;
		font-size: 0.875rem;
	}

	.problem {
		font-size: 0.875rem;
		color: var(--color-danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.store-sheet[open],
		.store-sheet::backdrop {
			animation: none;
		}
	}
</style>
