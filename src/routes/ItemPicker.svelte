<script lang="ts">
	import { untrack } from 'svelte';
	import AisleIcon from './AisleIcon.svelte';

	type Item = { name: string; category?: string | null; times?: number };

	// items come most bought first
	let { items, selected = $bindable() }: { items: Item[]; selected: string } = $props();

	const MOST_BOUGHT = 6;

	let query = $state('');
	const searching = $derived(query.trim().length > 0);
	// names are lowercased once per list, the query once per keystroke, then one substring scan
	const lowered = $derived(items.map((item) => ({ item, name: item.name.toLowerCase() })));
	const found = $derived.by(() => {
		const wanted = query.trim().toLowerCase();
		return lowered.filter(({ name }) => name.includes(wanted)).map(({ item }) => item);
	});

	// the rest of the list sorted into aisles, the fullest aisle first
	const aisles = $derived.by(() => {
		const groups = new Map<string, Item[]>();
		for (const item of items) {
			const aisle = item.category ?? 'Other';
			groups.set(aisle, [...(groups.get(aisle) ?? []), item]);
		}
		return [...groups].sort((a, b) => b[1].length - a[1].length);
	});
	// Only the first render opens the aisle of an item picked from the aisles, once, and never as an
	// attribute: Svelte re-applies an attribute whenever the list refreshes, which snapped shut an
	// aisle the shopper had just opened while a price was loading.
	const openAtStart = untrack(() => {
		const at = items.findIndex((item) => item.name === selected);
		return at >= MOST_BOUGHT ? (items[at].category ?? 'Other') : null;
	});
</script>

