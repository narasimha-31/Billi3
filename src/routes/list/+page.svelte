<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import AppShell from '../AppShell.svelte';
	import ConfirmButton from '../ConfirmButton.svelte';
	import ItemSearch from './ItemSearch.svelte';
	import { money, shortDay, storeName } from '../../format';
	import { listPins } from '../../list-compare';
	import type { MapPin } from '../StoreMap.svelte';
	import MapFrame from '../MapFrame.svelte';
	import MapLegend from '../MapLegend.svelte';
	import AisleIcon from '../AisleIcon.svelte';

	let { data, form } = $props();

	const open = $derived(data.open);
	const onList = $derived(new Set((open?.list ?? []).map((name) => name.toLowerCase())));
	const quick = $derived(data.products.map((p) => p.name).filter((name) => !onList.has(name.toLowerCase())).slice(0, 6));
	// the store that has the most of the list, at the lowest total
	const best = $derived(open?.stores[0]?.store ?? null);
	const unit = (per: string | null) => (per === 'lb' ? '/lb' : '');
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const still = $derived(prefersReducedMotion.current);

	// each store's cheapest items on the map; tapping one says which they are
	const pins = $derived(open ? listPins(open.items, data.places) : []);
	const most = $derived(Math.max(...pins.map((p) => p.items.length)));
	const mapPins = $derived<MapPin[]>(
		pins.map((p) => ({ id: p.store, lat: p.lat, lng: p.lng, label: `${storeName(p.store) ?? p.store} · ${p.items.length} ${p.items.length === 1 ? 'item' : 'items'}`, cents: p.cents, title: storeName(p.store) ?? p.store, cheapest: p.items.length === most }))
	);
	// a saved food goes onto the open list, or else the first one
	const target = $derived(open ? { id: open.id, name: open.name } : data.lists[0] ? { id: data.lists[0].id, name: data.lists[0].name } : null);
	let picked = $state<string | null>(null);
	const pickedPin = $derived(pins.find((p) => p.store === picked) ?? null);

	let creating = $state(false);
	let renaming = $state(false);
	$effect.pre(() => {
		void open?.id;
		renaming = false;
		picked = null;
	});

	const made = () => async ({ update }: { update: () => Promise<void> }) => {
		await update();
		creating = false;
	};
	const renamed = () => async ({ update, result }: { update: () => Promise<void>; result: { type: string } }) => {
		await update();
		if (result.type === 'success') renaming = false;
	};
</script>

<svelte:head>
	<title>Lists · Billie</title>
</svelte:head>

