<script lang="ts">
	import { money, shortDay, storeName } from '../../format';
	import AppShell from '../AppShell.svelte';
	import Trend from '../Trend.svelte';
	import ReceiptUploader from '../ReceiptUploader.svelte';
	import Tour from '../Tour.svelte';
	import { aisleSpend, spendBars, type Bar } from '../../spend';
	import { budgetLine } from '../../budget';
	import { goto, invalidateAll } from '$app/navigation';
	import { handoff } from '../receipts/handoff';
	import { changeLine, isLowest } from '../../price-change';
	import { fly, slide } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { announce, readReceipt } from '../receipts/reading';
	import { toast } from '../../toasts.svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import AisleIcon from '../AisleIcon.svelte';

	let { data } = $props();

	// a phone opens the camera, a laptop the file picker; Receipts reads what was picked
	let camera = $state<HTMLInputElement>();
	let picker = $state<HTMLInputElement>();
	const firstTime = $derived(data.recent.length === 0);
	const coarse = () => matchMedia('(pointer: coarse)').matches;
	function handOver(files: FileList | null) {
		if (!files?.length) return;
		handoff.files = [...files];
		goto('/receipts');
	}

	const monthName = $derived(new Date(`${data.month.start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }));

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	// one tap on a bar shows that period in the big number; a second tap goes back
	let by = $state<'week' | 'month'>('month');
	let picked = $state<number | null>(null);
	const bars = $derived(spendBars(data.spend.rows, by, data.spend.today));
	const tallest = $derived(Math.max(1, ...bars.map((b) => b.cents)));
	const periodName = (bar: Bar) =>
		by === 'month' ? new Date(`${bar.from}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : `Week of ${shortDay(bar.from)}`;
	// without a pick the big number is the latest period with spending, so an empty week never leads with $0
	const latest = $derived(bars.findLastIndex((b) => b.cents > 0));
	const at = $derived(picked ?? (latest < 0 ? bars.length - 1 : latest));
	const current = $derived(at === bars.length - 1);
	const focus = $derived(bars[at]);
	const before = $derived(at > 0 ? bars[at - 1] : null);
	// spending nothing is not a saving, so an empty period gets no comparison
	const delta = $derived(before && focus.cents ? focus.cents - before.cents : null);
	const filled = $derived(bars.filter((b) => b.cents > 0));
	// with two periods or fewer the line only repeats the bar tops
	const average = $derived(filled.length > 2 ? Math.round(filled.reduce((sum, b) => sum + b.cents, 0) / filled.length) : null);
	const title = $derived(current ? (by === 'month' ? `Spent in ${monthName}` : 'Spent this week') : periodName(focus));
	const versus = $derived(current ? (by === 'month' ? 'last month' : 'last week') : by === 'month' ? 'the month before' : 'the week before');
	const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
	// only this month has a budget to stand against
	const budget = $derived(data.budgetCents && by === 'month' && current ? budgetLine(data.budgetCents, data.month.spentCents) : null);
	// the top four aisles of the period in the big number; the rest share one row
	const aisles = $derived.by(() => {
		const all = aisleSpend(data.spend.rows, focus.ids);
		if (all.length <= 4) return all;
		const rest = all.slice(3);
		return [...all.slice(0, 3), { aisle: `${rest.length} more aisles`, cents: rest.reduce((sum, a) => sum + a.cents, 0) }];
	});
	const show = (next: 'week' | 'month') => {
		by = next;
		picked = null;
	};
	// receipts uploaded but never read (the page was left mid-way, or reading failed); read them right here
	let rereading = $state(false);
	async function readUnread() {
		rereading = true;
		try {
			// a read that worked shows up in the lists; ones that failed would vanish without a word, so they are
			// told in one popup, not one each
			const outcomes = await Promise.all(data.unread.map(async (id) => ({ id, outcome: await readReceipt(id) })));
			const failed = outcomes.filter(({ outcome }) => outcome.state === 'failed' || outcome.state === 'paused');
			if (failed.length === 1) announce(failed[0].id, failed[0].outcome);
			else if (failed.length > 1)
				toast({ key: 'unread', kind: 'error', text: `${failed.length} receipts couldn't be read.`, action: { label: 'Try again', run: readUnread } });
		} finally {
			rereading = false;
		}
		await invalidateAll();
	}

	// three on a phone; a laptop has room for six beside the spend card
	const SHOWN_CHANGES = 3;
	const WIDE_CHANGES = 6;
	let allChanges = $state(false);
	let opened = $state<string | null>(null);
	// rises first, then where it is cheaper; one shared order so the phone and laptop limits still apply
	const lines = $derived(data.changes.map((change) => ({ change, per: change.per === 'lb' ? '/lb' : '', line: changeLine(change, change.per === 'lb' ? '/lb' : '') })));
	const rises = $derived(lines.filter((l) => l.line.tone === 'up'));
	const shown = $derived([...rises, ...lines.filter((l) => l.line.tone === 'down')].slice(0, allChanges ? undefined : WIDE_CHANGES));
	const groups = $derived(
		[
			{ label: 'Went up', from: 0, rows: shown.slice(0, rises.length) },
			{ label: 'Cheaper', from: rises.length, rows: shown.slice(rises.length) }
		].filter((g) => g.rows.length)
	);
	const still = $derived(prefersReducedMotion.current);

	// the first visit gets a short tour; finished or skipped, it is saved on the account
	const TOUR = [
		{ target: '.add-button, .add', title: 'Add a receipt', text: 'Snap it, or pick a photo or PDF. Every line is read in about ten seconds.', icon: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' },
		{ target: '.month', title: 'What you spent', text: 'Your total by week or month. Tap a bar to see those receipts.', icon: 'M5 20V11M10 20V5M15 20v-7M20 20V8M3 20h18' },
		{ target: '.changes', title: 'Your prices', text: 'What went up, and where the same thing costs less. Tap one for every time you bought it.', icon: 'M7 7h.01M3 12V3h9l9 9-9 9z' },
		{ target: 'nav[aria-label="Main"] a[href="/prices"]', title: 'Look anything up', text: 'Prices shows the last price of everything you buy, at every store, on a map.', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3' }
	];
	let touring = $state(false);
	onMount(() => {
		if (!data.tour) return;
		const start = setTimeout(() => (touring = true), 700);
		return () => clearTimeout(start);
	});
	// what they eat, asked once, after the tour if there is one
	let askDiet = $state(false);
	onMount(() => {
		if (data.diet || data.tour) return;
		const ask = setTimeout(() => (askDiet = true), 900);
		return () => clearTimeout(ask);
	});
	const DIETS = [
		{ value: 'meat', label: 'Yes, I eat meat or fish' },
		{ value: 'vegetarian', label: 'Vegetarian' },
		{ value: 'vegan', label: 'Vegan' }
	];
	// milk is also where lactose comes from
	const allergyText = (list: string[]) => {
		const names = list.map((a) => (a === 'milk' ? 'milk (lactose)' : a));
		return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
	};
	const dietName = { meat: 'Eats meat', vegetarian: 'Vegetarian', vegan: 'Vegan' };
	const answered: SubmitFunction = () => async ({ update }) => {
		askDiet = false;
		await update();
	};
	let picking = $state(false);
	const tried: SubmitFunction = () => {
		picking = true;
		return async ({ result, update }) => {
			if (result.type === 'success' && result.data?.added) toast({ key: `healthy:${result.data.added}`, kind: 'done', text: `${result.data.added} is on ${result.data.to}.`, action: { label: 'Open', href: '/list' } });
			if (result.type === 'success' && result.data?.saved) toast({ key: `saved:${result.data.saved}`, kind: 'done', text: `${result.data.saved} saved for your next shop.`, action: { label: 'See saved', href: '/list' } });
			await update();
			picking = false;
		};
	};

	function endTour() {
		if (!data.diet) setTimeout(() => (askDiet = true), 400);
		touring = false;
		fetch('/home?/tour_seen', { method: 'POST', body: new FormData(), headers: { 'x-sveltekit-action': 'true' } });
	}
</script>

<svelte:head>
	<title>Home · Billie</title>
</svelte:head>

<AppShell firstName={data.firstName}>
	<main>
		<!-- daily things first: what runs out, the month, prices, then old receipts -->
		<div class="board">
			<div class="main-col">
				<div class="hi">
					<div class="hi-row">
						<h1 class="large-title">{data.firstName ? `Hi ${data.firstName}` : 'Your groceries'}</h1>
						{#if !firstTime}
							<button type="button" class="add-button" onclick={() => (coarse() ? camera : picker)?.click()}>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
								Add receipt
							</button>
							<input bind:this={camera} type="file" accept="image/*" capture="environment" hidden onchange={(e) => handOver(e.currentTarget.files)} />
							<input bind:this={picker} type="file" accept="image/*,application/pdf" multiple hidden onchange={(e) => handOver(e.currentTarget.files)} />
						{/if}
					</div>

					{#if data.unread.length}
						<p class="unread surface" aria-live="polite">
							<span>{data.unread.length === 1 ? '1 receipt wasn’t read' : `${data.unread.length} receipts weren’t read`}</span>
							<button type="button" class="small-button" disabled={rereading} onclick={readUnread}>{rereading ? 'Reading…' : data.unread.length === 1 ? 'Read it now' : 'Read them now'}</button>
						</p>
					{/if}
				</div>
				{#if firstTime}
					<section class="add surface" aria-label="Add a receipt">
						<ReceiptUploader uploads={data.uploads} dailyLimit={data.dailyLimit} paused={data.paused} closed={data.closed} />
					</section>
				{/if}

				{#if data.recalls.length}
					<section class="recalls" aria-labelledby="recalls-title">
						<h2 class="due-title" id="recalls-title">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19zM12 10v4.5M12 17.5h.01" /></svg>
							{data.recalls.length === 1 ? 'A recall for something you bought' : 'Recalls for things you bought'}
						</h2>
						<ul class="due-rows">
							{#each data.recalls as recall (recall.url)}
								<li>
									<a class="due-row recall" href={recall.url} target="_blank" rel="noopener noreferrer">
										<span class="due-name">{recall.title}</span>
										<span class="due-text">You bought {recall.product} · FDA{recall.published_on ? `, ${shortDay(recall.published_on)}` : ''} · Check the brand and dates on yours</span>
										<svg class="out" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if data.due.length}
					<section class="due-soon" aria-labelledby="due-title">
						<h2 class="due-title" id="due-title">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7.5 3v2.5c0 2.5 4.5 4.5 4.5 6.5s-4.5 4-4.5 6.5V21M16.5 3v2.5c0 2.5-4.5 4.5-4.5 6.5s4.5 4 4.5 6.5V21M9.5 19h5" /></svg>
							Running low
						</h2>
						<ul class="due-rows">
							{#each data.due as item (item.name)}
								{@const used = Math.min(1, item.sinceDays / item.everyDays)}
								<li>
									<a class="due-row" href="/prices?item={encodeURIComponent(item.name)}">
										<span class="due-name">{item.name}</span>
										<span class="due-text">{item.text}</span>
										<span class="due-state">
											<span class="due-flag">{used >= 1 ? 'Probably out' : `${Math.round(used * 100)}% used`}</span>
											<span class="gauge" aria-hidden="true"><span style="transform: scaleX({used})"></span></span>
										</span>
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{/if}


				<section class="changes" aria-labelledby="changes-title">
					<div class="list-label-row">
						<h2 class="list-label" id="changes-title">Your prices</h2>
						{#if data.changes.length > SHOWN_CHANGES}
							<button type="button" onclick={() => (allChanges = !allChanges)}>{allChanges ? 'Show fewer' : `Show all ${data.changes.length}`}</button>
						{/if}
					</div>
					{#if data.changes.length}
						<div>
							{#each groups as group (group.label)}
								<h3 class="group-label" class:extra={!allChanges && group.from >= SHOWN_CHANGES}>{group.label}</h3>
								<ul class="group">
									{#each group.rows as { change, per, line }, n (change.name)}
										{@const back = `from=${encodeURIComponent(change.name)}`}
										{@const elsewhere = change.store !== change.before_store}
										<li class:extra={!allChanges && group.from + n >= SHOWN_CHANGES}>
											<button type="button" class="row" aria-expanded={opened === change.name} onclick={() => (opened = opened === change.name ? null : change.name)}>
												<span class="row-title">{change.name}</span>
												<span class="row-value">
													{money(change.now_cents)}{per}
													{#if elsewhere}<span class="at">at {storeName(change.store) ?? 'last store'}</span>{/if}
												</span>
												<span class="row-sub move" class:up={line.tone === 'up'} class:down={line.tone === 'down'}>
													<Trend up={line.tone === 'up'} />{line.text}
												</span>
											</button>
											{#if opened === change.name}
												<!-- the last few purchases by date, the lowest in green, each opening its receipt line -->
												<div class="history" transition:slide={{ duration: still ? 0 : 200 }} onintroend={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })}>
													{#each change.history as paid (paid.item)}
														{@const low = isLowest(change.history, paid.cents)}
														{@const where = storeName(paid.store) ?? 'Unknown store'}
														<a href="/receipts/{paid.receipt}?{back}#line-{paid.item}" aria-label="{shortDay(paid.on)}, {where}, {money(paid.cents)}{per}{low ? ', lowest' : ''}">
															<span class="when">{shortDay(paid.on)}</span>
															<span class="where">{where}</span>
															<span class="paid" class:down={low}>{money(paid.cents)}{per}</span>
														</a>
													{/each}
													<a class="all" href="/prices?item={encodeURIComponent(change.name)}">Full price history</a>
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							{/each}
						</div>
					{:else}
						<p class="empty surface">Buy something twice and you’ll see here whether it got cheaper.</p>
					{/if}
				</section>

				<section class="recent" aria-labelledby="recent-title">
					<div class="list-label-row">
						<h2 class="list-label" id="recent-title">Recent receipts</h2>
						{#if data.recent.length}<a href="/receipts">See all</a>{/if}
					</div>
					{#if data.recent.length}
						<div>
							<ul class="group">
								{#each data.recent as receipt (receipt.id)}
									<li>
										<a class="row" href="/receipts/{receipt.id}">
											<span class="row-title">{storeName(receipt.store) ?? 'Store not printed'}</span>
											<span class="row-value">{money(receipt.total_cents)}</span>
											<span class="row-sub">{shortDay(receipt.purchased_on)}{receipt.channel === 'delivery' ? ' · Delivery' : ''}</span>
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{:else}
						<p class="empty surface">Your receipts show up here once they’re read.</p>
					{/if}
				</section>
			</div>
			<div class="side-col">
				<section class="healthy" aria-labelledby="healthy-title">
					<h2 class="due-title" id="healthy-title">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" /></svg>
						Something healthy to try
						{#if data.diet}<button type="button" class="diet" title="Change what you eat" onclick={() => (askDiet = true)}>{dietName[data.diet]}</button>{/if}
					</h2>
					{#if !data.diet}
						<p class="healthy-why">Billie finds healthy foods you don't buy yet, from nutrition sites like Harvard and the American Heart Association. First, one question.</p>
						<button type="button" class="pill-button" onclick={() => (askDiet = true)}>Do you eat meat?</button>
					{:else if data.healthy}
						{#key data.healthy.name}
							<div class="pick" in:fly={{ y: 8, duration: still ? 0 : 260 }}>
								<p class="pick-name"><AisleIcon aisle={data.healthy.category} />{data.healthy.name}</p>
								<p class="healthy-why">{data.healthy.why}</p>
								{#if data.healthy.allergens.length}
									<p class="allergens">
										<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19zM12 10v4.5M12 17.2v.1" /></svg>
										Contains {allergyText(data.healthy.allergens)}. Check the label if you have an allergy.
									</p>
								{/if}
								<a class="source" href={data.healthy.source_url} target="_blank" rel="noopener noreferrer">From {data.healthy.source}</a>
							</div>
						{/key}
						<div class="pick-actions">
							<form method="POST" action="?/try_it" use:enhance={tried}><button class="pill-button" disabled={picking}>Add to my list</button></form>
							<form method="POST" action="?/save" use:enhance={tried}>
								<button class="quiet-button save" disabled={picking}>
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h11v16l-5.5-4-5.5 4z" /></svg>
									Save
								</button>
							</form>
							<form method="POST" action="?/another" use:enhance={tried}><button class="quiet-button" disabled={picking}>Show another</button></form>
						</div>
					{:else}
						<p class="healthy-why">You've seen every pick for now. New ones are found each day.</p>
					{/if}
				</section>

				<section class="month surface" aria-labelledby="month-title">
					<div class="month-head">
						<div class="period">
							<button type="button" class="step" aria-label="Earlier {by}" title="Earlier {by}" disabled={at === 0} onclick={() => (picked = at - 1)}>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
							</button>
							<h2 id="month-title" aria-live="polite">{title}</h2>
							<button type="button" class="step" aria-label="Later {by}" title="Later {by}" disabled={at === bars.length - 1} onclick={() => (picked = at + 1)}>
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
							</button>
						</div>
						<div class="order" role="group" aria-label="Group spending by">
							<button type="button" aria-pressed={by === 'week'} onclick={() => show('week')}>Weeks</button>
							<button type="button" aria-pressed={by === 'month'} onclick={() => show('month')}>Months</button>
						</div>
					</div>
					<div class="headline" aria-live="polite">
						<p class="spent">{money(focus.cents)}</p>
						{#if delta}
							<!-- spending more is the red direction here -->
							<p class="delta" class:up={delta > 0} class:down={delta < 0}>
								<Trend up={delta > 0} />{dollars(Math.abs(delta))} {delta > 0 ? 'more' : 'less'} than {versus}
							</p>
						{/if}
					</div>
					<p class="note">
						{#if focus.receipts}
							{plural(focus.receipts, 'receipt')}{#if focus.ids.length === 1}{' · '}<a href="/receipts/{focus.ids[0]}">Open it</a>{:else}{' · '}<a href="/receipts?from={focus.from}&to={focus.to}">See them</a>{/if}
						{:else}
							Nothing dated {current ? (by === 'month' ? 'this month' : 'this week') : 'then'} yet
						{/if}
					</p>
					{#if budget}
						<p class="budget" class:over={budget.over}>
							<span class="meter" style:--size={Math.min(1, data.month.spentCents / data.budgetCents!)} aria-hidden="true"></span>
							{budget.text}
						</p>
					{/if}
					<ul class="bars" class:weeks={by === 'week'}>
						{#each bars as bar, i (bar.from)}
							<li>
								<button
									type="button"
									class:on={i === at}
									aria-pressed={picked === i}
									aria-label="{periodName(bar)}: {money(bar.cents)}"
									title="See {periodName(bar)}"
									onclick={() => (picked = picked === i ? null : i)}
								>
									<span class="col">
										{#if average}<span class="avg" style:--size={average / tallest} aria-hidden="true"></span>{/if}
										{#if bar.cents}<span class="cap">{dollars(bar.cents)}</span>{/if}
										<span class="bar" style:--size={bar.cents / tallest} style:--i={i}></span>
									</span>
									<!-- only weeks with spending, the highlighted one and both ends are dated, so eight thin bars never crowd -->
									<span class="tick" class:hide={by === 'week' && !bar.cents && i !== at && i !== 0 && i !== bars.length - 1}>{bar.label}</span>
								</button>
							</li>
						{/each}
					</ul>
					{#if average}<p class="legend"><span aria-hidden="true"></span>Average of {by === 'month' ? 'months' : 'weeks'} you shopped · {dollars(average)}</p>{/if}
					{#if aisles.length}
						<p class="aisles-label" id="aisles-label">By aisle, before tax</p>
						<ul class="aisles" aria-labelledby="aisles-label">
							{#each aisles as { aisle, cents } (aisle)}
								<li>
									<span class="aisle-name">{aisle}</span>
									<span class="aisle-bar" style:--size={cents / Math.max(...aisles.map((a) => a.cents))} aria-hidden="true"></span>
									<span class="aisle-cents">{dollars(cents)}</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if data.spend.undated}
						<p class="undated">{plural(data.spend.undated, 'receipt')} with no date {data.spend.undated === 1 ? 'is' : 'are'} left out</p>
					{/if}
				</section>

			</div>
		</div>

		{#if touring}<Tour stops={TOUR} onclose={endTour} />{/if}

		{#if askDiet}
			<dialog class="diet-ask" {@attach (d) => d.showModal()} onclose={() => (askDiet = false)} aria-labelledby="diet-question">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" /></svg>
				<p id="diet-question" class="question">Do you eat meat or fish?</p>
				<p class="detail">Billie suggests a healthy food to try each day. This keeps them to what you eat. You can change it any time.</p>
				<form method="POST" action="?/diet" use:enhance={answered} class="diet-options">
					{#each DIETS as option (option.value)}
						<button name="diet" value={option.value} class:chosen={data.diet === option.value}>{option.label}</button>
					{/each}
				</form>
				<button type="button" class="not-now" onclick={() => (askDiet = false)}>Not now</button>
			</dialog>
		{/if}

		<!-- on a phone Settings is otherwise only behind the avatar -->
		<ul class="group settings">
			<li><a class="row" href="/settings"><span class="row-title">Settings</span></a></li>
		</ul>
	</main>
</AppShell>

<style>
	.unread {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
		padding: 0.75rem 0.85rem 0.75rem 1.1rem;
		font-size: 0.9375rem;
		color: var(--color-ink);
	}

	.small-button {
		flex: none;
		min-height: 2.25rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		padding: 0.35rem 0.95rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-accent);
		transition: transform var(--standard) var(--ease);
	}

	.small-button:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.small-button:disabled {
		opacity: 0.6;
	}

	@media (pointer: coarse) {
		.small-button {
			min-height: 2.75rem;
		}
	}

	.settings {
		display: none;
	}

	@media (max-width: 640px) {
		.settings {
			display: block;
			margin-top: 1.75rem;
		}
	}

	.hi-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.hi-row h1 {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.add-button {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		border-radius: 999px;
		background: var(--color-accent-fill);
		padding: 0.6rem 1.15rem 0.6rem 0.95rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #fff;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 4px 12px -4px color-mix(in srgb, var(--color-accent-fill) 60%, transparent);
		transition: transform var(--standard) var(--ease), filter var(--standard) var(--ease);
	}

	.add-button svg {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linejoin: round;
	}

	.add-button:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.add-button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	@media (hover: hover) {
		.add-button:hover {
			filter: brightness(1.08);
		}
	}

	/* the day's healthy pick: its own fresh card, top right */
	.healthy {
		display: grid;
		gap: 0.6rem;
		border-radius: 20px;
		background:
			radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 60%),
			var(--color-surface);
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 16%, transparent),
			0 1px 2px rgb(0 0 0 / 0.04);
		padding: 1.1rem 1.15rem 1.2rem;
	}

	.healthy .due-title {
		margin: 0;
	}

	.diet {
		margin-left: auto;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		padding: 0.2rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-accent);
	}

	.pick {
		display: grid;
		gap: 0.35rem;
	}

	.pick-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.15;
		color: var(--color-ink);
	}

	.pick-name :global(.aisle-icon) {
		width: 1.5rem;
		height: 1.5rem;
		stroke: var(--color-accent);
	}

	.healthy-why {
		font-size: 0.9375rem;
		line-height: 1.45;
		color: var(--color-ink);
	}

	.allergens {
		display: flex;
		gap: 0.4rem;
		align-items: flex-start;
		border-radius: 10px;
		background: color-mix(in srgb, #b45309 9%, var(--color-surface));
		padding: 0.45rem 0.6rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: #7c3a06;
	}

	.allergens svg {
		width: 1rem;
		height: 1rem;
		flex: none;
		margin-top: 0.05rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.source {
		justify-self: start;
		font-size: 0.8125rem;
		color: var(--color-muted);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--color-muted) 40%, transparent);
		text-underline-offset: 3px;
	}

	/* the main action across, the two lighter ones side by side under it */
	.pick-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}

	.pick-actions form:first-child {
		grid-column: 1 / -1;
	}

	.pick-actions button {
		width: 100%;
		justify-content: center;
	}

	.quiet-button {
		min-height: 2.75rem;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.12);
		padding: 0.55rem 1.1rem;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-ink);
		transition: transform var(--standard) var(--ease);
	}

	.save {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.save svg {
		width: 1.05rem;
		height: 1.05rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.quiet-button:active {
		transform: scale(0.96);
		transition-duration: var(--quick);
	}

	.healthy button:disabled {
		opacity: 0.6;
	}

	.diet-ask {
		width: min(21rem, calc(100vw - 2rem));
		margin: auto;
		border: 0;
		border-radius: 20px;
		background: var(--color-surface);
		padding: 1.4rem 1.25rem 1rem;
		color: var(--color-ink);
		text-align: center;
		box-shadow: 0 24px 60px -16px rgb(0 0 0 / 0.35);
	}

	.diet-ask[open] {
		animation: ask-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.diet-ask::backdrop {
		background: color-mix(in srgb, var(--color-shade) 30%, transparent);
	}

	@keyframes ask-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.98);
		}
	}

	.diet-ask > svg {
		width: 2rem;
		height: 2rem;
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.diet-ask .question {
		margin-top: 0.4rem;
		font-size: 1.1875rem;
		font-weight: 650;
	}

	.diet-ask .detail {
		margin-top: 0.35rem;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--color-muted);
	}

	.diet-options {
		display: grid;
		gap: 0.5rem;
		margin-top: 1.1rem;
	}

	.diet-options button {
		min-height: 2.9rem;
		border-radius: 14px;
		background: rgb(118 118 128 / 0.12);
		font-size: 1rem;
		font-weight: 500;
		color: var(--color-ink);
		transition: transform var(--standard) var(--ease);
	}

	.diet-options button.chosen {
		background: var(--color-accent-fill);
		color: #fff;
	}

	.diet-options button:active {
		transform: scale(0.98);
		transition-duration: var(--quick);
	}

	.not-now {
		margin-top: 0.6rem;
		min-height: 2.75rem;
		padding: 0 1rem;
		font-size: 0.9375rem;
		color: var(--color-accent);
	}

	.diet:focus-visible,
	.quiet-button:focus-visible,
	.diet-options button:focus-visible,
	.not-now:focus-visible,
	.source:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.diet-ask[open] {
			animation: none;
		}
	}

	/* a recall is the one thing on Home about safety, so it is tinted like a warning */
	.recalls {
		border-radius: 20px;
		background: color-mix(in srgb, var(--color-up) 7%, var(--color-surface));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-up) 18%, transparent);
		padding: 1rem 1rem 1.1rem;
	}

	.recalls .due-title svg {
		stroke: var(--color-up);
	}

	.recall .out {
		grid-area: state;
		width: 1.05rem;
		height: 1.05rem;
		fill: none;
		stroke: var(--color-muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* things to act on get their own look, apart from the plain lists */
	.due-soon {
		border-radius: 20px;
		background: color-mix(in srgb, var(--color-accent) 7%, var(--color-surface));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 16%, transparent);
		padding: 1rem 1rem 1.1rem;
	}

	.due-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.8rem 0.15rem;
		font-size: 1.0625rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.due-title svg {
		width: 1.15rem;
		height: 1.15rem;
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.due-rows {
		overflow: hidden;
		border-radius: 14px;
		background: var(--color-surface);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}

	.due-rows > li + li {
		border-top: 1px solid color-mix(in srgb, var(--color-line) 55%, transparent);
	}

	.due-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'name state' 'text state';
		align-items: center;
		gap: 0.15rem 1.25rem;
		padding: 0.8rem 1rem;
		transition: background-color var(--standard) var(--ease);
	}

	.due-row:active {
		background: rgb(118 118 128 / 0.1);
		transition-duration: var(--quick);
	}

	.due-row:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
		border-radius: 14px;
	}

	.due-name {
		grid-area: name;
		overflow-wrap: anywhere;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.due-text {
		grid-area: text;
		font-size: 0.8125rem;
		line-height: 1.35;
		color: var(--color-muted);
	}

	.due-state {
		grid-area: state;
		display: grid;
		justify-items: end;
		gap: 0.35rem;
		width: 6.5rem;
	}

	.due-flag {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-accent);
		white-space: nowrap;
	}

	.gauge {
		display: block;
		overflow: hidden;
		width: 100%;
		height: 5px;
		border-radius: 999px;
		background: rgb(118 118 128 / 0.16);
	}

	.gauge span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--color-accent);
		transform-origin: left;
	}

	@media (hover: hover) {
		.due-row:hover {
			background: rgb(118 118 128 / 0.06);
		}
	}

	@media (max-width: 640px) {
		.due-soon {
			padding: 0.85rem 0.75rem 0.75rem;
		}

		.due-row {
			gap: 0.15rem 0.85rem;
		}

		.due-state {
			width: 4.75rem;
		}
	}

	.board,
	.main-col,
	.side-col {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* a phone mixes both columns into one, in this order */
	@media (max-width: 1023px) {
		.main-col,
		.side-col {
			display: contents;
		}

		.hi {
			order: 1;
		}

		.add,
		.recalls {
			order: 2;
		}

		.healthy {
			order: 3;
		}

		.due-soon,
		.month {
			order: 4;
		}

		.changes {
			order: 5;
		}

		.recent {
			order: 6;
		}
	}

	/* each column stacks on its own; the month stays in view beside the lists */
	@media (min-width: 1024px) {
		.board {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 22rem;
			align-items: start;
			gap: 2.5rem;
		}

		.side-col {
			position: sticky;
			top: 5rem;
		}
	}

	.add {
		padding: 1rem;
	}

	.month {
		display: flex;
		flex-direction: column;
		padding: 1.25rem 1.4rem 1.1rem;
	}

	.month-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 0.75rem;
	}

	.period {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		margin-left: -0.5rem;
	}

	.step {
		display: grid;
		flex: none;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		color: var(--color-muted);
		transition: background-color 120ms ease-out, transform 120ms ease-out;
	}

	.step svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.step:disabled {
		opacity: 0.3;
	}

	.step:not(:disabled):active {
		transform: scale(0.92);
	}

	.step:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		.step:not(:disabled):hover {
			background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		}
	}

	/* the same small segmented control as the sort on Prices */
	.order {
		display: inline-grid;
		flex: none;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		border-radius: 9px;
		background: rgb(118 118 128 / 0.12);
		padding: 2px;
	}

	/* a 44px reach for the thumb without a bigger look */
	.order button {
		position: relative;
		border-radius: 7px;
		padding: 0.25rem 0.7rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-ink);
		transition:
			background-color var(--quick) var(--ease),
			box-shadow var(--quick) var(--ease);
	}

	.order button::after {
		content: '';
		position: absolute;
		inset: -8px 0;
	}

	.order button[aria-pressed='true'] {
		background: var(--color-selected);
		box-shadow:
			0 3px 8px rgb(0 0 0 / 0.12),
			0 3px 1px rgb(0 0 0 / 0.04);
	}

	.note a {
		position: relative;
		color: var(--color-accent);
	}

	/* a 44px reach for the thumb without a bigger look */
	.note a::after {
		content: '';
		position: absolute;
		inset: -12px -8px;
	}

	.bars {
		display: flex;
		gap: 0.3rem;
		margin-top: 1rem;
	}

	.bars li {
		flex: 1;
		min-width: 0;
	}

	.bars button {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		width: 100%;
		border-radius: 8px;
		-webkit-tap-highlight-color: transparent;
	}

	/* each bar stands on one shared baseline; an empty period is just the baseline, never a stub */
	.col {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		position: relative;
		width: calc(100% + 0.3rem);
		height: 5.75rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-sep) 18%, transparent);
	}

	/* the average runs across every column as one dashed line */
	.avg {
		position: absolute;
		inset: auto 0 calc(4.5rem * var(--size));
		border-top: 1.5px dashed color-mix(in srgb, var(--color-sep) 60%, transparent);
		pointer-events: none;
	}

	.bar {
		width: 100%;
		max-width: 1.5rem;
		height: calc(4.5rem * var(--size));
		border-radius: 4px 4px 0 0;
		background: rgb(118 118 128 / 0.24);
		transform-origin: bottom;
		transition:
			height var(--slow) var(--ease),
			background-color var(--quick) var(--ease),
			transform var(--slow) var(--ease) calc(var(--i) * 25ms);
	}

	/* switching weeks and months grows the new bars up from the baseline, left to right */
	@starting-style {
		.bar {
			transform: scaleY(0);
		}
	}

	.bars button:active .bar {
		transform: scaleY(0.94);
		transition-delay: 0ms;
		transition-duration: var(--quick);
	}

	/* the period in the big number stands out in ink; green and red stay for cheaper and more */
	.bars .on .bar {
		background: var(--color-ink);
	}

	/* a picked empty period has no bar, so its baseline darkens instead */
	.bars .on .col {
		border-bottom-color: var(--color-ink);
		box-shadow: 0 1px 0 var(--color-ink);
	}

	/* every amount is readable without a tap; the highlighted one is bold */
	.cap {
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--color-muted);
	}

	.on .cap {
		font-weight: 600;
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.bars button:not(.on):hover .bar {
			background: rgb(118 118 128 / 0.4);
		}
	}

	.bars button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.tick {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	.tick.hide {
		visibility: hidden;
	}

	.on .tick {
		font-weight: 600;
		color: var(--color-ink);
	}

	.budget {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.75rem;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.budget.over {
		color: var(--color-up);
	}

	.meter {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(to right, var(--color-ink) calc(100% * var(--size)), rgb(118 118 128 / 0.16) 0);
	}

	.budget.over .meter {
		background: var(--color-up);
	}

	.aisles {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.3rem 0.6rem;
		margin-top: 0.4rem;
		font-size: 0.8125rem;
	}

	.aisles-label {
		margin-top: 0.9rem;
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.aisles li {
		display: contents;
	}

	.aisle-name {
		color: var(--color-ink);
		white-space: nowrap;
	}

	.aisle-bar {
		height: 6px;
		width: calc(100% * var(--size));
		min-width: 2px;
		border-radius: 3px;
		background: rgb(118 118 128 / 0.24);
		transition: width var(--slow) var(--ease);
	}

	.aisle-cents {
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	.undated {
		margin-top: 0.6rem;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			transition: none;
		}

		@starting-style {
			.bar {
				transform: none;
			}
		}

		.bars button:active .bar {
			transform: none;
		}
	}

	.month h2 {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-muted);
	}

	.headline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin-top: 0.35rem;
	}

	.delta {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: 999px;
		padding: 0.25rem 0.65rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.delta.up {
		background: color-mix(in srgb, var(--color-up) 10%, transparent);
		color: var(--color-up);
	}

	.delta.down {
		background: color-mix(in srgb, var(--color-cheaper) 10%, transparent);
		color: var(--color-cheaper);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.7rem;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.legend span {
		width: 1.1rem;
		border-top: 1.5px dashed color-mix(in srgb, var(--color-sep) 60%, transparent);
	}

	.spent {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--color-ink);
	}

	.note {
		margin-top: 0.6rem;
		color: var(--color-muted);
	}

	.extra {
		display: none;
	}

	/* every section on Home is titled the same way */
	.changes .list-label,
	.recent .list-label {
		font-size: 1.0625rem;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.changes .list-label-row,
	.recent .list-label-row {
		align-items: center;
		margin-bottom: 0.6rem;
	}

	.history {
		display: grid;
		margin: -0.25rem 1rem 0;
		padding-bottom: 0.5rem;
	}

	/* opening a low row scrolls it clear of the floating tab bar */
	@media (max-width: 640px) {
		.history {
			scroll-margin-bottom: calc(6rem + env(safe-area-inset-bottom));
		}
	}

	.history a {
		display: grid;
		grid-template-columns: 3.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 10%, transparent);
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	.history .when {
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	.history .where {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.history .paid {
		font-variant-numeric: tabular-nums;
	}

	.history .paid.down {
		font-weight: 600;
		color: var(--color-cheaper);
	}

	.history .all {
		display: flex;
		color: var(--color-ink);
		font-weight: 500;
	}

	.changes .row-value {
		text-align: right;
	}

	.row-value .at {
		display: block;
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.group-label {
		margin: 0 0 0.4rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	.group + .group-label {
		margin-top: 1rem;
	}

	.move {
		color: var(--color-accent);
	}

	.move.up {
		color: var(--color-up);
	}

	.move.down {
		color: var(--color-cheaper);
	}

	.empty {
		padding: 1rem 1.1rem;
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	/* a wide screen gives the month its room too, matching Receipts */
	@media (min-width: 1440px) {
		.board {
			grid-template-columns: minmax(0, 1fr) 30rem;
		}
	}
</style>
