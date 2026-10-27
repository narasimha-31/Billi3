<script lang="ts">
	// big: the landing's large mark, where the stars inside the e read
	let { href = '/', big = false }: { href?: string; big?: boolean } = $props();
</script>

<a {href} class="wordmark" class:big aria-label="Billie home">
	<span aria-hidden="true">Billi</span><span class="e" aria-hidden="true"></span>
</a>

<style>
	.wordmark {
		display: inline-flex;
		align-items: baseline;
		font-family: var(--font-display);
		font-size: 1.9rem;
		font-weight: 650;
		letter-spacing: -0.022em;
		color: var(--color-ink);
	}

	.big {
		font-size: clamp(3rem, 9vw, 5.5rem);
		letter-spacing: -0.035em;
	}

	/* A backwards 3 at x-height, cut from a night sky. Everything is painted inside this one
	   box and clipped to the letter, so nothing it draws can reach past it. */
	.e {
		--shape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='2 1.5 16.5 21'%3E%3Cpath d='M15.8 5.6C14.4 3.9 12.6 3.2 10.5 3.2 7.1 3.2 4.8 5.1 4.8 7.6S7 11.9 10 11.9M10 11.9C6.5 11.9 4 13.7 4 16.4 4 19.2 6.7 20.9 10.6 20.9 12.9 20.9 14.9 20.1 16.5 18.4' fill='none' stroke='white' stroke-width='3.3' stroke-linecap='round'/%3E%3C/svg%3E");
		--glow: rgb(143 123 255 / 0.7);
		--sky: #1b1446, #4b2a8f 30%, #9c2f7d 55%, #e0703f 75%, #9c2f7d 90%;
		position: relative;
		display: inline-block;
		width: 0.46em;
		height: 0.585em;
		margin-left: 0.035em;
		background:
			radial-gradient(circle at 32% 60%, var(--glow), transparent 55%),
			linear-gradient(135deg, var(--sky));
		background-size:
			100% 100%,
			300% 300%;
		-webkit-mask: var(--shape) center / 100% 100% no-repeat;
		mask: var(--shape) center / 100% 100% no-repeat;
	}

	/* the night sky vanishes on a dark page, so the dark theme gets a lit one */
	@media (prefers-color-scheme: dark) {
		:global(html[data-mode='auto'] .app) .e {
			--glow: rgb(190 175 255 / 0.75);
			--sky: #7b5cff, #a66bff 30%, #ff5fae 55%, #ffb067 75%, #ff5fae 90%;
		}
	}

	:global(html[data-mode='dark'] .app) .e {
		--glow: rgb(190 175 255 / 0.75);
		--sky: #7b5cff, #a66bff 30%, #ff5fae 55%, #ffb067 75%, #ff5fae 90%;
	}

	/* two layers of small stars, tiled at different sizes so they never line up */
	.e::before,
	.e::after {
		--dot: max(0.6px, 0.011em);
		--fade: max(1.1px, 0.02em);
		content: '';
		position: absolute;
		inset: 0;
	}

	.e::before {
		background:
			radial-gradient(circle at 20% 30%, #fff 0 var(--dot), transparent var(--fade)),
			radial-gradient(circle at 70% 75%, #fff 0 var(--dot), transparent var(--fade)),
			radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.7) 0 var(--dot), transparent var(--fade));
		background-size: 0.3em 0.34em;
	}

	.e::after {
		background:
			radial-gradient(circle at 40% 60%, #fff 0 var(--dot), transparent var(--fade)),
			radial-gradient(circle at 10% 90%, rgb(255 255 255 / 0.8) 0 var(--dot), transparent var(--fade)),
			radial-gradient(circle at 75% 35%, #fff 0 var(--dot), transparent var(--fade));
		background-size: 0.41em 0.29em;
	}

	.wordmark:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 4px;
		border-radius: 6px;
	}
</style>
