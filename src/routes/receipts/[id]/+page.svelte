<script lang="ts">
	import { tick } from 'svelte';
	import { readerName } from '../../../ai-budget';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { slide } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { streetOf, townOf } from '../../../branches';
	import { shortMiles } from '../../../distance';
	import { longDay, money, storeName } from '../../../format';
	import AisleIcon from '../../AisleIcon.svelte';
	import AppShell from '../../AppShell.svelte';
	import ConfirmButton from '../../ConfirmButton.svelte';
	import StoreSheet from '../../StoreSheet.svelte';

	let { data, form } = $props();

	// the aisle each line is set to on this page, so its icon follows the menu
	let picked = $state<Record<string, string>>({});

	// "Which one?": this receipt's branch, changed for this receipt only. It opens on the shopper's own
	// branches, then the store's others near their ZIP, nearest first; typing narrows the list and adds
	// addresses and places like it. A tap saves it.
	type Spot = { key: string; name: string | null; address: string | null; lat?: number; lng?: number; miles: number; visits?: number; away?: boolean; mine: boolean; found?: boolean };
	let choosing = $state(false);
	let nearby = $state<{ lat: number; lng: number; address: string | null; miles: number }[] | null>(null);
	let finding = $state(false);
	let sheetStore = $state<string | null>(null);
	const branchLabel = (b: { address: string | null; miles: number; away?: boolean }) =>
		[streetOf(b.address) ?? 'This branch', b.away ? (townOf(b.address) ?? 'away') : shortMiles(b.miles)].join(' · ');
	const near = (a: { lat?: number; lng?: number }, b: { lat: number; lng: number } | null) =>
		!!b && a.lat !== undefined && a.lng !== undefined && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lng - b.lng) < 0.001;

	let typedText = $state('');
	let suggested = $state<{ name: string | null; address: string; lat?: number; lng?: number; miles: number }[]>([]);
	const spots = $derived.by(() => {
		const words = typedText.toLowerCase().split(/\s+/).filter(Boolean);
		const fits = (s: Spot) => words.every((w) => `${s.name ?? ''} ${s.address ?? ''}`.toLowerCase().includes(w));
		const mine: Spot[] = data.otherBranches.map((b) => ({ ...b, key: `${b.lat},${b.lng}`, name: null, mine: true }));
		const seen: { lat: number; lng: number }[] = [...data.otherBranches, ...(data.branch ? [data.branch] : [])];
		const others: Spot[] = [];
		const fromSearch = new Set<object>(suggested);
		for (const n of [...(nearby ?? []).map((n) => ({ ...n, name: null })), ...suggested]) {
			if (n.lat === undefined || n.lng === undefined || seen.some((s) => near(n, s))) continue;
			seen.push({ lat: n.lat, lng: n.lng });
			others.push({ ...n, key: `${n.lat},${n.lng}`, mine: false, found: fromSearch.has(n) });
		}
		const byMiles = (a: Spot, b: Spot) => a.miles - b.miles;
		// suggestions already match what was typed, in their own words
		return [...mine.filter(fits).sort(byMiles), ...others.filter((o) => o.found || fits(o)).sort(byMiles)];
	});
	const branchPicked: SubmitFunction = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') {
			choosing = false;
			typedText = '';
			suggested = [];
		}
	};

	let pickedForm = $state<HTMLFormElement>();
	let pickedPlace = $state<{ lat: number; lng: number; address: string } | null>(null);
	let suggestTimer: ReturnType<typeof setTimeout> | undefined;
	function suggest() {
		clearTimeout(suggestTimer);
		const text = typedText.trim();
		if (!r.store_id || text.length < 3) {
			suggested = [];
			return;
		}
		suggestTimer = setTimeout(async () => {
			const response = await fetch(`/stores/${r.store_id}/nearby?q=${encodeURIComponent(text)}`).catch(() => null);
			const answer = response?.ok ? await response.json() : { places: [] };
			if (text === typedText.trim()) suggested = answer.places ?? [];
		}, /^\d/.test(text) ? 300 : 700);
	}
	async function pick(spot: Spot) {
		if (spot.lat === undefined || spot.lng === undefined || !spot.address) return;
		pickedPlace = { lat: spot.lat, lng: spot.lng, address: spot.address };
		await tick();
		pickedForm?.requestSubmit();
	}

	async function open() {
		choosing = !choosing;
		if (!choosing || nearby !== null || !r.store_id) return;
		finding = true;
		const response = await fetch(`/stores/${r.store_id}/nearby`).catch(() => null);
		nearby = response?.ok ? (await response.json()).branches : [];
		finding = false;
	}

	const channels: Record<string, string> = { in_store: 'In store', delivery: 'Delivery', pickup: 'Pickup', unknown: '' };

	const r = $derived(data.receipt);
	const store = $derived(storeName(r.store) ?? 'Receipt');
	const offLines = $derived(data.items.some((i) => i.issue === 'line_math'));
	const allGood = $derived(data.math.lines_match_subtotal && data.math.totals_match !== false && !offLines);
	// names Billie guessed come first, so they can be checked without hunting down the receipt
	const toCheck = $derived(data.items.filter((i) => i.issue === 'unsure' || i.issue === 'unreadable'));
	const rest = $derived(data.items.filter((i) => i.issue !== 'unsure' && i.issue !== 'unreadable'));
	// opened from an item's price history: back goes to that item, and its line is lit up
	const from = $derived(page.url.searchParams.get('from'));
	const subtotalPlusTax = $derived((r.subtotal_cents ?? 0) + (r.tax_cents ?? 0));
	// a saved receipt reads like a receipt; one that still needs a look opens ready to change
	// set again whenever another receipt opens in this same page
	let editing = $derived(r.status === 'review' || toCheck.length > 0);
	let sheetForm = $state<HTMLFormElement>();
	function stopEditing() {
		sheetForm?.reset();
		picked = {};
		editing = false;
	}