{#snippet chip(item: Item)}
	<button class="chip" class:selected={item.name === selected} aria-pressed={item.name === selected} onclick={() => (selected = item.name)}>
		{item.name}
	</button>
{/snippet}

<label class="search">
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-3.5-3.5" />
	</svg>
	<input bind:value={query} type="search" placeholder="Search eggs, milk, chicken" aria-label="Search an item" />
	{#if query}
		<button class="clear" aria-label="Clear the search" title="Clear the search" onclick={() => (query = '')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
		</button>
	{/if}
</label>

{#if searching}
	<div class="chips found scroll-area">
		{#each found as item (item.name)}
			{@render chip(item)}
		{:else}
			<p class="none">Nothing called "{query.trim()}" on your receipts yet.</p>
		{/each}
	</div>
{:else}
	<h2>You buy these most</h2>
	<!-- the few items bought most get even tiles that fill the column, with how often they were bought -->
	<div class="tiles">
		{#each items.slice(0, MOST_BOUGHT) as item (item.name)}
			<button class="tile" class:selected={item.name === selected} aria-pressed={item.name === selected} onclick={() => (selected = item.name)}>
				<AisleIcon aisle={item.category ?? null} />
				<span class="tile-name">{item.name}</span>
				{#if item.times}<span class="tile-times">{item.times === 1 ? 'Once' : `${item.times} times`}</span>{/if}
			</button>
		{/each}
	</div>

	{#if items.length > MOST_BOUGHT}
		<h2>By aisle</h2>
		<div class="aisles scroll-area">
			<div class="aisle-list">
				{#each aisles as [aisle, list] (aisle)}
					<details
						{@attach (el) => {
							if (untrack(() => aisle) === openAtStart) el.open = true;
						}}
					>
						<summary>
							<AisleIcon {aisle} />
							<span>{aisle}</span>
							<span class="count">{list.length}</span>
						</summary>
						<div class="chips">
							{#each list as item (item.name)}
								{@render chip(item)}
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</div>
	{/if}
{/if}

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 10px;
		/* solid, the same grey as before on the page, so a list scrolling under it never shows through */
		background: color-mix(in srgb, rgb(118 118 128) 12%, var(--color-raised));
		padding: 0 0.75rem;
	}

	.search:focus-within {
		outline: 2px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
	}

	.search svg {
		width: 1.25rem;
		height: 1.25rem;
		flex: none;
		fill: none;
		stroke: var(--color-muted);
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* 16px text: iOS Safari zooms the page on any smaller input */
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.6rem 0;
		font-size: 1rem;
		color: var(--color-ink);
		outline: none;
	}

	.search input::placeholder {
		color: var(--color-muted);
	}

	/* the browser's own blue cross is replaced by an iOS-style grey one */
	.search input::-webkit-search-cancel-button {
		-webkit-appearance: none;
	}

	.clear {
		display: grid;
		position: relative;
		flex: none;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.45);
	}

	/* a 44px reach for the thumb without a bigger look */
	.clear::after {
		content: '';
		position: absolute;
		inset: -12px;
	}

	.clear svg {
		width: 0.9rem;
		height: 0.9rem;
		fill: none;
		stroke: #fff;
		stroke-width: 2.6;
		stroke-linecap: round;
	}

	.clear:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	h2 {
		margin: 1.5rem 1rem 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.75rem;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.tile {
		display: grid;
		grid-template-rows: auto 1fr auto;
		justify-items: start;
		gap: 0.35rem;
		min-height: 6.25rem;
		border-radius: 14px;
		background: var(--color-surface);
		padding: 0.75rem 0.85rem;
		text-align: left;
		color: var(--color-ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--standard) var(--ease),
			color var(--standard) var(--ease),
			box-shadow var(--standard) var(--ease),
			transform var(--standard) var(--ease);
	}

	.tile :global(.aisle-icon) {
		color: var(--color-accent);
		transition: color var(--standard) var(--ease);
	}

	.tile-name {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.tile-times {
		font-size: 0.8125rem;
		color: var(--color-muted);
		transition: color var(--standard) var(--ease);
	}

	.tile.selected {
		background: var(--color-accent-fill);
		color: #fff;
		box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--color-accent) 60%, transparent);
	}

	.tile.selected :global(.aisle-icon),
	.tile.selected .tile-times {
		color: rgb(255 255 255 / 0.85);
	}

	.tile:active {
		transform: scale(0.97);
		transition-duration: var(--quick);
	}

	/* on a phone the tiles are one row to swipe, so the price they open is still on the first screen */
	@media (max-width: 640px) {
		.tiles {
			grid-template-columns: none;
			grid-auto-flow: column;
			grid-auto-columns: 8.75rem;
			overflow-x: auto;
			margin-inline: -1.25rem;
			padding: 0.25rem 1.25rem 1.25rem;
			margin-bottom: -0.75rem;
			scroll-padding-inline: 1.25rem;
			scroll-snap-type: x mandatory;
			scrollbar-width: none;
		}

		.tiles::-webkit-scrollbar {
			display: none;
		}

		.tile {
			min-height: 5.75rem;
			scroll-snap-align: start;
		}
	}

	.tile:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.tile:not(.selected):hover {
			box-shadow: 0 4px 12px -4px rgb(0 0 0 / 0.14);
		}
	}

	.chip {
		border-radius: 999px;
		background: var(--color-surface);
		padding: 0.45rem 0.9rem;
		font-size: 0.9375rem;
		color: var(--color-ink);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--standard) var(--ease),
			color var(--standard) var(--ease),
			transform var(--standard) var(--ease);
	}

	.chip:active {
		transform: scale(0.95);
		transition-duration: var(--quick);
	}

	.chip:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.chip.selected {
		background: var(--color-accent-fill);
		color: #fff;
	}

	.none {
		font-size: 0.9rem;
		color: var(--color-muted);
	}

	.aisles {
		margin-top: 0.45rem;
	}

	.aisle-list {
		overflow: hidden;
		border-radius: 14px;
		background: var(--color-surface);
	}

	details + details {
		box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-sep) 12%, transparent);
	}

	summary {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		list-style: none;
		padding: 0.8rem 1rem;
		font-weight: 500;
		color: var(--color-ink);
	}

	summary :global(.aisle-icon) {
		color: var(--color-accent);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::after {
		content: '';
		width: 0.45rem;
		height: 0.45rem;
		margin-left: 0.25rem;
		border-right: 1.5px solid var(--color-muted);
		border-bottom: 1.5px solid var(--color-muted);
		transform: rotate(-45deg);
		transition: transform var(--standard) var(--ease);
	}

	/* an aisle opens to its natural height instead of snapping; browsers without this simply snap */
	details::details-content {
		block-size: 0;
		overflow: clip;
		transition:
			block-size var(--slow) var(--ease),
			content-visibility var(--slow) allow-discrete;
	}

	details[open]::details-content {
		block-size: auto;
	}

	/* on its own: a browser that does not know ::details-content drops the whole rule it is in */
	@media (prefers-reduced-motion: reduce) {
		details::details-content {
			transition: none;
		}
	}

	summary {
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--standard) var(--ease);
	}

	summary:active {
		background: color-mix(in srgb, var(--color-shade) 4%, transparent);
		transition-duration: 0s;
	}

	details[open] summary::after {
		transform: rotate(45deg);
	}

	.count {
		margin-left: auto;
		font-size: 0.9375rem;
		font-weight: 400;
		color: var(--color-muted);
	}

	details .chips {
		margin: 0;
		padding: 0 1rem 0.9rem;
	}

	details .chip {
		background: var(--color-raised);
		box-shadow: none;
	}

	details .chip.selected {
		background: var(--color-accent-fill);
	}

	/* touch screens keep :hover on the last tapped spot, so hover styles are for mice only */
	@media (hover: hover) {
		.chip:not(.selected):hover {
			color: var(--color-accent);
		}
	}
</style>
