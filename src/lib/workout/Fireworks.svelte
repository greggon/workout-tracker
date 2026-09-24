<script lang="ts">
	/**
	 * A few fireworks for a finished workout: rockets rise from the bottom of the
	 * screen and burst into gym emoji, which arc, fall and fade. Plays once when
	 * mounted, then removes itself.
	 *
	 * Every rocket and particle is rendered once, up front and invisible; the
	 * requestAnimationFrame loop only moves them by transform and opacity. No
	 * reactive state changes per frame — re-rendering sixty-odd nodes through
	 * Svelte sixty times a second is work the animation does not need.
	 *
	 * Decorative only — hidden from assistive tech, never takes a pointer, and
	 * skipped entirely for anyone who has asked for reduced motion.
	 */
	const EMOJI = ['💪', '🏋️', '🔥', '🏆', '⚡', '🥇', '💯', '🎉', '🦾', '👟'];

	/** When each rocket leaves, in ms from mount. */
	const LAUNCHES = [0, 380, 760, 1200];
	const RISE_MS = 650;
	const PARTICLES = 16;
	const PARTICLE_MS = 1700;
	/** Downward pull on a particle, in px per ms². */
	const GRAVITY = 0.0009;

	/** Which emoji each particle will be, picked once. */
	const sparks = Array.from(
		{ length: LAUNCHES.length * PARTICLES },
		() => EMOJI[Math.floor(Math.random() * EMOJI.length)]
	);
	const rocketEls: HTMLSpanElement[] = [];
	const sparkEls: HTMLSpanElement[] = [];

	type Particle = {
		el: HTMLSpanElement;
		x: number;
		y: number;
		vx: number;
		vy: number;
		spin: number;
		born: number;
	};

	$effect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const width = window.innerWidth;
		const height = window.innerHeight;
		const start = performance.now();
		const particles: Particle[] = [];
		const rockets: {
			el: HTMLSpanElement;
			from: number;
			x: number;
			toY: number;
			at: number;
			burst: boolean;
		}[] = [];

		LAUNCHES.forEach((at, i) => {
			rockets.push({
				el: rocketEls[i],
				// Spread across the screen rather than clumped in the middle.
				x: width * (0.18 + 0.64 * ((i * 0.37 + Math.random() * 0.3) % 1)),
				from: height + 12,
				toY: height * (0.18 + Math.random() * 0.22),
				at,
				burst: false
			});
		});

		function burst(rocket: number, x: number, y: number, now: number) {
			const offset = Math.random() * Math.PI * 2;
			for (let i = 0; i < PARTICLES; i++) {
				const angle = offset + (i / PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
				const speed = 0.18 + Math.random() * 0.16;
				particles.push({
					el: sparkEls[rocket * PARTICLES + i],
					x,
					y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed - 0.05,
					spin: (Math.random() - 0.5) * 0.4,
					born: now
				});
			}
			// A short buzz on phones that support it, in time with the burst.
			navigator.vibrate?.(18);
		}

		let frame = 0;
		let last = start;

		function step(now: number) {
			const dt = Math.min(now - last, 40);
			last = now;
			const t = now - start;

			rockets.forEach((r, ri) => {
				if (r.burst) return;
				const p = (t - r.at) / RISE_MS;
				if (p < 0) return;
				if (p >= 1) {
					r.burst = true;
					r.el.style.opacity = '0';
					burst(ri, r.x, r.toY, now);
					return;
				}
				// Eases out, so it slows as it reaches the top like a real one.
				const eased = 1 - (1 - p) ** 3;
				const y = r.from + (r.toY - r.from) * eased;
				r.el.style.transform = `translate(${r.x}px, ${y}px)`;
				r.el.style.opacity = '1';
			});

			for (let i = particles.length - 1; i >= 0; i--) {
				const s = particles[i];
				const age = (now - s.born) / PARTICLE_MS;
				if (age >= 1) {
					s.el.style.opacity = '0';
					particles.splice(i, 1);
					continue;
				}
				s.vy += GRAVITY * dt;
				s.vx *= 0.985;
				s.x += s.vx * dt;
				s.y += s.vy * dt;
				// Pops in, then holds, then shrinks as it fades.
				const scale = age < 0.12 ? 0.4 + (age / 0.12) * 0.8 : 1.2 - age * 0.5;
				s.el.style.transform =
					`translate(${s.x}px, ${s.y}px) translate(-50%, -50%) ` +
					`rotate(${(now - s.born) * s.spin}deg) scale(${scale})`;
				s.el.style.opacity = String(age < 0.6 ? 1 : 1 - (age - 0.6) / 0.4);
			}

			if (rockets.some((r) => !r.burst) || particles.length > 0) {
				frame = requestAnimationFrame(step);
			}
		}

		frame = requestAnimationFrame(step);

		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="fireworks" aria-hidden="true">
	{#each LAUNCHES as at, i (at)}
		<span class="rocket" bind:this={rocketEls[i]}></span>
	{/each}
	{#each sparks as emoji, i (i)}
		<span class="spark" bind:this={sparkEls[i]}>{emoji}</span>
	{/each}
</div>

<style>
	.fireworks {
		position: fixed;
		inset: 0;
		z-index: 60;
		overflow: hidden;
		pointer-events: none;
	}
	/* Invisible until the animation moves them into place. */
	.rocket {
		position: absolute;
		top: 0;
		left: 0;
		width: 6px;
		height: 14px;
		margin-left: -3px;
		border-radius: var(--radius-pill);
		opacity: 0;
		background: var(--md-primary);
		box-shadow:
			0 0 8px 2px color-mix(in srgb, var(--md-primary) 60%, transparent),
			0 12px 14px -2px color-mix(in srgb, var(--md-primary) 35%, transparent);
	}
	.spark {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
		font-size: 28px;
		line-height: 1;
		will-change: transform, opacity;
	}
</style>
