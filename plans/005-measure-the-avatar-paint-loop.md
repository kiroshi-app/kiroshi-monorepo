# 005 — Measure the agent avatar paint loop, and lighten it only if the numbers say so

- **Status**: TODO
- **Commit**: fbf3195dd
- **Severity**: LOW (unconfirmed: this plan starts by measuring)
- **Category**: Performance
- **Estimated scope**: measurement first; at most 2 files and about 15 changed lines if a fix is warranted

## Problem

Every agent avatar whose state is not `idle` repaints its canvas on every display frame, on the main thread, for as long as the agent works. That is exactly when a transcript streams and the main thread is busiest. Whether this costs frames cannot be read from the code; it has to be measured.

The shared loop, `packages/ui/src/components/field-frame.tsx:26-43` — current:

```ts
const painters = new Set<Paint>()
let frame = 0

const tick = (now: number) => {
	for (const paint of painters) paint(now)
	frame = painters.size > 0 ? requestAnimationFrame(tick) : 0
}

const subscribe = (paint: Paint) => {
	painters.add(paint)
	if (frame === 0) frame = requestAnimationFrame(tick)
	return () => {
		painters.delete(paint)
		if (painters.size > 0) return
		cancelAnimationFrame(frame)
		frame = 0
	}
}
```

What one avatar does per frame, `packages/ui/src/components/dithered-field-avatar.tsx:120-141` — current:

```tsx
	useFieldClock({
		state: drawnState,
		paint: (time) => {
			const element = canvas.current
			const context = element?.getContext("2d")
			if (!element || !context) return
			const side = Math.round(size * (window.devicePixelRatio || 1))
			if (element.width !== side) {
				element.width = side
				element.height = side
			}
			paintScreen(
				context,
				getComputedStyle(element).color,
				field.grid.shape,
				fieldCells(field.grid),
				fieldTones(field, drawnState, time),
				side,
			)
		},
	})
```

Per frame and per avatar this reads a computed style, allocates the cell array again (`fieldCells` is a pure function of `field.grid`), computes a density and a dithered tone for every cell of a 16-column honeycomb, and retraces every lit hexagon. The motion it draws has periods of 1000ms to 3000ms on a three-tone grid, so a display-rate repaint may be more than the eye can use.

The loop already stops for `idle` avatars and under `prefers-reduced-motion: reduce` (`field-frame.tsx:76-89`). Those parts are right and stay.

## Target

A recorded measurement, then one of two outcomes.

- **Under the threshold**: no code change. The plan closes as "measured, no change".
- **At or over the threshold**: apply fix A, measure again; if still over, apply fix B, measure again.

Threshold (chosen by the plan author, adjust if the product owner disagrees): painting for eight working agents must stay under 5% of main thread time. With `T` the total time of `tick` in a recording of `D` milliseconds showing `A` animated avatars, the projected share is `(T / D) × (8 / A)`. Fix when it is 0.05 or more.

**Fix A** — compute the cells once per render, not once per frame. `packages/ui/src/components/dithered-field-avatar.tsx`, inside `DitheredField`:

```tsx
	const canvas = useRef<HTMLCanvasElement>(null)
	const prefersReducedMotion = usePrefersReducedMotion()
	const drawnState = prefersReducedMotion ? "idle" : state
	const cells = fieldCells(field.grid)
	useColorScheme(canvas)
```

and in the `paintScreen` call, the fourth argument `fieldCells(field.grid)` becomes `cells`.

**Fix B** — paint at most every 30ms (every second frame at 60Hz, every fourth at 120Hz). `packages/ui/src/components/field-frame.tsx`:

```ts
const PAINT_INTERVAL_MS = 30

const painters = new Set<Paint>()
let frame = 0
let paintedAt = 0

const tick = (now: number) => {
	if (now - paintedAt >= PAINT_INTERVAL_MS) {
		paintedAt = now
		for (const paint of painters) paint(now)
	}
	frame = painters.size > 0 ? requestAnimationFrame(tick) : 0
}

const subscribe = (paint: Paint) => {
	painters.add(paint)
	paintedAt = 0
	if (frame === 0) frame = requestAnimationFrame(tick)
	return () => {
		painters.delete(paint)
		if (painters.size > 0) return
		cancelAnimationFrame(frame)
		frame = 0
	}
}
```

