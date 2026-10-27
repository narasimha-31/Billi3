<script lang="ts">
	import { onMount } from 'svelte';

	// real screenshots of the signed-in home, from the sample shopper, at each screen's own shape: a
	// book-style foldable shut (about 83.8 x 120.6 mm) and open (about 167.6 x 120.6 mm), a phone, a laptop
	const SHUT = { src: '/images/app-home-fold-closed.jpg', w: 828, h: 1192 };
	const OPEN = { src: '/images/app-home-fold-open.jpg', w: 1664, h: 1197 };
	const PHONE = { src: '/images/app-home-phone.jpg', w: 880, h: 1912 };
	const LAPTOP = { src: '/images/app-home-laptop.jpg', w: 2880, h: 1800 };
	// layers of metal stacked behind each screen, close enough to read as one solid side
	const SLABS = Array.from({ length: 8 }, (_, i) => i / 7);

	let section: HTMLElement;
	let stage: HTMLElement;
	let words: HTMLElement;
	let note: HTMLElement;
	let fold: HTMLElement;
	let base: HTMLElement;
	let cover: HTMLElement;
	let shade: HTMLElement;
	let device: HTMLElement;
	let screen: HTMLElement;
	let island: HTMLElement;
	let openShot: HTMLImageElement;
	let phoneShot: HTMLImageElement;
	let laptopShot: HTMLImageElement;
	let still = $state(false);

	// One flight on scroll: the foldable swings open like a book, the open screen reshapes into a phone,
	// and the phone grows into a laptop. The opening is two real panels turning on the hinge; after it, a
	// single window changes shape, so the swap between them is invisible.
	onMount(() => {
		still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let frame = 0;
		let last = 0;
		let now = 0;

		const ease = (x: number, from: number, to: number) => {
			const f = Math.min(1, Math.max(0, (x - from) / (to - from)));
			return f * f * (3 - 2 * f);
		};

		function draw(time: number) {
			const box = section.getBoundingClientRect();
			const goal = still ? 1 : Math.min(1, Math.max(0, -box.top / Math.max(1, box.height - innerHeight)));
			const dt = last ? Math.min(100, time - last) : 16;
			last = time;
			now += (goal - now) * (still ? 1 : 1 - Math.exp(-dt / 90));

			const opening = ease(now, 0.06, 0.34);
			const toPhone = ease(now, 0.42, 0.6);
			const toLaptop = ease(now, 0.7, 0.92);
			// the moment it lies fully open and flat, one seamless screen takes over from the two halves
			const opened = opening >= 0.999;

			// the words lift away as the phone takes shape, and the devices grow into the space they leave
			const gone = ease(now, 0.22, 0.4);
			words.style.opacity = `${1 - gone}`;
			words.style.translate = `0 ${-gone * 24}px`;
			const top = 64 + (1 - gone) * (words.offsetHeight + 8);
			const bottom = note.offsetHeight + 20;
			stage.style.top = `${top}px`;
			stage.style.bottom = `${bottom}px`;
			const room = Math.min(innerWidth * 0.94, 1500);
			const tall = Math.min(innerHeight * (innerWidth < 600 ? 0.66 : 0.84), innerHeight - top - bottom - 12);
			// the foldable is smaller than a phone, as in life
			const foldH = Math.min(tall * 0.8, (room / OPEN.w) * OPEN.h);
			const foldW = (foldH * SHUT.w) / SHUT.h;
			// a large phone stands about 163 mm tall against the foldable's 120.6 mm
			const phoneH = Math.min(tall, foldH * 1.35);
			const phoneW = (phoneH * PHONE.w) / PHONE.h;
			const laptopW = Math.min(room, (tall * LAPTOP.w) / LAPTOP.h);
			const laptopH = (laptopW * LAPTOP.h) / LAPTOP.w;

			// bezels and corners at real proportions: about 2 to 3 percent of each device's width
			const foldBezel = Math.max(1.5, foldW * 0.011);
			const phoneBezel = Math.max(2, phoneW * 0.022);

			// the shut phone sits centred; as the cover swings left, the pair slides so the open one is centred
			fold.style.visibility = opened ? 'hidden' : 'visible';
			fold.style.width = `${foldW}px`;
			fold.style.height = `${foldH}px`;
			fold.style.translate = `${(foldW / 2) * opening}px 0`;
			cover.style.transform = `rotateY(${180 * (1 - opening)}deg)`;
			// it turns a little toward you while it opens, so the metal edges show, and lies flat once open
			fold.style.transform = `rotateY(${-16 * Math.sin(opening * Math.PI)}deg) rotateX(${4 * Math.sin(opening * Math.PI)}deg)`;
			fold.style.setProperty('--thick', `${foldW * 0.055}px`);
			// shut, the body is rounded all round; open, the two screens meet square at the hinge
			fold.style.setProperty('--hinge-corner', `${foldW * 0.12 * (1 - opening)}px`);
			shade.style.opacity = `${Math.sin(opening * Math.PI)}`;
			// the open screen spans both halves inside the bezels, so the two halves join without a gap
			const openScreen = foldW * 2 - foldBezel * 2;
			fold.style.setProperty('--open-w', `${openScreen}px`);
			fold.style.setProperty('--bezel', `${foldBezel}px`);
			fold.style.setProperty('--corner', `${foldW * 0.12}px`);

			device.style.visibility = opened ? 'visible' : 'hidden';
			const w = foldW * 2 + (phoneW - foldW * 2) * toPhone + (laptopW - phoneW) * toLaptop;
			const h = foldH + (phoneH - foldH) * toPhone + (laptopH - phoneH) * toLaptop;
			device.style.width = `${w}px`;
			device.style.height = `${h}px`;
			// the phone's hardware shows while it is a phone: side buttons, the camera pill, the glass
			const hardware = toPhone * (1 - toLaptop);
			device.style.setProperty('--hardware', `${hardware}`);
			island.style.width = `${phoneW * 0.3}px`;
			island.style.height = `${phoneW * 0.085}px`;
			island.style.top = `${phoneW * 0.025}px`;
			screen.style.borderRadius = `${foldW * 0.12 + (phoneW * 0.13 - foldW * 0.12) * toPhone + (14 - phoneW * 0.13) * toLaptop}px`;
			screen.style.borderWidth = `${foldBezel + (phoneBezel - foldBezel) * toPhone - phoneBezel * toLaptop}px`;
			openShot.style.width = `${openScreen}px`;
			// each screen hands over quickly in the middle of the change, so two never blur together for long
			openShot.style.opacity = `${1 - ease(now, 0.48, 0.53)}`;
			phoneShot.style.width = `${phoneW}px`;
			phoneShot.style.opacity = `${ease(now, 0.47, 0.52) * (1 - ease(now, 0.8, 0.85))}`;
			laptopShot.style.width = `${laptopW}px`;
			laptopShot.style.opacity = `${ease(now, 0.79, 0.84)}`;

			frame = Math.abs(goal - now) > 0.0005 ? requestAnimationFrame(draw) : 0;
			if (!frame) last = 0;
		}
		const go = () => (frame ||= requestAnimationFrame(draw));
		go();
		addEventListener('scroll', go, { passive: true });
		addEventListener('resize', go, { passive: true });
		return () => {
			removeEventListener('scroll', go);
			removeEventListener('resize', go);
			cancelAnimationFrame(frame);
		};
	});
