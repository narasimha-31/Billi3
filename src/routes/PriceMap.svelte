<script lang="ts">
	import { slide } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { directionsTo, isOld, itemPins, streetOf, townOf, type Pin, type Placed } from '../branches';
	import { shortMiles, type Point } from '../distance';
	import { money, shortDay, storeName } from '../format';
	import type { History } from '../price-history';
	import MapUnlock from './MapUnlock.svelte';
	import MapFrame from './MapFrame.svelte';
	import MapLegend from './MapLegend.svelte';

	// Where each branch sold this item, or a locked picture of a map until the shopper turns it on.
	// Picking a pin filters the price list to that store; its details open the store sheet.
	let {
		map,
		places,
		stores,
		history,
		only = $bindable(null),
		onstore
	}: {
		map: { on: boolean; zip: string | null; you: Point | null };
		places: Placed[];
		stores: { id: string; name: string }[];
		history: History;
		only?: string | null;
		onstore?: (storeId: string) => void;
	} = $props();

	let opening = $state(false);
	// the map on the whole screen; the store sheet takes its place when asked for
	let big = $state(false);
	let frame = $state<MapFrame>();
	function details(storeId: string) {
		frame?.handOff();
		onstore?.(storeId);
	}
	let withAway = $state(false);
	let picked = $state<string | null>(null);

	const per = $derived(history.per === 'lb' ? '/lb' : '');
	const pins = $derived(itemPins(places, history.all, withAway, history.per));
	// a store that sold it the other way (each against per pound) says so on its pin
	const unitOf = (p: Pin) => (p.per === 'lb' ? '/lb' : p.per !== history.per ? ' ea' : '');
	const pin = $derived(pins.find((p) => `${p.storeId}@${p.key}` === picked) ?? null);
	// away stores that sold this item, so the offer to show them only appears when it adds something
	const awayCount = $derived(new Set(itemPins(places, history.all, true).filter((p) => p.away && p.cents !== null).map((p) => p.storeId)).size);
	// stores this item was bought at that have no branch on the map yet
	const missing = $derived(history.stores.map((s) => s.store).filter((name) => !places.some((p) => p.name === name)).map((name) => stores.find((s) => s.name === name)).filter((s) => s !== undefined));
	const mapPins = $derived(
		pins.map((p) => ({
			id: `${p.storeId}@${p.key}`,
			lat: p.lat,
			lng: p.lng,
			label: p.cents === null ? null : `${money(p.cents)}${unitOf(p)}`,
			cents: p.cents,
			title: `${storeName(p.name)}${streetOf(p.address) ? `, ${streetOf(p.address)}` : ''}`,
			cheapest: p.cheapest,
			guess: p.guess
		}))
	);
	const still = $derived(prefersReducedMotion.current);

	// The answer in words: the nearest branch that has sold it to the shopper, and the cheapest one,
	// or one line when they are the same branch. Without the map, only the cheapest price paid.
	const sold = $derived(pins.filter((p) => p.cents !== null && !p.away));
	const nearestPin = $derived(sold.find((p) => p.nearest) ?? null);
	const cheapestPin = $derived(sold.find((p) => p.cheapest) ?? null);
	const idOf = (p: Pin) => `${p.storeId}@${p.key}`;
	const answers = $derived.by(() => {
		if (!nearestPin) return [];
		if (!cheapestPin || idOf(cheapestPin) === idOf(nearestPin)) return [{ label: cheapestPin ? 'Nearest and cheapest' : 'Nearest that has it', pin: nearestPin }];
		return [
			{ label: 'Nearest that has it', pin: nearestPin },
			{ label: 'Cheapest near you', pin: cheapestPin }
		];
	});
	const cheapestPaid = $derived(history.visits.reduce((low, v) => (v.unitCents < low.unitCents ? v : low), history.visits[0]));

	// another item clears the pick; a filter cleared from the chips clears it too
	const product = $derived(history.name);
	$effect.pre(() => {
		void product;
		picked = null;
	});
	$effect.pre(() => {
		if (only === null) picked = null;
	});

	function pick(id: string) {
		if (picked === id) {
			picked = null;
			only = null;
			return;
		}
		picked = id;
		only = pins.find((p) => `${p.storeId}@${p.key}` === id)?.name ?? null;
	}
</script>

