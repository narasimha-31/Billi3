<script lang="ts" module>
	export const SCENES = [
		{ id: 'town', label: 'Your town' },
		{ id: 'gap', label: 'Store gap' },
		{ id: 'creep', label: 'Price rises' },
		{ id: 'recall', label: 'Recalls' }
	];
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import GoogleButton from './GoogleButton.svelte';
	import { priceOf } from './store-prices';

	let { signInFailed, scene = $bindable(0), flying = $bindable(true) }: { signInFailed: boolean; scene?: number; flying?: boolean } = $props();

	// Sourced 2026 chicken breast prices, three pounds, at five chains placed around a drawn town
	const PACK_LB = 3;
	const stores = [
		{ name: 'Wegmans', x: 1380, y: 560 },
		{ name: 'Aldi', x: 640, y: 760 },
		{ name: 'Walmart', x: 1060, y: 1180 },
		{ name: 'Kroger', x: 470, y: 1400 },
		{ name: 'Target', x: 1500, y: 1440 }
	].map((s) => ({ ...s, cents: Math.round(priceOf(s.name, 'chicken')! * PACK_LB * 100) }));
	const low = stores.reduce((a, b) => (b.cents < a.cents ? b : a));
	const high = stores.reduce((a, b) => (b.cents > a.cents ? b : a));
	const gap = high.cents - low.cents;
	// US average price of a pound of ground beef, every other month, Jan 2025 to Sep 2026
	// (Bureau of Labor Statistics series APU0000703112), in cents
	const beef = [555, 579, 598, 625, 632, 654, 675, 670, 675, 689, 679];
	const beefLow = Math.min(...beef);
	const beefHigh = Math.max(...beef);
	const chartAt = { x: 960, y: 1560 };
	const recall = {
		title: 'Family Farmstead Dairy recalls raw mild cheddar over possible E. coli',
		url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/family-farmstead-dairy-announces-recall-raw-mild-cheddar-cheese-due-potential-e-coli-o26h11-and'
	};
	const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

	// the town: a river, highways, avenues, and blocks of buildings, laid out once from a fixed seed
	const SIZE = 2000;
	const roads = [
		'M0 520 C 600 470 1100 640 2000 560',
		'M300 2000 C 420 1400 760 1100 1100 900 S 1700 300 1900 0',
		'M0 1500 C 700 1380 1300 1560 2000 1380',
		'M1180 0 C 1150 700 1240 1300 1120 2000'
	];
	const PERSPECTIVE = 1500;
	let seed = 7;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	const buildings: { x: number; y: number; w: number; h: number }[] = [];
	for (let bx = 60; bx < SIZE - 60; bx += 160)
		for (let by = 60; by < SIZE - 60; by += 160)
			for (let k = 0; k < 3; k++) {
				const w = 26 + rand() * 50;
				const h = 22 + rand() * 46;
				buildings.push({ x: bx + 14 + rand() * (130 - w), y: by + 14 + rand() * (130 - h), w, h });
			}

	// Camera stops, one per scene: the point it looks at, zoom, tilt and turn. The stage's anchor sits
	// right of the words on a laptop and above the card on a phone.
	type Shot = { x: number; y: number; zoom: number; tilt: number; spin: number };
	const shots: Shot[] = [
		{ x: 1000, y: 1000, zoom: 0.46, tilt: 52, spin: -14 },
		{ x: 1440, y: 1000, zoom: 0.6, tilt: 56, spin: -78 },
		{ x: 960, y: 1560, zoom: 0.95, tilt: 58, spin: -62 },
		{ x: 1060, y: 1180, zoom: 0.98, tilt: 54, spin: -150 }
	];
	const scenes = SCENES;

	let flight: HTMLElement;
	let steps: HTMLElement;
	let plane: HTMLElement;
	let wash: HTMLElement;
	let gapLine: SVGPathElement;
	let stage: HTMLElement;
	let pins: HTMLElement[] = $state([]);
	let gapTag = $state<HTMLElement>();
	let chart = $state<HTMLElement>();
	let flip = $state<HTMLElement>();
	let flipped = $state(false);
	const gapAt = { x: (low.x + high.x) / 2 + 150, y: (low.y + high.y) / 2 };
	const gapBend = { x: (low.x + high.x) / 2 + 260, y: (low.y + high.y) / 2 };
	const gapBox = (() => {
		const xs = [low.x, high.x, gapBend.x];
		const ys = [low.y, high.y, gapBend.y];
		const x = Math.min(...xs) - 10;
		const y = Math.min(...ys) - 10;
		return { x, y, w: Math.max(...xs) + 10 - x, h: Math.max(...ys) + 10 - y };
	})();
	let ready = $state(false);

	onMount(() => {
		const still = matchMedia('(prefers-reduced-motion: reduce)');
		let top = 0;
		let span = 1;
		let phone = false;
		let width = 0;
		let height = 0;
		let frame = 0;
		const now = { ...shots[0], t: 0 };

		function measure() {
			const box = flight.getBoundingClientRect();
			top = box.top + scrollY;
			height = innerHeight;
			width = innerWidth;
			span = Math.max(1, box.height);
			phone = width < 760;
		}

		// Where the scroll says the camera should be: scene i while its words fill the screen, part way to
		// the next as they scroll off. Read from the steps themselves, whatever their height.
		function progress() {
			const all = steps.children;
			let t = 0;
			for (let i = 0; i < all.length; i++) {
				const box = all[i].getBoundingClientRect();
				if (box.top > 1) break;
				// a step resting a fraction of a pixel low would make t negative and the loop die
				t = Math.min(scenes.length - 1, i + Math.min(1, Math.max(0, -box.top) / box.height));
			}
			return t;
		}

		function target() {
			const t = progress();
			if (still.matches) return { ...shots[Math.round(t)], t: Math.round(t) };
			const i = Math.min(shots.length - 2, Math.floor(t));
			const f = Math.min(1, Math.max(0, (t - i - 0.2) / 0.6));
			const e = f * f * (3 - 2 * f);
			const a = shots[i];
			const b = shots[i + 1];
			const mix = (k: keyof Shot) => a[k] + (b[k] - a[k]) * e;
			return { x: mix('x'), y: mix('y'), zoom: mix('zoom'), tilt: mix('tilt'), spin: mix('spin'), t };
		}

		let last = 0;
		function draw(time: number) {
			const goal = target();
			// eased toward the scroll by time, not frames, so a jumpy flick still reads as one smooth flight
			const dt = last ? Math.min(100, time - last) : 16;
			last = time;
			const k = still.matches ? 1 : 1 - Math.exp(-dt / 110);
			let moving = false;
			for (const key of ['x', 'y', 'zoom', 'tilt', 'spin', 't'] as const) {
				const d = goal[key] - now[key];
				if (Math.abs(d) > (key === 'zoom' || key === 't' ? 0.0005 : 0.05)) moving = true;
				now[key] += d * k;
			}
			// on a phone the opening town sits low and small, under the words
			const hero = phone ? Math.max(0, 1 - now.t * 2.5) : 0;
			const zoom = now.zoom * (phone ? 0.72 - hero * 0.16 : 1);
			const ax = width * (phone ? 0.5 : 0.66);
			const ay = height * (phone ? 0.4 + hero * 0.5 : 0.55);
			// written straight to the few elements that move, so nothing else is restyled each frame
			wash.style.opacity = `${hero}`;
			stage.style.perspectiveOrigin = `${ax}px ${ay}px`;
			plane.style.transform = `translate3d(${ax}px, ${ay}px, 0) rotateX(${now.tilt}deg) rotateZ(${now.spin}deg) scale(${zoom}) translate(${-now.x}px, ${-now.y}px)`;
			const part = (from: number) => Math.min(1, Math.max(0, (now.t - from) / 0.45));
			// on a phone the next words card scrolls up over the map's cards, so they leave before it reaches them
			const leave = phone ? 0.45 : 0;
			const gapSeen = part(0.55) * (1 - part(1.5 - leave));
			const creepSeen = part(1.55) * (1 - part(2.45 - leave));
			const turned = part(2.5);
			gapLine.style.strokeDashoffset = `${1 - part(0.55)}`;
			gapLine.style.opacity = `${gapSeen}`;
			gapTag?.style.setProperty('--seen', `${gapSeen}`);
			chart?.style.setProperty('--creep', `${creepSeen}`);

			// What stands on the map is drawn flat on top: each spot goes through the same camera as the
			// map, then the perspective, so the words stay sharp and every browser shows the same thing.
			const tilt = (now.tilt * Math.PI) / 180;
			const spin = (now.spin * Math.PI) / 180;
			const [cs, ss, ct, st] = [Math.cos(spin), Math.sin(spin), Math.cos(tilt), Math.sin(tilt)];
			const place = (el: HTMLElement | undefined, px: number, py: number, size = 1) => {
				if (!el) return;
				const u = (px - now.x) * zoom;
				const v = (py - now.y) * zoom;
				const across = u * cs - v * ss;
				const down = u * ss + v * cs;
				const near = PERSPECTIVE / (PERSPECTIVE - down * st);
				el.style.transform = `translate3d(${ax + across * near}px, ${ay + down * ct * near}px, 0) scale(${near * size * (phone ? 0.82 : 1)})`;
			};
			stores.forEach((s, i) => place(pins[i], s.x, s.y));
			place(gapTag, gapAt.x, gapAt.y);
			place(chart, chartAt.x, chartAt.y);
			// the recall turns the Walmart tag over like a card
			if (flip) {
				flip.style.scale = `${Math.max(0.02, Math.abs(Math.cos(Math.PI * turned)))} 1`;
				if (flipped !== turned > 0.5) flipped = turned > 0.5;
			}
			scene = Math.round(now.t);
			flying = scrollY < top + span - height * 0.5;
			frame = moving ? requestAnimationFrame(draw) : 0;
			if (!frame) last = 0;
		}
		const go = () => (frame ||= requestAnimationFrame(draw));

		measure();
		go();
		requestAnimationFrame(() => (ready = true));
		const resized = new ResizeObserver(() => {
			measure();
			go();
		});
		resized.observe(flight);
		addEventListener('scroll', go, { passive: true });
		addEventListener('resize', go, { passive: true });
		return () => {
			resized.disconnect();
			removeEventListener('scroll', go);
			removeEventListener('resize', go);
			cancelAnimationFrame(frame);
		};
	});