<AppShell firstName={data.firstName}>
	<main>
		<div class="title-row">
			<h1 class="large-title">Lists</h1>
			{#if data.lists.length && data.lists.length < 10 && !creating}
				<button type="button" class="new-button" onclick={() => (creating = true)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					New list
				</button>
			{/if}
		</div>

		{#if creating || !data.lists.length}
			<form class="create surface" method="POST" action="?/create" use:enhance={made} transition:slide={{ duration: still ? 0 : 200 }}>
				<label for="new-title">{data.lists.length ? 'Name the new list' : 'Make a list for each kind of shop, like Weekly, Gym or Party'}</label>
				<div class="add">
					<!-- svelte-ignore a11y_autofocus -->
					<input id="new-title" name="title" placeholder="Weekly, Gym, Keto week" maxlength="30" required autocomplete="off" autofocus={creating} />
					<button class="pill-button">Create</button>
					{#if data.lists.length}<button type="button" class="cancel" onclick={() => (creating = false)}>Cancel</button>{/if}
				</div>
			</form>
		{/if}
		{#if form?.problem}<p class="problem" role="alert">{form.problem}</p>{/if}

		{#if data.saved.length}
			<section class="saved surface" aria-labelledby="saved-title">
				<h2 id="saved-title">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h11v16l-5.5-4-5.5 4z" /></svg>
					Saved for your next shop
				</h2>
				<ul>
					{#each data.saved as food (food.name)}
						<li transition:slide={{ duration: still ? 0 : 200 }}>
							<div class="food">
								<p class="food-name"><AisleIcon aisle={food.category} />{food.name}</p>
								{#if food.why}<p class="food-why">{food.why}</p>{/if}
								{#if food.allergens.length}<p class="food-allergy">Contains {food.allergens.map((a) => (a === 'milk' ? 'milk (lactose)' : a)).join(', ')}</p>{/if}
								{#if food.source_url}<a class="food-source" href={food.source_url} target="_blank" rel="noopener noreferrer">From {food.source}</a>{/if}
							</div>
							<div class="food-actions">
								{#if target}
									<form method="POST" action="?/add" use:enhance>
										<input type="hidden" name="list" value={target.id} />
										<input type="hidden" name="name" value={food.name} />
										<button class="round" aria-label="Add {food.name} to {target.name}" title="Add to {target.name}">
											<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
										</button>
									</form>
								{/if}
								<form method="POST" action="?/unsave" use:enhance>
									<input type="hidden" name="name" value={food.name} />
									<button class="round quiet" aria-label="Remove {food.name} from saved" title="Remove">
										<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
									</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<ul class="lists">
			{#each data.lists as list (list.id)}
				{@const isOpen = open?.id === list.id}
				<li class="list surface" class:open={isOpen}>
					<a class="list-head" href={isOpen ? '/list' : `/list?open=${list.id}`} aria-expanded={isOpen} data-sveltekit-noscroll data-sveltekit-replacestate>
						<span class="list-name">{list.name}</span>
						<span class="list-meta">{plural(list.count, 'item')}{list.spentCents ? ` · ${money(list.spentCents)} on these this month` : ''}</span>
						{#if list.best}
							<span class="list-est">
								<strong>{money(list.best.cents)}</strong>
								<span>at {storeName(list.best.store)}{list.best.has < list.count ? `, ${list.best.has} of ${list.count}` : ''}</span>
							</span>
						{/if}
						<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
					</a>

					{#if isOpen && open}
						<div class="body" transition:slide={{ duration: still ? 0 : 240 }}>
							<div class="plan">
								<div class="tools">
									{#if renaming}
										<form class="add" method="POST" action="?/rename" use:enhance={renamed}>
											<input type="hidden" name="list" value={open.id} />
											<!-- svelte-ignore a11y_autofocus -->
											<input name="title" value={open.name} aria-label="List name" maxlength="30" required autocomplete="off" autofocus />
											<button class="pill-button">Save</button>
											<button type="button" class="cancel" onclick={() => (renaming = false)}>Cancel</button>
										</form>
									{:else}
										<button type="button" class="tool" onclick={() => (renaming = true)}>Rename</button>
										{#if open.list.length}
											<form method="POST" action="?/clear" use:enhance>
												<input type="hidden" name="list" value={open.id} />
												<button class="tool">Clear items</button>
											</form>
										{/if}
										<form method="POST" action="?/delete" use:enhance>
											<input type="hidden" name="list" value={open.id} />
											<ConfirmButton class="tool danger" question="Delete {open.name}?" detail="Its items go too." yes="Delete">Delete list</ConfirmButton>
										</form>
									{/if}
								</div>

								<ItemSearch products={data.products} {onList} list={open.id} listName={open.name} />

								{#if quick.length}
									<div class="quick" aria-label="Often bought">
										{#each quick as name (name)}
											<form method="POST" action="?/add" use:enhance>
												<input type="hidden" name="list" value={open.id} />
												<button class="chip" name="name" value={name}>+ {name}</button>
											</form>
										{/each}
									</div>
								{/if}

								{#if open.list.length}
									<ul class="group items">
										{#each open.items as item (item.name)}
											<li class="row item">
												<span class="row-title">{item.name}</span>
												<span class="row-sub">
													{#if item.prices.length}
														{item.prices.length > 1 ? 'Cheapest' : 'Only'} at {storeName(item.prices[0].store)}{item.lastOn ? ` · last bought ${shortDay(item.lastOn)}` : ''}
													{:else}
														No price yet, not on your receipts
													{/if}
												</span>
												<span class="row-value">{item.lowest === null ? '' : money(item.lowest) + unit(item.per)}</span>
												<form method="POST" action="?/remove" use:enhance>
													<input type="hidden" name="list" value={open.id} />
													<button class="remove" name="name" value={item.name} aria-label="Remove {item.name}">
														<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
													</button>
												</form>
											</li>
										{/each}
									</ul>
								{:else}
									<p class="empty">Add what you plan to buy. Billie shows what it costs at each store you shop at, from your own receipts.</p>
								{/if}
								<!-- every change is already saved; this only closes the list -->
								<a class="done pill-button" href="/list" data-sveltekit-noscroll data-sveltekit-replacestate>Done</a>
							</div>

							{#if open.list.length && open.stores.length}
								<section class="where" aria-label="Where to buy it">
									<h2 class="where-title">Where to buy it</h2>
									{#if mapPins.length}
										{#snippet pickedNote()}
											<p class="map-note" aria-live="polite">
												{#if pickedPin}
													<strong>{storeName(pickedPin.store)}</strong> is cheapest for {pickedPin.items.join(', ')}: {money(pickedPin.cents)} there.
												{:else}
													Tap a pin to see which items are cheapest there.
												{/if}
											</p>
										{/snippet}
										{#snippet legend()}
											<MapLegend
												keys={[
													{ kind: 'tag', sample: 'Store · 2 items', text: 'how many things on this list are cheapest there' },
													{ kind: 'cheapest', sample: `${most} items`, text: 'the store with the most of them. Tap a pin for the total.' }
												]}
											/>
										{/snippet}
										<div class="map">
											<MapFrame you={data.you} pins={mapPins} selected={picked} onpick={(id) => (picked = picked === id ? null : id)} label="Where each item on {open.name} is cheapest" title="{open.name}: where each item is cheapest">
												{#snippet bar()}
													{@render legend()}
													{@render pickedNote()}
												{/snippet}
											</MapFrame>
											<div class="map-under">
												{@render legend()}
												{@render pickedNote()}
											</div>
										</div>
									{/if}
									<ul class="group">
										{#each open.stores as store (store.store)}
											<li class="row" class:best={store.store === best}>
												<span class="row-title">{storeName(store.store)}</span>
												<span class="row-sub">
													{store.has} of {open.items.length - open.unpriced.length} items{store.cheapest ? ` · cheapest for ${store.cheapest}` : ''}{store.missing.length ? ` · no ${store.missing.join(', ')}` : ''}
												</span>
												<span class="row-value">{money(store.cents)}</span>
											</li>
										{/each}
										{#if open.stores.length > 1 && open.split.stores > 1}
											<li class="row">
												<span class="row-title">Each at its cheapest store</span>
												<span class="row-sub">{open.split.stores} stores</span>
												<span class="row-value">{money(open.split.cents)}</span>
											</li>
										{/if}
									</ul>
									<p class="note">Your last price at each store. Weighed items count as one pound.</p>
								</section>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</main>
</AppShell>

<style>
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.new-button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2.75rem;
		border-radius: 999px;
		background: var(--color-accent-fill);
		padding: 0.55rem 1.1rem 0.55rem 0.9rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #fff;
		transition: transform var(--standard) var(--ease);
	}

	.new-button svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}

	.new-button:active,
	.tool:active,
	.chip:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.create {
		margin-top: 1rem;
		padding: 1rem;
	}

	.create label {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.lists {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		align-items: start;
		gap: 0.85rem;
		margin-top: 1.25rem;
	}

	/* the open list takes the full width; the others stay as cards around it */
	.list.open {
		grid-column: 1 / -1;
	}

	.list,
	.plan,
	.where {
		min-width: 0;
	}

	/* not clipped, so the search's suggestions can hang past the card */
	.list-head {
		border-radius: inherit;
	}

	.list.open .list-head {
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0;
	}

	.list-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas: 'name est chevron' 'meta est chevron';
		align-items: center;
		gap: 0.2rem 1rem;
		padding: 1rem 1.1rem;
		transition: background-color var(--standard) var(--ease);
	}

	.list-head:active {
		background: rgb(118 118 128 / 0.1);
		transition-duration: var(--quick);
	}

	.list-head:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
		border-radius: inherit;
	}

	.list-name {
		grid-area: name;
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.list-meta {
		grid-area: meta;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.list-est {
		grid-area: est;
		display: grid;
		justify-items: end;
		text-align: right;
	}

	.list-est strong {
		font-size: 1.0625rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		color: var(--color-ink);
	}

	.list-est span {
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.chevron {
		grid-area: chevron;
		width: 1.15rem;
		height: 1.15rem;
		fill: none;
		stroke: var(--color-muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform var(--standard) var(--ease);
	}

	.open .chevron {
		transform: rotate(180deg);
	}

	.body {
		display: grid;
		gap: 1.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-line) 55%, transparent);
		padding: 1rem 1.1rem 1.25rem;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.tools .add {
		flex: 1;
		margin-top: 0;
	}

	.tool,
	.tools :global(.tool) {
		min-height: 2.25rem;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.12);
		padding: 0.35rem 0.9rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-ink);
		transition: transform var(--standard) var(--ease);
	}

	.tools :global(.tool.danger) {
		color: var(--color-up);
	}

	.cancel {
		padding: 0 0.5rem;
		font-size: 0.9375rem;
		color: var(--color-accent);
	}

	/* a laptop puts where to buy it beside the items */
	@media (min-width: 1024px) {
		.body {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
			align-items: start;
			gap: 2rem;
		}

		.where .map {
			--map-height: min(24rem, 45dvh);
		}
	}

	.where-title {
		margin: 0 0 0.6rem 0.15rem;
		font-size: 1.0625rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.map {
		--map-height: 15rem;
		margin-bottom: 0.75rem;
	}

	.map-under {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}

	.map-note {
		margin: 0 0.25rem;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.map-note strong {
		font-weight: 600;
		color: var(--color-ink);
	}

	.add {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	/* 16px text: iOS Safari zooms the page on any smaller field */
	.add input:not([type='hidden']) {
		flex: 1;
		min-width: 0;
		border: 1px solid color-mix(in srgb, var(--color-sep) 18%, transparent);
		border-radius: 999px;
		background: var(--color-surface);
		padding: 0.65rem 1rem;
		font-size: 1rem;
		color: var(--color-ink);
	}

	.add input:focus {
		border-color: var(--color-accent);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent);
	}

	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.chip {
		min-height: 2.25rem;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.1);
		padding: 0.35rem 0.85rem;
		font-size: 0.9375rem;
		color: var(--color-ink);
		transition: transform var(--quick) var(--ease);
	}

	.chip:focus-visible,
	.remove:focus-visible,
	.tool:focus-visible,
	.new-button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.chip,
		.tool,
		.tools :global(.tool) {
			min-height: 2.75rem;
		}
	}

	.done {
		display: inline-flex;
		margin-top: 1rem;
	}

	.items {
		margin-top: 1rem;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-line) 45%, transparent);
	}

	.best .row-title,
	.best .row-value {
		color: var(--color-accent);
		font-weight: 600;
	}

	.row-sub {
		white-space: normal;
	}

	.item {
		grid-template-columns: minmax(0, 1fr) auto 2.75rem;
	}

	.item form {
		grid-column: 3;
		grid-row: 1 / span 2;
	}

	.remove {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		margin-right: -0.75rem;
		border-radius: 999px;
		color: var(--color-muted);
	}

	.remove svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.note,
	.empty,
	.problem {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--color-muted);
	}

	.empty {
		margin-top: 1rem;
		font-size: 0.9375rem;
	}

	.problem {
		color: var(--color-up);
	}

	@media (hover: hover) {
		.list-head:hover {
			background: rgb(118 118 128 / 0.05);
		}
	}

	.saved {
		margin-bottom: 1rem;
		padding: 1rem 1rem 0.5rem;
	}

	.saved h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 1.0625rem;
		font-weight: 600;
	}

	.saved h2 svg {
		width: 1.15rem;
		height: 1.15rem;
		fill: color-mix(in srgb, var(--color-accent) 18%, transparent);
		stroke: var(--color-accent);
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.saved li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.75rem;
		align-items: start;
		padding: 0.8rem 0;
	}

	.saved li + li {
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 12%, transparent);
	}

	/* on wide screens saved foods sit in columns, so each one's buttons stay beside it */
	@media (min-width: 1024px) {
		.saved ul {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
			column-gap: 2rem;
		}

		.saved li + li {
			border-top: 0;
		}
	}

	.food {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.food-name {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.food-why {
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--color-muted);
	}

	.food-allergy {
		font-size: 0.8125rem;
		color: #8a4508;
	}

	.food-source {
		justify-self: start;
		font-size: 0.8125rem;
		color: var(--color-muted);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--color-muted) 40%, transparent);
		text-underline-offset: 3px;
	}

	.food-actions {
		display: flex;
		gap: 0.35rem;
	}

	.round {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-accent);
		transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.round.quiet {
		background: rgb(118 118 128 / 0.12);
		color: var(--color-muted);
	}

	.round:active {
		transform: scale(0.92);
	}

	.round:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.round svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
</style>
