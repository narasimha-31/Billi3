<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { itemPins, townOf } from '../../branches';
	import { storeTags } from '../../store-facts';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade, slide } from 'svelte/transition';
	import AisleIcon from '../AisleIcon.svelte';
	import AppShell from '../AppShell.svelte';
	import ItemPicker from '../ItemPicker.svelte';
	import PriceHistory from '../PriceHistory.svelte';
	import PriceMap from '../PriceMap.svelte';
	import StoreSheet from '../StoreSheet.svelte';

	let { data } = $props();

	// the chip lights up at once; the history follows when the server answers
	let picked = $state<string | null>(null);
	const selected = $derived(picked ?? data.selected ?? '');


	// the store filter is shared by the map's pins and the list's chips
	let only = $state<string | null>(null);
	let sheetStore = $state<string | null>(null);
	const pins = $derived(data.history && data.map.on ? itemPins(data.places, data.history.all, false, data.history.per) : []);
	const nearest = $derived(pins.find((p) => p.nearest) ?? null);
	const tags = $derived(storeTags(data.usual, nearest && { name: nearest.name, miles: nearest.miles }));
	// a purchase from a branch far from home says where it was
	const awayOf = (visit: { storeId?: string | null; branchKey?: string | null }) => {
		const branch = data.places.find((p) => p.storeId === visit.storeId && p.key === visit.branchKey);
		return branch?.away ? (townOf(branch.address) ?? 'away') : null;
	};

	// the app's signature curve, cubic-bezier(0.32, 0.72, 0, 1), close enough for a fold
	const settle = (t: number) => 1 - Math.pow(1 - t, 3.2);

	// a yes moves this item's lines into the other product, so the page goes to that product
	let answering = $state(false);
	let sameProblem = $state('');
	const answerSame: SubmitFunction = () => {
		answering = true;
		sameProblem = '';
		return async ({ result, update }) => {
			answering = false;
			if (result.type === 'success' && typeof result.data?.now === 'string') {
				picked = result.data.now;
				await goto(`?item=${encodeURIComponent(result.data.now)}`, { replaceState: true, noScroll: true, invalidateAll: true });
			} else if (result.type === 'failure') sameProblem = String(result.data?.problem ?? 'That did not save. Try again.');
			else await update({ reset: false });
		};
	};

	// The aisle changes the moment it is picked; the server then moves every line of the product and
	// the list regroups. A refusal puts the old aisle back.
	let chosenAisle = $state<string | null>(null);
	let aisleNote = $state('');
	let noteTimer: ReturnType<typeof setTimeout> | undefined;
	const shownAisle = $derived(chosenAisle ?? data.aisle ?? 'Other');
	const saveAisle: SubmitFunction = () => {
		clearTimeout(noteTimer);
		aisleNote = '';
		return async ({ result, update }) => {
			if (result.type === 'success') {
				await update({ reset: false, invalidateAll: true });
				aisleNote = `Moved to ${chosenAisle}, on every receipt`;
				noteTimer = setTimeout(() => (aisleNote = ''), 3000);
			} else aisleNote = 'That did not save. Try again.';
			chosenAisle = null;
		};
	};
	// a refresh brings a new data object; only another item resets the aisle
	const item = $derived(data.selected);
	$effect.pre(() => {
		void item;
		chosenAisle = null;
		aisleNote = '';
	});

	// On a phone an item opens as its own screen, so back (the link or the swipe) returns to the list
	// where it was left. A laptop shows both side by side and swaps the item in place.
	const PHONE = '(max-width: 959px)';
	const opened = $derived(page.url.searchParams.has('item'));
	let fromList = false;
	async function pick(name: string) {
		picked = name;
		const phone = matchMedia(PHONE).matches;
		fromList = phone;
		await goto(`?item=${encodeURIComponent(name)}`, phone ? {} : { replaceState: true, noScroll: true, keepFocus: true });
		picked = null;
	}
	function back(event: MouseEvent) {
		if (!fromList) return;
		event.preventDefault();
		fromList = false;
		history.back();
	}
