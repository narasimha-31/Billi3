<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { money, shortDay, storeName } from '../format';
	import { canAdd, cannotOpen, isPdf, prepareUpload } from './receipts/prepare-photo';
	import { SHARP_ENOUGH } from './receipts/photo-rules';
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { handoff } from './receipts/handoff';
	import { announce, post, readReceipt, type Printed } from './receipts/reading';

	let {
		uploads,
		dailyLimit,
		paused = false,
		closed = null,
		onreading
	}: { uploads: { used: number; freesAt: string | null }; dailyLimit: number; paused?: boolean; closed?: string | null; onreading?: (id: string, busy: boolean) => void } = $props();
	const guest = $derived(page.data.guest === true);
	// nothing more can be read today, so no photo is taken in only to wait
	const shut = $derived(!!closed || (guest && uploads.used >= dailyLimit));

	// the time is shown in the browser's own timezone, so it is only written once the page is running there
	let opensAt = $state('');
	$effect(() => {
		opensAt =
			uploads.used >= dailyLimit && uploads.freesAt
				? new Date(uploads.freesAt).toLocaleTimeString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
				: '';
	});

	type State = 'preparing' | 'blurry' | 'reading' | 'saved' | 'review' | 'duplicate' | 'failed' | 'paused';
	type Held = { jpeg: Blob; hash: string };
	type Entry = { key: number; id?: string; photo: string | null; state: State; slow: boolean; note?: string; printed?: Printed; held?: Held };

	let entries = $state<Entry[]>([]);
	let dragging = $state(false);
	let picker: HTMLInputElement;
	let camera: HTMLInputElement;
	let nextKey = 0;

	// the scanning card shows the result while this page is open; once it is left, a popup tells it instead
	let here = true;
	onDestroy(() => (here = false));

	const SHOWN_LINES = 8;
	const SLOW_MS = 20_000;

	function begin(photo: string | null): Entry {
		const key = nextKey++;
		entries.unshift({ key, photo, state: photo === null ? 'reading' : 'preparing', slow: false });
		return entries.find((e) => e.key === key)!;
	}

	// reads an uploaded receipt and turns the entry into its printed result
	async function read(entry: Entry, id: string) {
		entry.id = id;
		entry.state = 'reading';
		onreading?.(id, true);
		const timer = setTimeout(() => (entry.slow = true), SLOW_MS);
		try {
			const outcome = await readReceipt(id);
			Object.assign(entry, outcome);
			if (!here) announce(id, outcome);
		} finally {
			clearTimeout(timer);
			onreading?.(id, false);
			if (entry.photo) URL.revokeObjectURL(entry.photo);
			entry.photo = null;
		}
	}

	// a receipt sent from the phone is already uploaded; it gets the same scan and print here
	export async function readArrived(id: string) {
		await read(begin(null), id);
	}

	// a photo that looks blurry or far off waits here, before it costs a slot or a read
	async function send(file: File, entry: Entry) {
		try {
			const { jpeg, hash, sharpness } = await prepareUpload(file);
			if (!entry.photo) entry.photo = URL.createObjectURL(jpeg);
			if (sharpness !== undefined && sharpness < SHARP_ENOUGH) {
				entry.state = 'blurry';
				entry.held = { jpeg, hash };
				return;
			}
			await upload(entry, { jpeg, hash });
		} catch (problem) {
			entry.state = 'failed';
			entry.note = cannotOpen(problem, file);
		} finally {
			if (entry.photo && !['reading', 'blurry'].includes(entry.state)) URL.revokeObjectURL(entry.photo);
		}
	}

	async function sendAnyway(entry: Entry) {
		const held = entry.held!;
		entry.held = undefined;
		entry.state = 'preparing';
		try {
			await upload(entry, held);
		} finally {
			if (entry.photo && (entry.state as State) !== 'reading') URL.revokeObjectURL(entry.photo);
		}
		await invalidateAll();
	}

	function retake(entry: Entry) {
		if (entry.photo) URL.revokeObjectURL(entry.photo);
		entries = entries.filter((e) => e.key !== entry.key);
		camera.click();
	}

	async function upload(entry: Entry, { jpeg, hash }: Held) {
		const body = new FormData();
		body.set('photo', jpeg, 'receipt.jpg');
		body.set('hash', hash);
		const result = await post('upload', body);
		if (result.type === 'success' && result.data?.id) await read(entry, String(result.data.id));
		else {
			entry.state = result.type === 'failure' && result.status === 409 ? 'duplicate' : 'failed';
			entry.note = result.type === 'failure' && result.status !== 409 ? String(result.data?.problem ?? '') : undefined;
		}
	}

	// every photo shows at once and is read alongside the others; one at a time hid the later ones for minutes
	// counted by the server only after the batch, so ones sent since then are added here
	let sent = $state(0);
	$effect(() => {
		uploads.used;
		sent = 0;
	});
	let overCap = $state('');

	async function add(files: Iterable<File>) {
		const picked = [...files].filter(canAdd);
		const left = Math.max(0, dailyLimit - uploads.used - sent);
		const batch = picked.slice(0, left);
		const skipped = picked.length - batch.length;
		const opens = uploads.freesAt ? new Date(uploads.freesAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
		overCap = skipped
			? `${skipped} not added. ${dailyLimit} receipts a day${opens ? `, the next opens at ${opens}` : ''}.`
			: '';
		sent += batch.length;
		// a PDF has no picture to show until its pages are drawn
		await Promise.all(batch.map((file) => send(file, begin(isPdf(file) ? '' : URL.createObjectURL(file)))));
		if (batch.length) await invalidateAll();
	}

	onMount(() => {
		const files = handoff.files;
		handoff.files = [];
		if (files.length) add(files);
	});

	function dropped(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (event.dataTransfer) add(event.dataTransfer.files);
	}

	const messages: Partial<Record<State, string>> = {
		duplicate: 'You already added this receipt.',
		failed: "Couldn't read this one.",
		paused: "Reading isn't available right now. The photo is saved in your list to try again."
	};
</script>

<div class="uploader">
	<!-- phones open the back camera straight away; the picker stays for saved photos and PDFs -->
	<button type="button" class="camera" disabled={shut} onclick={() => camera.click()}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
		Scan a receipt
	</button>
	<input
		bind:this={camera}
		type="file"
		accept="image/*"
		capture="environment"
		hidden
		onchange={(e) => {
			add(e.currentTarget.files ?? []);
			e.currentTarget.value = '';
		}}
	/>
	<button
		type="button"
		class="drop"
		class:dragging
		disabled={shut}
		onclick={() => picker.click()}
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={dropped}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
		<strong>{dragging ? 'Drop to add' : 'Add a receipt'}</strong>
		<span class="pill">Upload photos or PDF</span>
	</button>
	<input
		bind:this={picker}
		type="file"
		accept="image/*,application/pdf"
		multiple
		hidden
		onchange={(e) => {
			add(e.currentTarget.files ?? []);
			e.currentTarget.value = '';
		}}
	/>
	{#if closed}
		<p class="paused" role="status">{closed}</p>
	{:else if guest && uploads.used >= dailyLimit}
		<p class="paused" role="status">You’ve used your {dailyLimit} guest reads for today. Everything you added is still here to explore.</p>
	{:else if paused}
		<p class="paused" role="status">Reading is paused for a few minutes. Photos you add are kept to read later.</p>
	{/if}
	{#if overCap}
		<p class="paused" role="status">{overCap}</p>
	{/if}
	<p class="limits">
		{#if guest}
			{Math.max(0, dailyLimit - uploads.used)} of {dailyLimit} guest reads left. Photos and PDFs up to 5 MB.
		{:else}
			{uploads.used} of {dailyLimit} receipts in the last 24 hours.
			{opensAt ? `The next one opens ${opensAt}.` : 'Photos and PDFs up to 5 MB.'}
		{/if}
	</p>

	{#if entries.length}
		<ul class="entries scroll-area" aria-live="polite">
			{#each entries as entry (entry.key)}
				<li class="focus-in">
					{#if entry.state === 'preparing' || entry.state === 'reading'}
						<div class="scanning">
							<div class="thumb" aria-hidden="true">
								{#if entry.photo}<img src={entry.photo} alt="" />{:else}<span class="blank"></span>{/if}
								<span class="beam"></span>
							</div>
							<div>
								<p class="title">{entry.state === 'preparing' ? 'Getting the photo ready' : 'Reading your receipt'}</p>
								<p class="sub">
									{entry.note ?? (entry.slow ? 'Still reading. Long receipts take a bit longer.' : 'This takes about 10 seconds.')}
								</p>
							</div>
						</div>
					{:else if entry.printed}
						{@const p = entry.printed}
						<div class="shadow">
							<article class="printout print-feed">
								<header>
									<span>{storeName(p.store) ?? 'Receipt'}</span>
									<span>{shortDay(p.date)}</span>
								</header>
								<ul>
									{#each p.lines.slice(0, SHOWN_LINES) as line, i (i)}
										<li class="line-in" style:--delay="{350 + i * 90}ms">
											<span>{line.name}</span>
											<span>{money(line.totalCents)}</span>
										</li>
									{/each}
								</ul>
								{#if p.lines.length > SHOWN_LINES}
									<p class="more line-in" style:--delay="{350 + SHOWN_LINES * 90}ms">and {p.lines.length - SHOWN_LINES} more</p>
								{/if}
								<footer class="line-in" style:--delay="{450 + Math.min(p.lines.length, SHOWN_LINES) * 90}ms">
									<span>Total</span>
									<span>{money(p.totalCents)}</span>
									<span class="check" class:off={!p.matches}>
										{p.matches ? 'The items add up to the total.' : "The items don't add up to the total yet."}
									</span>
									<a href="/receipts/{entry.id}">{entry.state === 'review' ? 'Check the amounts' : 'Open receipt'}</a>
								</footer>
							</article>
						</div>
					{:else if entry.state === 'blurry'}
						<div class="blurry">
							{#if entry.photo}<img src={entry.photo} alt="" />{/if}
							<div>
								<p class="title">This looks blurry or far away</p>
								<p class="sub">It may not read. A closer, steadier photo does better. This one hasn't been sent yet.</p>
								<div class="choices">
									<button type="button" class="pill-button" onclick={() => retake(entry)}>Retake</button>
									<button type="button" class="send-anyway" onclick={() => sendAnyway(entry)}>Send anyway</button>
								</div>
							</div>
						</div>
					{:else}
						<p class="message" class:bad={entry.state === 'failed'}>
							{entry.state === 'paused' && entry.note ? entry.note : `${messages[entry.state] ?? ''}${entry.note ? ` ${entry.note}` : ''}`}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		border: 1.5px dashed color-mix(in srgb, var(--color-sep) 22%, transparent);
		border-radius: 14px;
		background: var(--color-raised);
		padding: 2rem 1.5rem;
		color: var(--color-ink);
		transition:
			background-color 150ms,
			border-color 150ms;
	}

	.drop.dragging {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 6%, var(--color-raised));
	}

	@media (hover: hover) {
		.drop:hover {
			border-color: var(--color-accent);
		}
	}

	.drop:focus-visible,
	.printout a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.drop svg {
		width: 2.25rem;
		height: 2.25rem;
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.drop strong {
		font-size: 1.1rem;
		font-weight: 600;
	}

	/* with a mouse the drop zone is one short row; it opens up while a file is dragged over it */
	@media (pointer: fine) {
		.drop {
			flex-direction: row;
			gap: 0.75rem;
			padding: 0.7rem 0.75rem 0.7rem 1rem;
			transition:
				background-color 150ms,
				border-color 150ms,
				padding 240ms var(--ease);
		}

		.drop.dragging {
			padding-block: 1.75rem;
		}

		.drop svg {
			width: 1.5rem;
			height: 1.5rem;
		}

		.drop strong {
			flex: 1;
			text-align: left;
			font-size: 1rem;
		}
	}

	.camera {
		display: none;
	}

	/* a phone's main way in is its camera: a full-width button first, the picker after it in grey */
	@media (pointer: coarse) {
		.camera {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			width: 100%;
			margin-bottom: 0.6rem;
			border-radius: 999px;
			background: var(--color-accent-fill);
			padding: 0.85rem 1.25rem;
			font-size: 1.0625rem;
			font-weight: 600;
			color: #fff;
			-webkit-tap-highlight-color: transparent;
			transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
		}

		.camera:active {
			transform: scale(0.97);
			transition-duration: 80ms;
		}

		.camera svg {
			width: 1.35rem;
			height: 1.35rem;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.8;
			stroke-linejoin: round;
		}

		/* nothing is dragged on a phone, so the drop box becomes a plain second button */
		.drop {
			border: 0;
			background: none;
			padding: 0;
		}

		.drop svg,
		.drop strong {
			display: none;
		}

		.drop .pill {
			width: 100%;
			background: rgb(118 118 128 / 0.12);
			padding: 0.85rem 1.25rem;
			font-size: 1.0625rem;
			text-align: center;
			color: var(--color-accent);
			transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
		}

		.drop:active .pill {
			transform: scale(0.97);
			transition-duration: 80ms;
		}
	}

	.camera:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		.camera {
			transition: none;
		}

		.camera:active {
			transform: none;
		}
	}

	.pill {
		border-radius: 999px;
		background: var(--color-accent-fill);
		padding: 0.6rem 1.25rem;
		font-size: 0.9375rem;
		font-weight: 500;
		color: #fff;
	}

	.camera:disabled,
	.drop:disabled {
		opacity: 0.45;
		pointer-events: none;
	}

	.paused {
		margin-top: 0.6rem;
		border-radius: 10px;
		background: color-mix(in srgb, var(--color-up) 8%, transparent);
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	.limits {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.entries {
		display: grid;
		gap: 1rem;
		margin-top: 1.25rem;
	}

	/* the photo itself, with a soft line passing over it while the model reads */
	.scanning,
	.blurry {
		display: flex;
		align-items: center;
		gap: 1rem;
		border-radius: 14px;
		background: var(--color-raised);
		padding: 0.75rem;
	}

	.thumb {
		position: relative;
		flex: none;
		width: 4.5rem;
		height: 6rem;
		overflow: hidden;
		border-radius: 0.4rem;
		background: var(--color-receipt);
		box-shadow: 0 0 0 1px var(--color-line);
	}

	.blurry > img {
		flex: none;
		width: 4.5rem;
		height: 6rem;
		border-radius: 0.4rem;
		object-fit: cover;
		box-shadow: 0 0 0 1px var(--color-line);
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-top: 0.7rem;
	}

	.send-anyway {
		padding: 0.4rem 0.25rem;
		font-weight: 500;
		color: var(--color-accent);
	}

	.send-anyway:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
		border-radius: 6px;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: grayscale(0.3);
	}

	.blank {
		position: absolute;
		inset: 0.6rem;
		background: repeating-linear-gradient(var(--color-line) 0 2px, transparent 2px 9px);
	}

	.beam {
		position: absolute;
		inset: 0 0 auto;
		height: 2px;
		background: color-mix(in srgb, var(--color-accent) 70%, #fff);
		box-shadow: 0 0 10px 3px color-mix(in srgb, var(--color-accent) 50%, transparent);
		animation: scan 1.8s ease-in-out infinite alternate;
	}

	@keyframes scan {
		from {
			transform: translateY(0.25rem);
		}
		to {
			transform: translateY(5.6rem);
		}
	}

	.title {
		font-weight: 600;
		color: var(--color-ink);
	}

	.sub {
		margin-top: 0.15rem;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	/* the result arrives as a short list of what was read */
	.shadow {
		max-width: 28rem;
	}

	.printout {
		border-radius: 14px;
		background: var(--color-raised);
		padding: 0.9rem 1.1rem 1rem;
		font-size: 0.9375rem;
		color: var(--color-ink);
	}

	.printout header,
	.printout li,
	.printout footer {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.printout header {
		border-bottom: 1px solid color-mix(in srgb, var(--color-sep) 14%, transparent);
		padding-bottom: 0.6rem;
		font-weight: 600;
	}

	.printout ul {
		display: grid;
		gap: 0.3rem;
		padding: 0.6rem 0;
	}

	.printout li span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.printout li span:last-child,
	.printout footer span:nth-child(2) {
		font-variant-numeric: tabular-nums;
	}

	.more {
		padding-bottom: 0.5rem;
		color: var(--color-receipt-muted);
	}

	.printout footer {
		flex-wrap: wrap;
		border-top: 1px solid color-mix(in srgb, var(--color-sep) 14%, transparent);
		padding-top: 0.6rem;
		font-weight: 600;
	}

	.check {
		flex-basis: 100%;
		font-family: var(--font-sans);
		font-weight: 400;
		color: var(--color-receipt-down);
	}

	.check.off {
		color: var(--color-receipt-up);
	}

	.printout a {
		font-weight: 500;
		color: var(--color-accent);
	}

	.message {
		border-radius: 14px;
		background: var(--color-raised);
		padding: 0.85rem 1rem;
		color: var(--color-muted);
	}

	.message.bad {
		color: var(--color-up);
	}

	@media (prefers-reduced-motion: reduce) {
		.beam {
			animation: none;
			transform: translateY(2.25rem);
		}
	}
</style>