</script>

<section class="flight" bind:this={flight} aria-label="What your receipts show">
	<div class="stage" bind:this={stage} class:ready data-scene={scene} aria-hidden="true">
		<div class="wash" bind:this={wash}></div>
		<div class="plane" bind:this={plane}>
			<svg class="map" viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
				<rect width={SIZE} height={SIZE} class="land" />
				{#each buildings as b, i (i)}<rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" class="building" />{/each}
				<path class="river" d="M-40 300 C 420 380 520 900 900 980 S 1500 900 2040 1180" />
				<g class="streets">
					{#each { length: 13 } as _, i (i)}
						<path d="M{i * 160 + 40} 0 V {SIZE}" />
						<path d="M0 {i * 160 + 40} H {SIZE}" />
					{/each}
				</g>
				<g class="road-edges">
					{#each roads as d (d)}<path {d} />{/each}
				</g>
				<g class="roads">
					{#each roads as d (d)}<path {d} />{/each}
				</g>
				{#each stores as s (s.name)}
					<ellipse cx={s.x} cy={s.y} rx="34" ry="34" class="spot" />
					<circle cx={s.x} cy={s.y} r="11" class="dot" />
				{/each}
			</svg>
			<!-- its own small layer, so drawing the line never repaints the whole town -->
			<svg class="gap" viewBox="{gapBox.x} {gapBox.y} {gapBox.w} {gapBox.h}" style:left="{gapBox.x}px" style:top="{gapBox.y}px" width={gapBox.w} height={gapBox.h}>
				<path class="gap-line" bind:this={gapLine} pathLength="1" d="M{low.x} {low.y} Q {gapBend.x} {gapBend.y} {high.x} {high.y}" />
			</svg>
		</div>

		<div class="overlay">
			{#each stores as s, i (s.name)}
				<div class="spot-at" bind:this={pins[i]}>
					<div class="pin" class:low={s === low} class:high={s === high} class:walmart={s.name === 'Walmart'} style:--i={i}>
						{#if s.name === 'Walmart'}
							<div class="face" class:flipped bind:this={flip}>
								<span class="who front">{s.name}</span>
								<span class="price front">{money(s.cents)}</span>
								<span class="who back">Recall</span>
								<span class="price back">Cheddar</span>
							</div>
						{:else}
							<div class="face">
								<span class="who">{s.name}</span>
								<span class="price">{money(s.cents)}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
			<div class="spot-at" bind:this={gapTag}><div class="gap-tag">{money(gap)} more</div></div>
			<div class="spot-at" bind:this={chart}>
				<div class="chart">
					<p class="chart-head">Ground beef, per pound <strong>{money(beef[0])} → {money(beef.at(-1)!)}</strong></p>
					<div class="bars">
						{#each beef as cents, i (i)}
							<span style:--h={(cents - beefLow) / (beefHigh - beefLow)} style:--i={i}></span>
						{/each}
					</div>
					<p class="chart-foot"><span>Jan 2025</span><span>US average, BLS</span><span>Sep 2026</span></p>
				</div>
			</div>
		</div>

	</div>

	<div class="steps" bind:this={steps}>
		<div class="step first" id="scene-town">
			<div class="words">
				<h1>Your town has a cheaper store. Your receipts know which.</h1>
				<p class="lead">Billie is a free app that reads your grocery receipts and remembers every price, so you see where things cost less, when prices go up, and when something you bought is recalled.</p>
				{#if signInFailed}<p class="failed" role="alert">Sign-in didn’t go through. Try again.</p>{/if}
				<div class="actions">
					<GoogleButton />
					<a class="quiet" href="/demo">Try the demo</a>
				</div>
			</div>
		</div>
		<div class="step" id="scene-gap">
			<div class="words card">
				<h2>Same chicken. {money(gap)} more across town.</h2>
				<p>Three pounds of chicken breast: {money(low.cents)} at {low.name}, {money(high.cents)} at {high.name}. The receipts end up in different drawers, so you never compare them. Billie does.</p>
			</div>
		</div>
		<div class="step" id="scene-creep">
			<div class="words card">
				<h2>Ground beef is up {money(beef.at(-1)! - beef[0])} a pound. Did you notice?</h2>
				<p>The US average went from {money(beef[0])} in January 2025 to {money(beef.at(-1)!)} in September 2026, a little at a time. Billie shows each rise on your own receipts, store by store, the day it happens.</p>
			</div>
		</div>
		<div class="step" id="scene-recall">
			<div class="words card">
				<h2>A recall, matched to what you bought.</h2>
				<p>When the FDA posts a food recall, Billie checks it against your receipts and puts it on your home screen.</p>
				<a class="recall" href={recall.url} target="_blank" rel="noopener noreferrer">
					<span>FDA</span>{recall.title}
				</a>
			</div>
		</div>
	</div>
</section>

<style>
	.flight {
		position: relative;
	}

	/* the town stays put behind the words while they scroll past */
	.stage {
		position: sticky;
		top: 0;
		height: 100svh;
		overflow: hidden;
		perspective: 1500px;
		perspective-origin: 66% 55%;
		background: radial-gradient(ellipse 80% 70% at 66% 55%, #fff, var(--color-bg) 75%);
	}

	/* on a phone the words open over a soft wash, so the town never runs under them */
	.wash {
		position: absolute;
		inset: 0 0 35%;
		z-index: 1;
		background: linear-gradient(var(--color-bg) 70%, transparent);
		opacity: 0;
		pointer-events: none;
	}

	.plane {
		position: absolute;
		top: 0;
		left: 0;
		width: 2000px;
		height: 2000px;
		transform-origin: 0 0;
		transform: translate3d(66vw, 55vh, 0) rotateX(52deg) rotateZ(-14deg) scale(0.46) translate(-1000px, -1000px);
		will-change: transform;
	}

	.map {
		position: absolute;
		inset: 0;
		display: block;
		-webkit-mask-image: radial-gradient(circle at 50% 50%, #000 52%, transparent 71%);
		mask-image: radial-gradient(circle at 50% 50%, #000 52%, transparent 71%);
	}

	.land {
		fill: #eceef2;
	}

	.building {
		fill: #e1e4ea;
	}

	.river {
		fill: none;
		stroke: #dbe3ec;
		stroke-width: 70;
		stroke-linecap: round;
	}

	.streets path {
		fill: none;
		stroke: #f7f8fa;
		stroke-width: 10;
	}

	.roads path,
	.road-edges path {
		fill: none;
		stroke: #fff;
		stroke-width: 26;
		stroke-linecap: round;
	}

	/* a soft edge under each road, drawn once instead of a filter */
	.road-edges path {
		stroke: #dde1e7;
		stroke-width: 30;
	}

	.spot {
		fill: color-mix(in srgb, var(--color-ink) 7%, transparent);
	}

	.dot {
		fill: var(--color-ink);
		stroke: #fff;
		stroke-width: 6;
	}

	.gap {
		position: absolute;
		overflow: visible;
		will-change: opacity;
	}

	.gap-line {
		fill: none;
		stroke: var(--color-up);
		stroke-width: 9;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		opacity: 0;
	}

	/* what stands on the map lives on a flat layer above it, placed by the camera each frame */
	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.spot-at {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.pin {
		position: absolute;
		bottom: 18px;
		left: 0;
		translate: -50% 0;
		transition:
			opacity 400ms,
			scale 500ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	/* the tags rise out of the map once, one after another, when the page opens */
	.stage:not(.ready) .pin {
		opacity: 0;
		translate: -50% 26px;
	}

	.ready .pin {
		transition:
			opacity 500ms calc(var(--i) * 90ms + 150ms),
			translate 700ms cubic-bezier(0.16, 1, 0.3, 1) calc(var(--i) * 90ms + 150ms),
			scale 500ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	.face {
		display: grid;
		justify-items: center;
		min-width: 6.5rem;
		border-radius: 14px;
		background: #fff;
		padding: 0.45rem 0.9rem 0.5rem;
		box-shadow:
			0 10px 24px -8px rgb(0 0 0 / 0.28),
			0 0 0 0.5px rgb(0 0 0 / 0.08);
		transition: background-color 120ms;
	}

	.face::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		width: 12px;
		height: 12px;
		border-radius: 2px;
		background: inherit;
		translate: -50% 0;
		rotate: 45deg;
	}

	.who {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-muted);
	}

	.price {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		color: var(--color-ink);
	}

	.low .face {
		background: var(--color-accent);
	}

	.low .who,
	.low .price {
		color: #fff;
	}

	.high .price {
		color: var(--color-up);
	}

	/* each scene lifts what it is about and lets the rest fall back */
	[data-scene='1'] .pin:is(.low, .high),
	[data-scene='3'] .pin.walmart {
		scale: 1.18;
	}

	[data-scene='1'] .pin:not(.low, .high),
	[data-scene='2'] .pin,
	[data-scene='3'] .pin:not(.walmart) {
		opacity: 0.35;
	}

	.face .back,
	.face.flipped .front {
		display: none;
	}

	.face.flipped .back {
		display: block;
	}

	.face.flipped {
		background: var(--color-up);
	}

	.face.flipped .who,
	.face.flipped .price {
		color: #fff;
	}

	.gap-tag {
		position: absolute;
		bottom: 0;
		translate: -50% 0;
		white-space: nowrap;
		border-radius: 999px;
		background: var(--color-up);
		padding: 0.4rem 0.85rem;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: #fff;
		box-shadow: 0 10px 24px -8px rgb(180 35 24 / 0.5);
		opacity: var(--seen, 0);
		scale: calc(0.8 + var(--seen, 0) * 0.2);
	}

	.chart {
		position: absolute;
		bottom: 0.75rem;
		left: 0;
		width: 13rem;
		border-radius: 16px;
		background: #fff;
		padding: 0.75rem 0.85rem 0.85rem;
		box-shadow: 0 14px 30px -10px rgb(0 0 0 / 0.25);
		opacity: var(--creep, 0);
		translate: -50% calc((1 - var(--creep, 0)) * 20px);
	}

	.chart-head {
		font-size: 0.8125rem;
		color: var(--color-muted);
	}

	.chart-head strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.125rem;
		color: var(--color-up);
	}

	.chart-foot {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.4rem;
		font-size: 0.6875rem;
		color: var(--color-muted);
	}

	.bars {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 4.5rem;
		margin-top: 0.5rem;
	}

	.bars span {
		flex: 1;
		height: calc(25% + var(--h) * 75%);
		border-radius: 3px 3px 1px 1px;
		background: color-mix(in srgb, var(--color-up) calc(35% + var(--h) * 65%), #e5e5ea);
		transform-origin: bottom;
		scale: 1 clamp(0, calc(var(--creep, 0) * 14 - var(--i)), 1);
	}

	/* the words scroll over the town, one screen per scene */
	.steps {
		position: relative;
		margin-top: -100svh;
	}

	.step {
		display: flex;
		align-items: center;
		min-height: 100svh;
		margin: 0 auto;
		max-width: var(--page);
		padding: 6rem var(--gutter) 3rem;
		pointer-events: none;
	}

	.words {
		max-width: 31rem;
		pointer-events: auto;
	}

	.first .words {
		max-width: 36rem;
	}

	h1,
	h2 {
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: -0.035em;
		text-wrap: balance;
		color: var(--color-ink);
	}

	h1 {
		font-size: clamp(2.5rem, 5.4vw, 4.75rem);
		line-height: 1.02;
	}

	h2 {
		font-size: clamp(1.75rem, 3vw, 2.75rem);
		line-height: 1.06;
	}

	.lead,
	.card p {
		margin-top: 1rem;
		font-size: clamp(1.0625rem, 1.3vw, 1.25rem);
		line-height: 1.5;
		color: var(--color-muted);
		text-wrap: pretty;
	}

	.card {
		border-radius: 24px;
		background: color-mix(in srgb, var(--color-bg) 88%, transparent);
		padding: 1.5rem 1.6rem 1.6rem;
		box-shadow: 0 20px 50px -24px rgb(0 0 0 / 0.25);
	}

	.failed {
		margin-top: 1rem;
		color: var(--color-up);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
		margin-top: 1.75rem;
	}

	.quiet {
		border-radius: 999px;
		background: rgb(255 255 255 / 0.7);
		padding: 0.75rem 1.25rem;
		font-size: 1.0625rem;
		font-weight: 500;
		color: var(--color-ink);
		box-shadow: inset 0 0 0 1px var(--color-line);
		transition: box-shadow 200ms;
	}

	@media (hover: hover) {
		.quiet:hover {
			box-shadow: inset 0 0 0 1px var(--color-ink);
		}

		.recall:hover {
			text-decoration-color: currentColor;
		}
	}

	.quiet:focus-visible,
	.recall:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	.recall {
		display: block;
		margin-top: 1rem;
		border-radius: 14px;
		background: color-mix(in srgb, var(--color-up) 8%, #fff);
		padding: 0.75rem 0.9rem;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: var(--color-ink);
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 3px;
		transition: text-decoration-color 150ms;
	}

	.recall span {
		display: block;
		margin-bottom: 0.15rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-up);
	}

	/* on a phone the town fills the screen and each scene's words sit in a card at the bottom */
	@media (max-width: 759px) {
		/* both actions the same width, one above the other, easy for a thumb */
		.actions {
			flex-direction: column;
			align-items: stretch;
			gap: 0.65rem;
		}

		.actions :global(form),
		.actions :global(button) {
			width: 100%;
			justify-content: center;
		}

		.quiet {
			text-align: center;
		}

		.step {
			align-items: flex-end;
			padding: 6rem var(--gutter) calc(1.25rem + env(safe-area-inset-bottom));
		}

		.first {
			align-items: flex-start;
			padding-top: 5.5rem;
		}

		h1 {
			font-size: clamp(2.1rem, 9.4vw, 2.75rem);
		}

		.first .lead {
			font-size: 1.0625rem;
		}

		.card {
			padding: 1.15rem 1.2rem 1.25rem;
		}

		.face {
			min-width: 5.5rem;
			padding: 0.35rem 0.7rem 0.4rem;
		}

		.price {
			font-size: 1.25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pin,
		.ready .pin {
			transition: none;
		}

		.stage:not(.ready) .pin {
			opacity: 1;
			translate: -50% 0;
		}
	}
</style>
