<script lang="ts">
	import type { Snippet } from 'svelte';
	import { backStep } from '../back-step.svelte';
	import type { Point } from '../distance';
	import StoreMap, { type MapPin } from './StoreMap.svelte';

	// A map strip that opens on the whole screen. A phone's strip only opens it; a laptop's still works
	// in place, with the button in its corner. The bar along the bottom of the big map says what it shows.
	let {
		you,
		pins,
		selected = null,
		onpick,
		label,
		title,
		bar,
		big = $bindable(false)
	}: { you: Point | null; pins: MapPin[]; selected?: string | null; onpick?: (id: string) => void; label: string; title: string; bar?: Snippet; big?: boolean } = $props();

	const step = backStep('map', () => (big = false));
	function open() {
		big = true;
		step.opened();
	}
	function close() {
		big = false;
		step.closed();
	}
	// a sheet opened from the big map takes its place, and its back step with it
	export function handOff() {
		if (big) step.handedOff();
		big = false;
	}
</script>

<div class="frame">
	<StoreMap {you} {pins} {selected} {onpick} {label} />
	<button type="button" class="open-map" onclick={open}>
		<span class="pill">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
			Open map
		</span>
	</button>
</div>
{#if big}
	<dialog class="big-map" {@attach (d) => d.showModal()} onclose={close} aria-label={label}>
		<div class="big-frame">
			<StoreMap full {you} {pins} {selected} {onpick} {label} />
		</div>
		<button type="button" class="close-map" aria-label="Close the map" title="Close the map" onclick={close}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</button>
		<div class="big-bar">
			<p class="big-title">{title}</p>
			{@render bar?.()}
		</div>
	</dialog>
{/if}

<style>
	.frame {
		position: relative;
		overflow: hidden;
		height: var(--map-height, 13rem);
		border-radius: 14px;
		box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.08);
		isolation: isolate;
	}

	.open-map {
		position: absolute;
		inset: 0;
		z-index: 500;
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 0.5rem;
		-webkit-tap-highlight-color: transparent;
	}

	@media (pointer: fine) {
		.open-map {
			inset: 0 0 auto auto;
		}
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2rem;
		border-radius: 999px;
		background: var(--color-surface);
		padding: 0.3rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-ink);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.16);
		transition: transform var(--quick) var(--ease);
	}

	.open-map:active .pill {
		transform: scale(0.96);
	}

	.pill svg,
	.close-map svg {
		width: 0.95rem;
		height: 0.95rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.open-map:focus-visible .pill,
	.close-map:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.big-map {
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		border: 0;
		padding: 0;
		background: var(--color-map);
	}

	.big-frame {
		position: absolute;
		inset: 0;
	}

	/* the zoom buttons clear the notch, level with the close button */
	.big-frame :global(.leaflet-top) {
		top: calc(0.75rem + env(safe-area-inset-top));
	}

	.big-frame :global(.leaflet-left .leaflet-control) {
		margin: 0 0 0 0.75rem;
	}

	.big-frame :global(.leaflet-control-zoom a) {
		width: 2.75rem;
		height: 2.75rem;
		line-height: 2.75rem;
		font-size: 1.25rem;
	}

	.close-map {
		position: absolute;
		top: calc(0.75rem + env(safe-area-inset-top));
		right: 0.75rem;
		z-index: 1000;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-ink);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
	}

	.big-bar {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
		z-index: 1000;
		display: grid;
		gap: 0.35rem;
		max-width: 30rem;
		max-height: 45dvh;
		overflow-y: auto;
		border-radius: 16px;
		background: var(--color-surface);
		padding: 0.85rem 1rem;
		font-size: 0.875rem;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
	}

	.big-title {
		font-weight: 600;
		color: var(--color-ink);
	}
</style>