`paintedAt = 0` in `subscribe` makes the next frame paint, so an avatar that starts working never waits 30ms for its first drawing.

## Repo conventions to follow

- Arrow functions only, no `function` keyword. Constants in SCREAMING_SNAKE. No comments in code. Tabs for indentation.
- `packages/ui/src/components/companion-avatar.ts` and `companion-field.ts` stay free of React, `window`, `document` and `getComputedStyle` (asserted by `packages/ui/src/components/companion-avatar.test.ts:65`). Neither fix touches them.
- The only consumer of `useFieldClock` and `subscribe` is `dithered-field-avatar.tsx`.

## Steps

1. Turn the OS "Reduce motion" setting off; the loop does not run with it on.
2. From the repository root run `bun run storybook`. In Chrome, open `http://localhost:6006/iframe.html?id=branding-ditheredfieldavatar--every-state&viewMode=story`. If that address shows no story, open Storybook at `http://localhost:6006`, go to Branding, DitheredFieldAvatar, Every State, and use "Open canvas in new tab".
3. In the DevTools console run `document.querySelectorAll('[data-slot="companion-field"]:not([data-state="idle"])').length` and note the result as `A`.
4. In the DevTools Performance panel, with no CPU throttling, record for 5 seconds without touching the page. Note the recording length in milliseconds as `D`.
5. In the Bottom-Up tab, type `tick` in the filter and note its Total Time in milliseconds as `T`. Also note the three largest children of `tick` and their times.
6. Compute `(T / D) × (8 / A)`. Append a section `## Measurement log` to this file with the date, `A`, `D`, `T`, the three largest children and the computed share.
7. If the share is under 0.05: set **Status** to `DONE — measured, no change` and stop. Change no source file.
8. Otherwise apply fix A exactly as written in Target. Repeat steps 4 to 6 and log the new numbers. If the share is now under 0.05, go to step 10.
9. Apply fix B exactly as written in Target. Repeat steps 4 to 6 and log the new numbers.
10. Run the Verification section. Set **Status** to `DONE` with one line naming which fixes were applied.

## Boundaries

- Do NOT cache the ink colour read by `getComputedStyle(element).color`. The ink follows the theme and the Space hue, which can change without anything this component observes; a cached value would go stale. If step 5 shows `getComputedStyle` or "Recalculate Style" as the largest child of `tick`, write that in the measurement log and STOP after fix A; that case needs a design decision, not this plan.
- Do NOT change `companion-avatar.ts`, `companion-field.ts`, `field-grid.ts`, the state periods or the drawing itself.
- Do NOT change the `idle` and reduced motion behaviour of `useFieldClock`.
- Do NOT replace the canvas with CSS, WebGL or a worker.
- Do NOT add dependencies.
- If a step does not match the code you find (drift since commit `fbf3195dd`), STOP and report instead of improvising.

## Verification

Only when a fix was applied.

- **Mechanical**, from the repository root:
  - `bun run lint` exits 0.
  - `bun run types` exits 0.
  - From `packages/ui`: `bunx vitest run src/components/companion-avatar.test.ts src/components/companion-field.test.ts` passes, and `bunx vitest run --project=storybook src/components/dithered-field-avatar.stories.tsx src/components/companion-avatar.stories.tsx` passes. If a filter matches no test, run `bun run test` from the repository root instead.
  - `bun run baseline` reports nothing new.
- **Feel check**: on the `Every State` story, with the fix applied and then with it reverted in a second tab, side by side:
  - Each of `thinking`, `searching`, `working`, `writing` and `waiting` reads as the same motion in both tabs at normal speed. Watch `working` longest: its 1000ms period is the fastest and the first to look stepped.
  - If fix B makes any state look stepped, revert fix B only, log that in the measurement log and stop.
  - Switch an avatar from `idle` to `working` through the story controls: its first working frame appears at once, with no blank canvas.
  - In the Rendering panel, emulate `prefers-reduced-motion: reduce`: every avatar holds one still frame, as before.
  - Run `bun run dev`, start two or more agents working, and scroll a streaming transcript: scrolling stays smooth and the sidebar avatars keep moving.
- **Done when**: the measurement log holds the numbers for every recording made, the status line says which outcome applied, and, if code changed, the mechanical commands pass.

Suggested commit, only if code changed: `perf(ui): lighten the agent avatar paint loop`
