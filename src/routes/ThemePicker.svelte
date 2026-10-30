<script lang="ts">
	import { enhance } from '$app/forms';
	import { backStep } from '../back-step.svelte';
	import { applyDisplay, displayOf, MODES, THEMES, type Display } from '../display';

	const MODE_NAMES: Record<Display['mode'], string> = { light: 'Light', dark: 'Dark', auto: 'System' };
	const THEME_NAMES: Record<Display['theme'], string> = { green: 'Green', ocean: 'Ocean', sunset: 'Sunset', grape: 'Grape' };

	let panel: HTMLDetailsElement;
	const step = backStep('look', () => (panel.open = false));
	let form: HTMLFormElement;
	let chosen = $state<Display | null>(null);
	let saved: Display | null = null;
	let problem = $state('');

	// the page already carries the saved look, so opening needs no request
	function opened() {
		if (!panel.open) return step.closed();
		chosen = saved = displayOf(document.documentElement);
		step.opened();
	}

	// the look changes at once and saves behind it; a failed save puts the saved look back
	function pick(change: Partial<Display>) {
		if (!chosen) return;
		// from the page as it is now, so a text or colour choice made meanwhile is kept
		chosen = { ...displayOf(document.documentElement), ...change };
		// at once, with no screen-wide fade: a fade freezes the page, and the next tap would land behind the panel
		applyDisplay(chosen, document.documentElement);
		requestAnimationFrame(() => form.requestSubmit());
	}

	function closeOutside(event: MouseEvent) {
		if (panel?.open && !panel.contains(event.target as Node)) panel.open = false;
	}
</script>

<svelte:window onclick={closeOutside} onkeydown={(e) => e.key === 'Escape' && panel?.open && (panel.open = false)} />

<details class="look" bind:this={panel} ontoggle={opened}>
	<summary aria-label="Look: light, dark and colour theme" title="Look and theme">
		<span class="swatch current" aria-hidden="true"></span>
	</summary>
	<div class="panel">
		<form
			method="POST"
			action="/settings?/display"
			bind:this={form}
			use:enhance={() =>
				async ({ result }) => {
					problem = result.type === 'success' ? '' : 'That look did not save. Try again.';
					if (result.type === 'success') saved = chosen;
					else if (saved) applyDisplay((chosen = saved), document.documentElement);
				}}
		>
			{#if chosen}
				<p class="title" id="mode-title">Look</p>
				<div class="modes" role="radiogroup" aria-labelledby="mode-title">
					{#each MODES as mode (mode)}
						<label class:on={chosen.mode === mode}>
							<input type="radio" name="mode" value={mode} checked={chosen.mode === mode} onchange={() => pick({ mode })} />
							<span>{MODE_NAMES[mode]}</span>
						</label>
					{/each}
				</div>
				<p class="title" id="theme-title">Theme</p>
				<div class="themes" role="radiogroup" aria-labelledby="theme-title">
					{#each THEMES as theme (theme)}
						<label class:on={chosen.theme === theme}>
							<input type="radio" name="theme" value={theme} checked={chosen.theme === theme} onchange={() => pick({ theme })} />
							<span class="swatch {theme}" aria-hidden="true"></span>
							<span class="name">{THEME_NAMES[theme]}</span>
						</label>
					{/each}
				</div>
				{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
			{/if}
		</form>
	</div>
</details>

<style>
	.look {
		position: relative;
	}

	summary {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		list-style: none;
		transition: transform var(--standard) var(--ease);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	/* a 44px reach without a bigger look */
	summary::after {
		content: '';
		position: absolute;
		inset: -4px;
	}

	summary:active {
		transform: scale(0.92);
		transition-duration: var(--quick);
	}

	summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	/* each theme's two lights as a small lit sphere; a hairline rim catches the light */
	.swatch {
		display: block;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		background:
			radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.5), transparent 42%),
			linear-gradient(140deg, var(--b), var(--a) 70%);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.35),
			0 1px 3px rgb(0 0 0 / 0.25);
	}

	.swatch.green,
	:global(html:not([data-theme])) .swatch.current {
		--a: #1f7a4d;
		--b: #2bb3a3;
	}

	.swatch.ocean,
	:global(html[data-theme='ocean']) .swatch.current {
		--a: #0a64a4;
		--b: #22c3e6;
	}

	.swatch.sunset,
	:global(html[data-theme='sunset']) .swatch.current {
		--a: #e8661f;
		--b: #e33c6e;
	}

	.swatch.grape,
	:global(html[data-theme='grape']) .swatch.current {
		--a: #6a3fc8;
		--b: #d23ca0;
	}

	.panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		right: -3rem;
		z-index: 30;
		width: min(19rem, calc(100vw - 2rem));
		border-radius: 18px;
		background: var(--color-surface);
		padding: 1rem;
		box-shadow:
			0 12px 32px rgb(0 0 0 / 0.18),
			0 0 0 1px color-mix(in srgb, var(--color-sep) 12%, transparent);
		transform-origin: top right;
		animation: arrive var(--standard) var(--ease);
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.97);
		}
	}

	.title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	.title + .modes,
	.title + .themes {
		margin-top: 0.5rem;
	}

	.modes + .title {
		margin-top: 1.1rem;
	}

	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-radius: 10px;
		background: rgb(118 118 128 / 0.14);
		padding: 2px;
	}

	.modes label {
		display: grid;
		place-items: center;
		min-height: 2.25rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-ink);
		cursor: pointer;
		transition:
			background-color var(--quick) var(--ease),
			box-shadow var(--quick) var(--ease);
	}

	.modes label.on {
		background: var(--color-selected);
		box-shadow:
			0 3px 8px rgb(0 0 0 / 0.12),
			0 0 0 1px color-mix(in srgb, var(--color-sep) 10%, transparent);
	}

	.themes {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.25rem;
	}

	.themes label {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		border-radius: 12px;
		padding: 0.5rem 0 0.4rem;
		font-size: 0.75rem;
		color: var(--color-muted);
		cursor: pointer;
	}

	.themes .swatch {
		width: 2.25rem;
		height: 2.25rem;
		transition: transform var(--standard) var(--ease);
	}

	/* the chosen theme wears a ring a hair off its edge */
	.themes label.on .swatch {
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.35),
			0 0 0 2px var(--color-surface),
			0 0 0 4px var(--color-ink);
	}

	.themes label.on .name {
		font-weight: 600;
		color: var(--color-ink);
	}

	.themes label:active .swatch {
		transform: scale(0.9);
		transition-duration: var(--quick);
	}

	label:has(input:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.problem {
		margin-top: 0.75rem;
		font-size: 0.8125rem;
		color: var(--color-danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: none;
		}
	}
</style>