{#snippet answer(label: string, store: string, where: string, cents: number, date: string | null, point: Pin | null)}
	<div class="answer">
		<svelte:element this={point ? 'button' : 'div'} type={point ? 'button' : undefined} class="main" role={point ? undefined : 'group'} onclick={point ? () => pick(idOf(point)) : undefined}>
			<span class="label">{label}</span>
			<span class="store">{store}{#if where}<span class="where">{` · ${where}`}</span>{/if}</span>
			<span class="paid">{money(cents)}{point ? unitOf(point) : per}<span class="when" class:old={isOld(date)}>{` · ${date ? (isOld(date) ? `last there ${shortDay(date)}` : shortDay(date)) : 'no date'}`}</span></span>
		</svelte:element>
		{#if point}
			<a class="go" href={directionsTo(point)} target="_blank" rel="noopener" aria-label="Directions to {store}" title="Directions to {store}">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12l-9 9-9-9z M9 13.5v-2a1.5 1.5 0 0 1 1.5-1.5H15m-2-2 2 2-2 2" /></svg>
				Directions
			</a>
		{/if}
	</div>
{/snippet}

{#if map.on}
	{#if answers.length}
		<div class="answers">
			{#each answers as line (line.label)}
				{@const where = [shortMiles(line.pin.miles).replace(' ', '\u00a0'), streetOf(line.pin.address)].filter(Boolean).join(' · ')}
				{@render answer(line.label, storeName(line.pin.name) ?? line.pin.name, where, line.pin.cents!, line.pin.date, line.pin)}
			{/each}
		</div>
	{/if}
	{#snippet legend()}
		{@const unit = history.per === 'lb' ? '/lb' : ''}
		<MapLegend
			keys={[
				{ kind: 'tag', sample: `${money(history.last.unitCents)}${unit}`, text: 'last price you paid there' },
				...(pins.some((p) => p.cheapest) ? [{ kind: 'cheapest' as const, sample: `${money(Math.min(...pins.filter((p) => p.cheapest).map((p) => p.cents!)))}${unit}`, text: 'cheapest of your stores' }] : []),
				...(pins.some((p) => p.cents === null) ? [{ kind: 'dot' as const, text: 'your store, not bought there' }] : [])
			]}
		/>
	{/snippet}
	{#snippet whatsPicked()}
		{#if pin}
			<p class="picked" transition:slide={{ duration: still ? 0 : 200 }}>
				<span class="where">
					{[storeName(pin.name), streetOf(pin.address), pin.away ? (townOf(pin.address) ?? 'away') : shortMiles(pin.miles), pin.guess ? 'probably' : null].filter(Boolean).join(' · ')}
				</span>
				{#if onstore}<button type="button" class="link" onclick={() => details(pin.storeId)}>Store details</button>{/if}
			</p>
		{/if}
	{/snippet}
	{#snippet notPlaced()}
		{#if missing.length}
			<p class="missing">
				Not on the map yet:
				{#each missing as store, i (store.id)}
					<span>{#if onstore}<button type="button" class="link" onclick={() => details(store.id)}>{storeName(store.name)}</button>{:else}{storeName(store.name)}{/if}{i < missing.length - 1 ? ',' : ''}</span>{' '}
				{/each}
			</p>
		{/if}
	{/snippet}
	<div class="price-map">
		<!-- with none of the shopper's stores placed yet, an empty map says nothing; the list below does -->
		{#if pins.length}
		<MapFrame bind:this={frame} bind:big you={map.you} pins={mapPins} selected={picked} onpick={pick} label="Where you bought {history.name}" title={history.name}>
			{#snippet bar()}
				{@render legend()}
				{@render whatsPicked()}
				{@render notPlaced()}
			{/snippet}
		</MapFrame>
		{/if}
		<div class="under">
			{#if pins.length && !big}{@render legend()}{/if}
			{#if !big}{@render whatsPicked()}{/if}
			{#if pins.length && !pins.some((p) => p.cents !== null)}
				<p class="hint">None of your stores on the map has sold you this yet.</p>
			{/if}
			{#if awayCount}
				<button type="button" class="link quiet" onclick={() => (withAway = !withAway)}>
					{withAway ? 'Home area only' : `${awayCount} ${awayCount === 1 ? 'store' : 'stores'} away from home · Show`}
				</button>
			{/if}
			<!-- with a map to open, the stores not on it are told there -->
			{@render notPlaced()}
		</div>
	</div>
{:else}
	{#if cheapestPaid && history.stores.length > 1 && cheapestPaid.unitCents < history.last.unitCents}
		<div class="answers">
			{@render answer('Lowest you’ve paid', storeName(cheapestPaid.store) ?? 'Unknown store', '', cheapestPaid.unitCents, cheapestPaid.date, null)}
		</div>
	{/if}
	<!-- locked: one quiet line; the picture of a map, never a real one, only once they ask -->
	{#if opening}
		<div class="locked">
			<div class="picture" aria-hidden="true"></div>
			<div class="sheet" transition:slide={{ duration: still ? 0 : 260 }}>
				<p class="title">Where you paid what</p>
				<MapUnlock ondone={() => (opening = false)} />
			</div>
		</div>
	{:else}
		<p class="offer">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z M9 4v13.5 M15 6.5V20" /></svg>
			<button type="button" class="link" onclick={() => (opening = true)}>See your stores on a map</button>
		</p>
	{/if}
{/if}

<style>
	.price-map,
	.locked {
		margin: 0.75rem -0.5rem 0;
	}

	/* the answer, in words, before the map: label, store, what was paid and when, a way there */
	.answers {
		display: grid;
		gap: 0.15rem;
		margin-top: 1rem;
	}

	/* One answer is one row: the whole left part picks that store on the map and in the list, the
	   pill opens directions. Both are full-size targets for a thumb. */
	.answer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9375rem;
	}

	.main {
		display: grid;
		grid-template-columns: 10.5rem minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0.25rem 1rem;
		min-height: 3rem;
		margin: 0 -0.6rem;
		border-radius: 12px;
		padding: 0.55rem 0.6rem;
		text-align: left;
		color: inherit;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--quick) var(--ease),
			transform var(--standard) var(--ease);
	}

	button.main:hover {
		background: rgb(118 118 128 / 0.08);
	}

	button.main:active {
		background: rgb(118 118 128 / 0.14);
		transform: scale(0.985);
		transition-duration: var(--quick);
	}

	.label {
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.answer .store {
		overflow: hidden;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		color: var(--color-ink);
	}

	button.main:focus-visible,
	.go:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.answer .where {
		font-weight: 400;
		color: var(--color-muted);
	}

	.paid {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.when {
		font-weight: 400;
		color: var(--color-ink);
	}

	.when.old {
		color: var(--color-muted);
	}

	.go {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2.75rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		padding: 0 0.95rem 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-accent);
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--quick) var(--ease),
			transform var(--standard) var(--ease);
	}

	.go:hover {
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	}

	.go:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.go svg {
		width: 1.05rem;
		height: 1.05rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* on a phone each answer stacks inside its row: the label, the store, then what was paid; the
	   pill stays at the right edge, where the thumb already is */
	@media (max-width: 640px) {
		.answers {
			margin-top: 0;
		}

		.answer + .answer {
			border-top: 1px solid color-mix(in srgb, var(--color-sep) 12%, transparent);
		}

		.main {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.1rem;
			padding: 0.6rem 0.6rem;
		}

		.answer .store {
			white-space: normal;
		}
	}

	.under {
		display: grid;
		justify-items: start;
		gap: 0.35rem;
		padding: 0.6rem 0.25rem 0;
		font-size: 0.875rem;
	}

	.picked {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}

	.hint,
	.missing {
		color: var(--color-muted);
	}

	.link {
		border-radius: 6px;
		color: var(--color-accent);
		transition: opacity var(--quick) var(--ease);
	}

	.link:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.link:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.link.quiet {
		font-size: 0.8125rem;
	}

	/* on a touch screen the small text links get a full-height target without looking bigger */
	@media (pointer: coarse) {
		.link {
			display: inline-flex;
			align-items: center;
			min-height: 2.75rem;
			padding: 0 0.25rem;
			margin: -0.5rem -0.25rem;
		}

		.missing,
		.picked {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0 0.5rem;
		}
	}

	/* the locked map: our own drawn streets, softened, with the ask resting on top */
	.locked {
		position: relative;
		overflow: hidden;
		border-radius: 14px;
		background: var(--color-map);
		box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.08);
	}

	.picture {
		position: absolute;
		inset: 0;
		background: url('/images/street-map.webp') center / cover;
		opacity: 0.8;
		filter: saturate(0.7) blur(0.6px);
		transform: scale(1.04);
	}

	.sheet {
		position: relative;
		display: grid;
		gap: 0.35rem;
		margin: 0.75rem;
		border-radius: 14px;
		background: color-mix(in srgb, var(--color-surface) 94%, transparent);
		box-shadow:
			0 10px 30px -10px rgb(0 0 0 / 0.25),
			0 0 0 0.5px rgb(0 0 0 / 0.06);
		padding: 1rem 1.1rem 1.1rem;
	}

	.offer {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}

	.offer svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	@media (max-width: 480px) {
		.price-map,
		.locked {
			margin-inline: -0.25rem;
		}

		.price-map {
			--map-height: 9rem;
		}
	}
</style>