</script>

<svelte:head>
	<title>{store} · Billie</title>
</svelte:head>

<AppShell firstName={data.firstName}>
	<main>
		{#if from}
			<a href="/prices?item={encodeURIComponent(from)}" class="back">Prices</a>
		{:else}
			<a href="/receipts" class="back">Receipts</a>
		{/if}

		<div class="layout">
			<section class="summary surface" aria-labelledby="store">
				<h1 class="large-title" id="store">{store}</h1>
				{#if data.map.on && r.store_id}
					<div class="branch-line">
						{#if data.branch}
							<button type="button" class="branch-name" onclick={() => (sheetStore = r.store_id)}>
								{data.branch.guess ? 'Probably ' : ''}{branchLabel(data.branch)}
							</button>
						{:else}
							<span class="unknown">Branch not known</span>
						{/if}
						<button type="button" class="change" aria-expanded={choosing} onclick={open}>{choosing ? 'Done' : data.branch ? 'Change' : 'Add it'}</button>
					</div>
					{#if choosing}
						<div class="which" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 220 }}>
							<p class="which-title">Which {storeName(r.store)}?</p>
							{#if data.branch?.guess}
								<form method="POST" action="?/branch" use:enhance={branchPicked}>
									<input type="hidden" name="lat" value={data.branch.lat} />
									<input type="hidden" name="lng" value={data.branch.lng} />
									<input type="hidden" name="address" value={data.branch.address} />
									<button class="option"><span>{branchLabel(data.branch)}</span><span class="note">Yes, this one</span></button>
								</form>
							{/if}
							<!-- nothing typed is ever saved as it is: Enter takes the top place in the list, or does nothing -->
							<form
								class="typed"
								onsubmit={(e) => {
									e.preventDefault();
									if (spots[0]) pick(spots[0]);
								}}
							>
								<input type="search" bind:value={typedText} oninput={suggest} placeholder="Search a street or store near you" autocomplete="off" maxlength="200" aria-label="Search a street or store" />
							</form>
							<form method="POST" action="?/branch" use:enhance={branchPicked} bind:this={pickedForm} hidden>
								<input type="hidden" name="lat" value={pickedPlace?.lat} />
								<input type="hidden" name="lng" value={pickedPlace?.lng} />
								<input type="hidden" name="address" value={pickedPlace?.address} />
							</form>
							<ul class="spots">
								{#each spots as spot (spot.key)}
									<li>
										<button type="button" class="option" onclick={() => pick(spot)}>
											<span>{spot.name ?? streetOf(spot.address) ?? 'Branch'}<small>{spot.address}</small></span>
											<span class="note">{spot.mine ? 'Yours · ' : ''}{spot.away ? (townOf(spot.address) ?? 'away') : shortMiles(spot.miles)}</span>
										</button>
									</li>
								{/each}
								{#if finding}
									<li class="none">Looking near your ZIP…</li>
								{:else if !spots.length}
									<li class="none">{typedText.trim() ? 'Nothing near you matches yet. Keep typing the store or street.' : 'No branches found near your ZIP. Search the street above.'}</li>
								{/if}
							</ul>
							{#if form?.branchProblem}<p class="branch-problem" role="alert">{form.branchProblem}</p>{/if}
						</div>
					{/if}
				{:else if r.store_address}
					<p class="address">{r.store_address}</p>
				{/if}
				<p class="meta">
					{#if editing}
						<label>
							<span class="visually-hidden">Date bought</span>
							<input class="date" type="date" name="purchased_on" form="confirm" value={r.purchased_on ?? ''} max={new Date().toISOString().slice(0, 10)} />
						</label>
					{:else}
						{longDay(r.purchased_on)}
					{/if}
					{channels[r.channel ?? ''] ? ` · ${channels[r.channel ?? '']}` : ''}
				</p>
				{#if r.total_cents !== null}<p class="total">{money(r.total_cents)}</p>{/if}

				<div class="checks">
					{#if allGood}
						<p class="good">Everything adds up.</p>
					{:else}
						{#if data.math.expected === null}
							<p class="warn">The subtotal and total weren't in the photo, so the items can't be checked against them.</p>
						{:else if !data.math.lines_match_subtotal}
							<p class="warn">
								The items add up to {money(data.math.sum)}, but {r.subtotal_cents === null
									? `the total minus tax is ${money(data.math.expected)}`
									: `the receipt says ${money(data.math.expected)}`}.
							</p>
						{/if}
						{#if data.math.totals_match === false}
							<p class="warn">Subtotal plus tax is {money(subtotalPlusTax)}, but the total says {money(r.total_cents)}.</p>
						{/if}
						{#if offLines}
							<p class="warn">The marked lines don't add up on their own.</p>
						{/if}
					{/if}
					{#if toCheck.length}
						<p class="warn">
							Billie wasn't sure about {toCheck.length === 1 ? '1 name' : `${toCheck.length} names`}. {toCheck.length === 1
								? "It's"
								: "They're"} at the top of the receipt.
						</p>
					{/if}
					{#if r.skipped_lines}
						<p class="note">
							{r.skipped_lines}
							{r.skipped_lines === 1 ? 'line was' : 'lines were'} left out because {r.skipped_lines === 1 ? "it wasn't" : "they weren't"} a grocery item.
						</p>
					{/if}
					{#if r.read_by}
						<p class="note">Read by {readerName(r.read_by)} on Nebius Token Factory.</p>
					{/if}
				</div>

				{#if form?.problem}<p class="error" role="alert">{form.problem}</p>{/if}

				<div class="actions">
					{#if editing}
						<button form="confirm" class="pill-button">{r.status === 'review' ? 'Looks right' : 'Save changes'}</button>
						{#if r.status !== 'review'}<button type="button" class="cancel" onclick={stopEditing}>Cancel</button>{/if}
					{:else}
						<button type="button" class="pill-button edit" onclick={() => (editing = true)}>Edit</button>
					{/if}
					<form method="POST" action="?/delete">
						<ConfirmButton class="quiet" question="Delete this receipt?" detail="Its prices go too. This can't be undone." yes="Delete">Delete receipt</ConfirmButton>
					</form>
				</div>
			</section>

			<div class="sheet">
				<form method="POST" action="?/confirm" id="confirm" class="receipt surface" bind:this={sheetForm}>
					{#if toCheck.length}
						<h2>Check these names</h2>
						<p class="hint">Billie guessed these. Fix any that are wrong and it remembers next time.</p>
						<ul class="lines">
							{#each toCheck as item (item.id)}{@render line(item)}{/each}
						</ul>
						<h2 class="rest">The rest of the receipt</h2>
					{:else if editing}
						<p class="hint">Change any name or aisle. Billie uses your names from then on.</p>
					{/if}
					<ul class="lines">
						{#each rest as item (item.id)}{@render line(item)}{/each}
					</ul>

					{#snippet line(item: (typeof data.items)[number])}
							<li id="line-{item.id}" class:arrived={page.url.hash === `#line-${item.id}`} class:flagged={item.issue === 'line_math'} class:guessed={item.issue === 'unsure' || item.issue === 'unreadable'}>
								<p class="printed">{item.raw_text}</p>
								{#if item.kind === 'discount'}
									<div class="line-row">
										<span class="savings">Savings</span>
										<span class="price">{money(item.total_cents)}</span>
									</div>
								{:else}
									<div class="line-row">
										{#if editing}
											<input
												name="name_{item.id}"
												value={item.name ?? ''}
												placeholder={item.raw_text}
												aria-label="Name for {item.raw_text}"
												maxlength="120"
											/>
										{:else}
											<span class="name">{item.name ?? item.raw_text}</span>
										{/if}
										<span class="price">{money(item.total_cents)}</span>
									</div>
									<div class="line-row small">
										<span class="aisle">
											<AisleIcon aisle={picked[item.id] ?? item.category} />
											{#if editing}
												<select name="category_{item.id}" aria-label="Aisle for {item.raw_text}" onchange={(e) => (picked[item.id] = e.currentTarget.value)}>
													{#each data.categories as category (category)}
														<option value={category} selected={(picked[item.id] ?? item.category ?? 'Other') === category}>{category}</option>
													{/each}
												</select>
											{:else}
												<span class="aisle-name">{item.category ?? 'Other'}</span>
											{/if}
										</span>
										<span class="amount">
											{#if item.unit === 'lb' && item.unit_price_cents !== null}
												{item.quantity} lb × {money(item.unit_price_cents)}/lb
											{:else if item.quantity !== 1}
												{item.quantity} {item.unit}
											{/if}
										</span>
									</div>
									{#if item.issue === 'line_math'}
										<p class="issue">{item.unit === 'ea' ? 'The count' : 'The weight'} times the price doesn't match the amount printed.</p>
									{/if}
									{#if item.computed}
										<p class="worked">No amount was printed, so it was worked out from the weight and price.</p>
									{/if}
								{/if}
							</li>
					{/snippet}
					{#if r.subtotal_cents !== null || r.tax_cents !== null}
						<dl class="sums">
							{#if r.subtotal_cents !== null}<dt>Subtotal</dt><dd>{money(r.subtotal_cents)}</dd>{/if}
							{#if r.tax_cents !== null}<dt>Tax</dt><dd>{money(r.tax_cents)}</dd>{/if}
							{#if r.total_cents !== null}<dt class="grand">Total</dt><dd class="grand">{money(r.total_cents)}</dd>{/if}
						</dl>
					{/if}
				</form>
			</div>
		</div>
	</main>
	<StoreSheet bind:storeId={sheetStore} />
</AppShell>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.0625rem;
		color: var(--color-accent);
	}

	.back::before {
		content: '';
		width: 0.55rem;
		height: 0.55rem;
		border-bottom: 2px solid currentColor;
		border-left: 2px solid currentColor;
		transform: rotate(45deg);
	}

	.back:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	.layout {
		display: grid;
		gap: 1.5rem;
		margin-top: 1rem;
	}

	/* the receipt takes the room; the summary and its buttons stay in view beside it */
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 40rem) minmax(18rem, 24rem);
			align-items: start;
			gap: 2rem;
		}

		.summary {
			position: sticky;
			top: 5rem;
			order: 2;
		}
	}

	.summary {
		padding: 1.4rem 1.5rem;
	}

	/* the branch: one quiet line; its choices open under it as big rows, for a thumb */
	.branch-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin-top: 0.3rem;
		font-size: 0.9375rem;
	}

	.branch-name {
		border-radius: 6px;
		text-align: left;
		color: var(--color-muted);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--color-sep) 25%, transparent);
		text-underline-offset: 3px;
	}

	.unknown {
		color: var(--color-muted);
	}

	.change {
		border-radius: 6px;
		color: var(--color-accent);
	}

	.branch-name:focus-visible,
	.change:focus-visible,
	.option:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.which {
		margin-top: 0.6rem;
		overflow: hidden;
		border-radius: 12px;
		background: var(--color-raised);
	}

	.which-title {
		padding: 0.7rem 0.9rem 0.3rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	.which li + li {
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 10%, transparent);
	}

	.option {
		display: flex;
		width: 100%;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0.9rem;
		text-align: left;
		font-size: 0.9375rem;
		color: var(--color-ink);
		transition: background-color var(--quick) var(--ease);
	}

	.option:active {
		background: color-mix(in srgb, var(--color-shade) 5%, transparent);
		transition-duration: 0s;
	}

	.note,
	.none {
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.none {
		padding: 0.75rem 0.9rem;
	}

	.typed {
		display: flex;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
	}

	/* 16px text: iOS Safari zooms the page on any smaller field */
	.typed input {
		flex: 1;
		min-width: 0;
		border: 1px solid color-mix(in srgb, var(--color-sep) 18%, transparent);
		border-radius: 10px;
		background: var(--color-surface);
		padding: 0.5rem 0.7rem;
		font-size: 1rem;
	}

	.branch-problem {
		padding: 0 0.9rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-danger);
	}

	.spots small {
		display: block;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.address {
		margin-top: 0.3rem;
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	.meta {
		margin-top: 0.3rem;
		color: var(--color-muted);
	}

	/* the date reads as plain text until it is clicked to fix it */
	.date {
		margin-left: -0.35rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		padding: 0.15rem 0.35rem;
		font: inherit;
		color: inherit;
	}

	.date:hover,
	.date:focus {
		border-color: var(--color-line);
		outline: none;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.total {
		margin-top: 0.75rem;
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--color-ink);
	}

	.checks {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.checks p {
		font-size: 0.9375rem;
		line-height: 1.45;
	}

	.good {
		font-weight: 600;
		color: var(--color-accent);
	}

	.warn {
		border-radius: 10px;
		background: color-mix(in srgb, var(--color-up) 8%, transparent);
		padding: 0.6rem 0.75rem;
		color: var(--color-ink);
	}

	.note {
		color: var(--color-muted);
	}

	.error {
		margin-top: 1rem;
		font-weight: 600;
		color: var(--color-up);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.actions :global(.quiet) {
		min-height: 2.75rem;
		font-size: 0.9375rem;
		color: var(--color-up);
	}

	/* Cancel sits beside Save; Delete keeps the far end */
	.cancel {
		min-height: 2.75rem;
		margin-right: auto;
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.aisle-name {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.actions :global(.quiet:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	/* one column: summary, then the receipt, then the buttons, which stay in reach on long receipts */
	@media (max-width: 959px) {
		.layout {
			display: flex;
			flex-direction: column;
		}

		.summary {
			display: contents;
		}

		.sheet {
			order: 2;
		}

		.actions {
			position: sticky;
			bottom: 0;
			z-index: 5;
			order: 3;
			margin-inline: -1.25rem;
			background: color-mix(in srgb, var(--color-raised) 96%, transparent);
			box-shadow: 0 -1px 0 rgb(0 0 0 / 0.08);
			padding: 0.85rem 1.25rem;
		}
	}

	/* above the tab bar on phones */
	@media (max-width: 640px) {
		.actions {
			bottom: calc(4.9rem + env(safe-area-inset-bottom));
		}
	}

	.receipt {
		padding: 1.1rem 1.25rem 1.25rem;
	}

	.receipt h2 {
		font-size: 1.0625rem;
		font-weight: 600;
	}

	.receipt h2.rest {
		margin-top: 1.75rem;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.lines {
		margin-top: 0.6rem;
	}

	.lines li {
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 12%, transparent);
		padding: 0.7rem 0;
	}

	/* a guessed name or a line whose sums are off gets a soft tint, not a stripe */
	.lines li.guessed,
	.lines li.flagged {
		margin: 0 -0.6rem;
		border-radius: 10px;
		border-top-color: transparent;
		padding: 0.7rem 0.6rem;
	}

	.lines li.guessed {
		background: color-mix(in srgb, var(--color-accent) 7%, transparent);
	}

	.lines li.flagged {
		background: color-mix(in srgb, var(--color-up) 7%, transparent);
	}

	.lines li.guessed + li,
	.lines li.flagged + li {
		border-top-color: transparent;
	}

	/* the line opened from Prices: lands clear of the header, glows, then settles back */
	.lines li {
		scroll-margin-top: 6rem;
	}

	.lines li.arrived {
		margin: 0 -0.6rem;
		border-radius: 10px;
		border-top-color: transparent;
		padding: 0.7rem 0.6rem;
		animation: arrived 2.4s var(--ease) both;
	}

	.lines li.arrived + li {
		border-top-color: transparent;
	}

	@keyframes arrived {
		0%,
		40% {
			background: color-mix(in srgb, var(--color-accent) 16%, transparent);
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 35%, transparent);
		}
		100% {
			background: color-mix(in srgb, var(--color-accent) 6%, transparent);
			box-shadow: 0 0 0 0 transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lines li.arrived {
			animation: none;
			background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		}
	}

	.printed {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		color: var(--color-muted);
	}

	.line-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.2rem;
	}

	.aisle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.aisle :global(.aisle-icon) {
		width: 1.05rem;
		height: 1.05rem;
		color: var(--color-accent);
	}

	.line-row.small {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	input,
	select {
		min-width: 0;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--color-ink);
	}

	/* 16px text: iOS Safari zooms the page on any smaller input */
	input {
		flex: 1;
		margin-left: -0.5rem;
		padding: 0.3rem 0.5rem;
		font-size: 1rem;
		font-weight: 600;
	}

	input::placeholder {
		font-weight: 400;
		color: var(--color-muted);
	}

	select {
		margin-left: -0.35rem;
		padding: 0.2rem 0.35rem;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	@media (hover: hover) {
		input:hover,
		select:hover {
			border-color: var(--color-line);
		}
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: var(--color-accent);
		background: var(--color-surface);
	}

	.price,
	.amount,
	.sums dd {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.price {
		font-weight: 600;
	}

	.savings {
		font-weight: 600;
		color: var(--color-accent);
	}

	.issue {
		margin-top: 0.35rem;
		font-size: 0.875rem;
		color: var(--color-up);
	}

	.worked {
		margin-top: 0.3rem;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.sums {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.3rem 1rem;
		margin-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 12%, transparent);
		padding-top: 0.75rem;
		font-size: 0.9375rem;
	}

	.sums .grand {
		font-weight: 700;
	}
</style>