</script>

<svelte:head>
	<title>Prices · Billie</title>
</svelte:head>

<AppShell fit firstName={data.firstName}>
	<main>
		<div class="columns" class:opened>
			<div class="head" class:opened>
				<div>
					<h1 class="large-title">Prices</h1>
					<p class="ask">What did I pay last time?</p>
				</div>
			</div>
			{#if data.products.length}
				<div class="picker scroll-area">
					<ItemPicker items={data.products} bind:selected={() => selected, pick} />
				</div>
				<div class="history scroll-area">
					<a class="back" href="/prices" onclick={back}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>Prices
					</a>
					{#if data.maybeSame}
						<form
							class="same"
							method="POST"
							action="?/same"
							use:enhance={answerSame}
							out:slide={{ duration: prefersReducedMotion.current ? 0 : 240, easing: settle }}
						>
							<input type="hidden" name="item" value={data.selected} />
							<p class="question">Same as {data.maybeSame}?</p>
							<p class="why">If it is, their prices show as one, from every store.</p>
							<div class="answers">
								<button class="yes" name="answer" value="yes" disabled={answering}>Same product</button>
								<button class="no" name="answer" value="no" disabled={answering}>Not the same</button>
							</div>
							{#if sameProblem}<p class="problem" role="alert">{sameProblem}</p>{/if}
						</form>
					{/if}
					{#key data.selected}
						{#if data.history}
							<div class="focus-in">
								<PriceHistory history={data.history} {tags} {awayOf} bind:only>
									{#snippet map()}
										<PriceMap map={data.map} places={data.places} stores={data.stores} history={data.history!} bind:only onstore={(id) => (sheetStore = id)} />
									{/snippet}
									{#snippet under()}
										<form class="aisle-pick" method="POST" action="?/aisle" use:enhance={saveAisle}>
											<input type="hidden" name="item" value={data.selected} />
											<span class="aisle-word" aria-hidden="true">Aisle</span>
											<label>
												<AisleIcon aisle={shownAisle} />
												<span class="visually-hidden">Aisle for {data.selected}</span>
												<select
													name="aisle"
													value={shownAisle}
													onchange={(e) => {
														chosenAisle = e.currentTarget.value;
														e.currentTarget.form?.requestSubmit();
													}}
												>
													{#each data.categories as aisle (aisle)}<option value={aisle}>{aisle}</option>{/each}
												</select>
												<svg class="down" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
											</label>
											{#if aisleNote}<span class="aisle-note" role="status" transition:fade={{ duration: 160 }}>{aisleNote}</span>{/if}
										</form>
									{/snippet}
								</PriceHistory>
							</div>
						{/if}
					{/key}
				</div>
			{:else}
				<p class="lead">
					Your prices show up here once a receipt is read. <a href="/home">Add a receipt</a>.
				</p>
			{/if}
		</div>
	</main>
	<StoreSheet bind:storeId={sheetStore} />
</AppShell>

<style>
	/* the aisle closes the card as a quiet pill; the whole pill opens the menu */
	.aisle-pick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.6rem;
	}

	.aisle-pick label {
		position: relative;
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.1);
		color: var(--color-ink);
		transition:
			background-color var(--quick) var(--ease),
			transform var(--standard) var(--ease);
	}

	.aisle-pick label:hover {
		background: rgb(118 118 128 / 0.16);
	}

	.aisle-pick label:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.aisle-pick label:focus-within {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.aisle-pick :global(.aisle-icon) {
		position: absolute;
		left: 0.6rem;
		width: 1rem;
		height: 1rem;
		color: var(--color-accent);
		pointer-events: none;
	}

	/* 16px text: iOS Safari zooms the page on any smaller field */
	.aisle-pick select {
		appearance: none;
		border: 0;
		border-radius: 999px;
		background: transparent;
		padding: 0.2rem 1.9rem 0.2rem 2rem;
		font-size: 1rem;
		color: inherit;
		cursor: pointer;
		outline: none;
	}

	.aisle-pick .down {
		position: absolute;
		right: 0.6rem;
		width: 0.95rem;
		height: 0.95rem;
		fill: none;
		stroke: var(--color-muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}

	.aisle-word {
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.aisle-note {
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.ask {
		margin-top: 0.3rem;
		font-size: 1.0625rem;
		color: var(--color-muted);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
	}

	.problem {
		font-size: 0.8125rem;
		color: var(--color-up);
	}

	/* minmax(0, …) so the swipeable row of tiles never widens the page */
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.5rem;
	}

	.back {
		display: none;
	}

	/* a phone shows the list or one item, never both */
	@media (max-width: 959px) {
		.columns.opened .picker,
		.columns:not(.opened) .history,
		.head.opened {
			display: none;
		}

		.columns.opened .history {
			margin-top: 0;
		}

		.back {
			display: inline-flex;
			align-items: center;
			gap: 0.15rem;
			min-height: 2.75rem;
			margin: -0.5rem 0 0.25rem -0.4rem;
			font-size: 1.0625rem;
			color: var(--color-accent);
		}

		.back svg {
			width: 1.4rem;
			height: 1.4rem;
			fill: none;
			stroke: currentColor;
			stroke-width: 2.2;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.back:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
			border-radius: 8px;
		}
	}

	/* the history stays in view while the list beside it is browsed */
	@media (min-width: 960px) {
		.columns {
			grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			align-items: start;
			gap: 1.5rem 3rem;
		}

		/* the item card runs from the top, beside the title */
		.history {
			grid-column: 2;
			grid-row: 1 / -1;
		}

		.history {
			position: sticky;
			top: 1.5rem;
		}
	}

	.same {
		margin-bottom: 1rem;
		border-radius: 18px;
		background: var(--color-surface);
		padding: 1rem 1.1rem 1.1rem;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}

	.question {
		font-size: 1.0625rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.why {
		margin-top: 0.2rem;
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.85rem;
	}

	.answers button {
		border-radius: 999px;
		padding: 0.55rem 1.05rem;
		font-size: 0.9375rem;
		font-weight: 500;
		transition: background-color 150ms;
	}

	.yes {
		background: var(--color-accent-fill);
		color: #fff;
	}

	.no {
		background: rgb(118 118 128 / 0.12);
		color: var(--color-ink);
	}

	.answers button:disabled {
		opacity: 0.55;
	}

	.answers button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.lead {
		margin-top: 0.5rem;
		color: var(--color-muted);
	}

	.lead a {
		color: var(--color-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* on a laptop the page is one screen tall; the item list and the history each scroll on their own */
	@media (min-width: 1024px) and (min-height: 600px) {
		main {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-height: 0;
		}

		.columns {
			flex: 1;
			min-height: 0;
			grid-template-rows: auto minmax(0, 1fr);
			align-items: stretch;
		}

		/* The whole item column scrolls as one, under a search box that stays put, so the most bought
		   and the aisles always keep their full height, whatever the screen's height. */
		.picker {
			display: flex;
			flex-direction: column;
			min-height: 0;
			padding-left: 3px;
			padding-bottom: 1rem;
		}

		.picker > :global(*) {
			flex: none;
		}

		.picker > :global(.search) {
			position: sticky;
			top: 0;
			z-index: 1;
			margin-top: 3px;
			box-shadow: 0 -3px 0 var(--color-raised), 0 6px 10px -4px var(--color-raised);
		}

		/* inside the scrolling column the lists are plain, not scroll boxes of their own */
		.picker > :global(.aisles),
		.picker > :global(.found) {
			overflow: visible;
			margin-right: 0;
			padding-right: 0;
			scrollbar-gutter: auto;
		}

		.history {
			flex: 0 1 auto;
			position: static;
		}
	}
</style>
