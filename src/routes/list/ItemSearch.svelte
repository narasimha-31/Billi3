<script lang="ts">
	import { enhance } from '$app/forms';
	import { shortDay } from '../../format';
	import AisleIcon from '../AisleIcon.svelte';

	type Product = { name: string; times: number; last_bought: string | null; category: string | null };
	let { products, onList, list, listName }: { products: Product[]; onList: Set<string>; list: string; listName: string } = $props();

	let typed = $state('');
	let focused = $state(false);
	let active = $state(-1);
	let field = $state<HTMLInputElement>();
	let form = $state<HTMLFormElement>();

	// What they have bought before, best match first: a name that starts with what was typed, then a
	// word in it that does, then anywhere. With nothing typed, what they buy most. O(products).
	const SHOWN = 6;
	const matches = $derived.by(() => {
		const q = typed.trim().toLowerCase();
		const left = products.filter((p) => !onList.has(p.name.toLowerCase()));
		if (!q) return left.slice(0, SHOWN);
		const rank = (name: string) => {
			const n = name.toLowerCase();
			if (n.startsWith(q)) return 0;
			if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
			return n.includes(q) ? 2 : 3;
		};
		return left
			.map((p) => ({ p, r: rank(p.name) }))
			.filter((m) => m.r < 3)
			.sort((a, b) => a.r - b.r || b.p.times - a.p.times)
			.slice(0, SHOWN)
			.map((m) => m.p);
	});
	// a new thing, not one they have bought, can always be added as typed
	const fresh = $derived(typed.trim() && !matches.some((p) => p.name.toLowerCase() === typed.trim().toLowerCase()) ? typed.trim() : null);
	const options = $derived([...matches.map((p) => p.name), ...(fresh ? [fresh] : [])]);
	const open = $derived(focused && options.length > 0);
	$effect(() => {
		void typed;
		active = -1;
	});

	function add(name: string) {
		typed = name;
		// the form reads the field, so it is sent once the field shows the name
		queueMicrotask(() => form?.requestSubmit());
	}

	function keys(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!options.length) return;
			focused = true;
			active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
		} else if (e.key === 'Enter' && active >= 0) {
			e.preventDefault();
			add(options[active]);
		} else if (e.key === 'Escape') {
			focused = false;
		}
	}

	const sent = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
		await update();
		typed = '';
		field?.focus();
	};
</script>

<form class="search-add" method="POST" action="?/add" use:enhance={sent} bind:this={form}>
	<input type="hidden" name="list" value={list} />
	<label class="field">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
		<input
			name="name"
			bind:this={field}
			bind:value={typed}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			onkeydown={keys}
			role="combobox"
			aria-expanded={open}
			aria-controls="item-options"
			aria-activedescendant={active >= 0 ? `item-option-${active}` : undefined}
			aria-autocomplete="list"
			aria-label="Add an item to {listName}"
			placeholder="Search what you buy, or type anything"
			autocomplete="off"
			maxlength="60"
			required
		/>
		{#if typed}
			<button type="button" class="clear" aria-label="Clear" title="Clear" onmousedown={(e) => e.preventDefault()} onclick={() => (typed = '')}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
			</button>
		{/if}
	</label>

	{#if open}
		<ul class="options" id="item-options" role="listbox" aria-label="Suggestions">
			{#if !typed.trim()}<li class="heading" role="presentation">You buy these most</li>{/if}
			<!-- the arrow keys on the field move through these, as in any combobox -->
			{#each matches as product, i (product.name)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li id="item-option-{i}" role="option" aria-selected={active === i} class:active={active === i} onmousedown={(e) => e.preventDefault()} onclick={() => add(product.name)}>
					<AisleIcon aisle={product.category} />
					<span class="name">{product.name}</span>
					<span class="meta">{product.times} {product.times === 1 ? 'time' : 'times'}{product.last_bought ? ` · last ${shortDay(product.last_bought)}` : ''}</span>
				</li>
			{/each}
			{#if fresh}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li id="item-option-{matches.length}" role="option" aria-selected={active === matches.length} class="fresh" class:active={active === matches.length} onmousedown={(e) => e.preventDefault()} onclick={() => add(fresh)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					<span class="name">Add “{fresh}”</span>
				</li>
			{/if}
		</ul>
	{/if}
</form>

<style>
	.search-add {
		position: relative;
		margin-top: 0.75rem;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.9rem;
		border-radius: 12px;
		background: color-mix(in srgb, rgb(118 118 128) 12%, var(--color-surface));
		padding: 0 0.5rem 0 0.8rem;
	}

	.field:focus-within {
		outline: 2px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
	}

	.field > svg {
		width: 1.2rem;
		height: 1.2rem;
		flex: none;
		fill: none;
		stroke: var(--color-muted);
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* 16px text: iOS Safari zooms the page on any smaller field */
	.field input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.6rem 0;
		font-size: 1rem;
		color: var(--color-ink);
		outline: none;
	}

	.clear {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		color: var(--color-muted);
	}

	.clear svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}

	.options {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		left: 0;
		z-index: 30;
		overflow: hidden;
		border-radius: 14px;
		background: var(--color-surface);
		padding: 0.3rem 0;
		box-shadow:
			0 12px 32px -8px rgb(0 0 0 / 0.28),
			0 0 0 0.5px rgb(0 0 0 / 0.1);
		animation: drop 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.heading {
		padding: 0.35rem 1rem 0.2rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	[role='option'] {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		min-height: 2.75rem;
		padding: 0.4rem 1rem;
		cursor: pointer;
		font-size: 0.9375rem;
		color: var(--color-ink);
	}

	[role='option'].active {
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		font-size: 0.8125rem;
		color: var(--color-muted);
		white-space: nowrap;
	}

	.fresh {
		color: var(--color-accent);
		font-weight: 600;
	}

	.fresh svg {
		width: 1.15rem;
		height: 1.15rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}

	@media (hover: hover) {
		[role='option']:hover {
			background: color-mix(in srgb, rgb(118 118 128) 10%, transparent);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.options {
			animation: none;
		}
	}
</style>
