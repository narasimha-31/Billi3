<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { lifetime } from '../toast-queue';
	import { dismiss, toasts } from '../toasts.svelte';

	const current = $derived(toasts.current);
	const still = $derived(prefersReducedMotion.current);

	// a finger or pointer resting on it holds it; the time starts over when it leaves
	let held = $state(false);
	$effect(() => {
		const t = current;
		if (!t || held) return;
		const ms = lifetime(t);
		if (ms === null) return;
		const timer = setTimeout(() => dismiss(t.id), ms);
		return () => clearTimeout(timer);
	});

	// a short swipe down puts it away, like a phone notification
	let startY: number | null = null;
	const down = (e: PointerEvent) => {
		// capturing would send the click to the toast instead of its buttons
		if ((e.target as Element).closest('a, button')) return;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};
	const move = (e: PointerEvent) => {
		if (current && startY !== null && e.clientY - startY > 24) {
			startY = null;
			dismiss(current.id);
		}
	};
	const up = () => (startY = null);

	function act() {
		if (!current) return;
		const run = current.action?.run;
		dismiss(current.id);
		run?.();
	}
</script>

<div class="toaster" aria-live="polite">
	{#key current?.id}
		{#if current}
			<div
				class="toast"
				class:error={current.kind === 'error'}
				class:still
				role={current.kind === 'error' ? 'alert' : undefined}
				out:fade={{ duration: still ? 0 : 140 }}
				onpointerenter={() => (held = true)}
				onpointerleave={() => (held = false)}
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
			>
				<span class="text">{current.text}</span>
				{#if current.action?.href}
					<a href={current.action.href} onclick={act}>{current.action.label}</a>
				{:else if current.action}
					<button type="button" class="act" onclick={act}>{current.action.label}</button>
				{/if}
				<button type="button" class="close" aria-label="Dismiss" title="Dismiss" onclick={() => dismiss(current.id)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
				</button>
			</div>
		{/if}
	{/key}
</div>

<style>
	.toaster {
		position: fixed;
		inset: auto 0 1.5rem;
		z-index: 60;
		display: flex;
		justify-content: center;
		padding: 0 1rem;
		pointer-events: none;
	}

	/* on a phone it sits just above the tab bar, where the thumb already is */
	@media (max-width: 640px) {
		.toaster {
			bottom: calc(5.9rem + env(safe-area-inset-bottom));
		}
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 30rem;
		min-height: 3rem;
		border-radius: 999px;
		background: rgb(29 29 31 / 0.94);
		padding: 0.4rem 0.4rem 0.4rem 1.15rem;
		font-size: 0.9375rem;
		color: #fff;
		box-shadow: 0 12px 32px -10px rgb(0 0 0 / 0.4);
		pointer-events: auto;
		touch-action: pan-x;
		animation: rise var(--standard) var(--ease);
	}

	.toast.still {
		animation: none;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
	}

	.text {
		min-width: 0;
	}

	.toast a,
	.act {
		flex: none;
		border-radius: 999px;
		padding: 0.45rem 0.6rem;
		font-weight: 600;
		color: color-mix(in srgb, var(--color-accent) 40%, #fff);
	}

	.error a,
	.error .act {
		color: #fff;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.close {
		display: grid;
		flex: none;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		color: rgb(255 255 255 / 0.7);
	}

	.close svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.toast a:focus-visible,
	.act:focus-visible,
	.close:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 1px;
	}

	@media (pointer: coarse) {
		.close {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