</script>

<section class="reveal" class:still bind:this={section}>
	<div class="pin">
		<div class="words" bind:this={words}>
			<h2>This is Billie after a few receipts.</h2>
			<p>Snap a receipt at the checkout or at home. Billie reads every line in about ten seconds, then your home screen shows what’s running low, recalls on what you bought, and where things cost less.</p>
		</div>
		<div class="stage" bind:this={stage}>
			<!-- the foldable: the right half stays, the cover turns on the hinge with the outer screen on its back -->
			<div class="fold" bind:this={fold} aria-hidden="true">
				<div class="half base" bind:this={base}>
					<div class="face front"><img src={OPEN.src} alt="" /></div>
					{#each SLABS as k (k)}<span class="slab" style:--k={k}></span>{/each}
				</div>
				<div class="half cover" bind:this={cover}>
					<div class="face inner"><img src={OPEN.src} alt="" /><span class="shade" bind:this={shade}></span></div>
					<div class="face outer"><img src={SHUT.src} alt="" /><span class="punch"></span></div>
					{#each SLABS as k (k)}<span class="slab" style:--k={k}></span>{/each}
				</div>
			</div>
			<div class="device" bind:this={device}>
				<span class="button power" aria-hidden="true"></span>
				<span class="button volume" aria-hidden="true"></span>
				<span class="button volume down" aria-hidden="true"></span>
				<div class="screen" bind:this={screen}>
					<img bind:this={laptopShot} src={LAPTOP.src} width={LAPTOP.w} height={LAPTOP.h} alt="Billie’s home screen on a laptop: a recall card, items running low, a healthy food to try and the month’s spending" loading="lazy" />
					<img bind:this={phoneShot} src={PHONE.src} width={PHONE.w} height={PHONE.h} alt="The same home screen on a phone" loading="lazy" />
					<img bind:this={openShot} src={OPEN.src} width={OPEN.w} height={OPEN.h} alt="The same home screen on an open foldable" loading="lazy" />
					<span class="island" bind:this={island} aria-hidden="true"></span>
					<span class="sheen" aria-hidden="true"></span>
				</div>
			</div>
		</div>
		<p class="note" bind:this={note}>Screens from a sample shopper. <a href="/demo">Open the demo</a> to try it yourself.</p>
	</div>
</section>

<style>
	/* a tall section, so there is scroll for the whole change while it stays in view */
	.reveal {
		height: 320svh;
		margin-top: clamp(4rem, 10vh, 7rem);
	}

	.reveal.still {
		height: auto;
	}

	.pin {
		position: sticky;
		top: 0;
		height: 100svh;
		text-align: center;
	}

	.still :is(.words, .stage, .note) {
		position: static;
	}

	.still .pin {
		position: static;
		display: grid;
		justify-items: center;
		gap: 1.5rem;
		height: auto;
		padding: 4.5rem var(--gutter) 1.5rem;
	}

	.words {
		position: absolute;
		top: 4.5rem;
		right: 0;
		left: 0;
		margin: 0 auto;
		max-width: 40rem;
		padding: 0 var(--gutter);
	}

	h2 {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 3.25rem);
		font-weight: 650;
		line-height: 1.05;
		letter-spacing: -0.035em;
		text-wrap: balance;
		color: var(--color-ink);
	}

	.words p {
		margin-top: 0.85rem;
		font-size: clamp(1rem, 1.25vw, 1.2rem);
		line-height: 1.5;
		color: var(--color-muted);
		text-wrap: pretty;
	}

	.stage {
		position: absolute;
		right: 0;
		left: 0;
		display: grid;
		place-items: center;
		perspective: 2800px;
	}

	.fold {
		position: relative;
		transform-style: preserve-3d;
	}

	/* each half shows its own half of the open screen; the bezel goes round the outside corners */
	.half {
		position: absolute;
		top: 0;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
	}

	.base {
		left: 0;
	}

	/* reaches a pixel under the cover's screen, so no metal shows through at the hinge */
	.front {
		left: -1px;
		border: var(--bezel, 4px) solid #1d1d1f;
		border-left-width: 0;
		border-radius: var(--hinge-corner, 14px) var(--corner, 14px) var(--corner, 14px) var(--hinge-corner, 14px);
	}

	.front img {
		position: absolute;
		top: 0;
		right: 0;
		width: var(--open-w);
		max-width: none;
	}

	.cover {
		right: 100%;
		transform-origin: right center;
		transform: rotateY(180deg);
	}

	.face {
		position: absolute;
		z-index: 1;
		inset: 0;
		overflow: hidden;
		background: #f5f5f7;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}

	.inner {
		border: var(--bezel, 4px) solid #1d1d1f;
		border-right-width: 0;
		border-radius: var(--corner, 14px) var(--hinge-corner, 14px) var(--hinge-corner, 14px) var(--corner, 14px);
	}

	.inner img {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--open-w);
		max-width: none;
	}

	/* the shut phone's front, seen once the cover is turned over the base */
	/* the shut phone's screen is on the back of the cover, a body's thickness behind the inner screen */
	/* the thin titanium frame round the outside screen, wider down the left where the hinge is */
	.outer {
		box-shadow:
			0 0 0 1.5px #cfc9be,
			-3px 0 0 1.5px #bdb7ac,
			-4px 0 0 1.5px #a59f94;
		transform: rotateY(180deg) translateZ(var(--thick, 6px));
		border: var(--bezel, 4px) solid #1d1d1f;
		border-radius: var(--corner, 14px);
	}

	.outer img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top;
	}

	/* the screen bends at the hinge as it opens: light on the curve, a soft shadow into the fold */
	.shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent 55%, rgb(255 255 255 / 0.25) 80%, rgb(0 0 0 / 0.18));
		opacity: 0;
	}

	/* after the opening, one device that changes shape: open foldable, then phone, then laptop */
	.fold,
	.device {
		grid-area: 1 / 1;
	}

	.device {
		position: relative;
		visibility: hidden;
		--hardware: 0;
	}

	.screen {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border: 4px solid #1d1d1f;
		background: #f5f5f7;
		/* a thin metal band round the glass, then the shadow it casts */
		box-shadow:
			0 0 0 1.5px #c9c3b8,
			0 0 0 2.5px #9c968c,
			0 40px 80px -36px rgb(0 0 0 / 0.45);
	}

	.button {
		position: absolute;
		width: 3px;
		border-radius: 2px;
		background: linear-gradient(90deg, #5a5a5e, #9a9aa0);
		opacity: var(--hardware);
	}

	.power {
		top: 26%;
		right: -5px;
		height: 13%;
	}

	.volume {
		top: 22%;
		left: -5px;
		height: 7%;
	}

	.volume.down {
		top: 31%;
	}

	/* the camera pill at the top of the phone's screen */
	.island {
		position: absolute;
		left: 50%;
		z-index: 1;
		border-radius: 999px;
		background: #000;
		translate: -50% 0;
		opacity: var(--hardware);
	}

	.sheen {
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(115deg, rgb(255 255 255 / 0.22), transparent 32%);
		opacity: var(--hardware);
		pointer-events: none;
	}

	/* the outside screen's selfie camera, top right */
	.punch {
		position: absolute;
		z-index: 1;
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 35%, #2c2c34, #000 60%);
	}

	.punch {
		top: 3.8%;
		right: 5.5%;
		width: 7%;
	}


	/* the body: thin metal layers stacked behind the screen, a little apart, so from an angle they read
	   as one solid metal side with the same rounded corners */
	.slab {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, #5c5c61, #c9c9ce 40%, #ededf2 52%, #9a9a9f 70%, #55555a);
		/* kept just inside the screens front and back, so no two surfaces share a plane and flicker */
		transform: translateZ(calc(-0.5px - var(--k) * (var(--thick, 6px) - 1px)));
	}

	.base .slab {
		border-radius: var(--hinge-corner, 14px) var(--corner, 14px) var(--corner, 14px) var(--hinge-corner, 14px);
	}

	.cover .slab {
		border-radius: var(--corner, 14px) var(--hinge-corner, 14px) var(--hinge-corner, 14px) var(--corner, 14px);
	}

	.screen img {
		position: absolute;
		top: 0;
		left: 50%;
		max-width: none;
		height: auto;
		translate: -50% 0;
	}

	.note {
		position: absolute;
		right: 0;
		bottom: 1rem;
		left: 0;
		padding: 0 var(--gutter);
		font-size: 0.9375rem;
		color: var(--color-muted);
	}

	.note a {
		color: var(--color-accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.note a:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}
</style>
