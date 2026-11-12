# 001 — Land the roster row and bubble press at once under reduced motion

- **Status**: TODO
- **Commit**: fbf3195dd
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 3 files, about 10 changed lines

## Problem

Every design system `Button` shortens its press to `0.01ms` under `prefers-reduced-motion: reduce`. The rule lives in `packages/ui/src/styles/globals.css:717-728`:

```css
@media (prefers-reduced-motion: reduce) {
	[class*="animate-in"],
	[class*="animate-out"] {
		animation-duration: 0.01ms;
		transition-duration: 0.01ms;
	}

	.group\/button,
	[data-slot="switch-thumb"] {
		transition-duration: 0.01ms;
	}
}
```

Two pressables copy the button press (`scale: 0.98` over 160ms) but are not a `.group/button`, so the rule above does not reach them and their press still takes the full 160ms for a reader who asked for reduced motion.

`packages/ui/src/components/message-bubble.tsx:102-103` — current (also consumed by `packages/ui/src/components/mission-card.tsx:145`):

```ts
export const MESSAGE_BUBBLE_INTERACTIVE =
	"cursor-pointer text-left outline-none transition-[scale] duration-160 ease-out hover:brightness-[0.98] hover:will-change-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
```

`packages/ui/src/components/sidebar-list-row.tsx:18-19` — current:

```ts
const ROSTER_ROW =
	"flex-nowrap border-0 text-foreground transition-[width,height,padding,scale] duration-160 ease-out hover:will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pe-0"
```

`packages/ui/src/foundations/motion.mdx` states the contract: everything the global rule does not cover is the component's job, paired with its own `motion-reduce:` counterpart.

## Target

Both strings gain the single utility `motion-reduce:duration-[0.01ms]`. The scale stays (the press still reports), only its travel time goes, exactly as on a `Button`.

`packages/ui/src/components/message-bubble.tsx` — target:

```ts
export const MESSAGE_BUBBLE_INTERACTIVE =
	"cursor-pointer text-left outline-none transition-[scale] duration-160 ease-out hover:brightness-[0.98] hover:will-change-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:duration-[0.01ms]"
```

`packages/ui/src/components/sidebar-list-row.tsx` — target (if plan 003 already ran, the string reads `transition-[scale]` instead of `transition-[width,height,padding,scale]`; leave that part as you find it):

```ts
const ROSTER_ROW =
	"flex-nowrap border-0 text-foreground transition-[width,height,padding,scale] duration-160 ease-out hover:will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] motion-reduce:duration-[0.01ms] aria-expanded:bg-sidebar-accent/70 *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pe-0"
```

## Repo conventions to follow

- The `0.01ms` value is the house value for "still under reduced motion while `transitionend` still fires". Exemplar: `packages/ui/src/components/dialog-surface.tsx:11` (`motion-reduce:duration-[0.01ms]!`). No `!` is needed here: nothing unlayered overrides the duration of these two elements.
- No comments in code. Tabs for indentation. Do not add a `function` keyword anywhere.
- The `storybook` vitest project emulates `prefers-reduced-motion: reduce` for every story. A default-preference assertion goes through `withMotionAllowed` from `@workspace/storybook/story-utils`, guarded by `isInBrowserRunner()`. Contract: `packages/ui/.storybook/README.md`, section "Stories under the default motion preference".

## Steps

1. Edit `packages/ui/src/components/message-bubble.tsx:103`: append ` motion-reduce:duration-[0.01ms]` inside the string, after `active:scale-[0.98]`.
2. Edit `packages/ui/src/components/sidebar-list-row.tsx:19`: insert ` motion-reduce:duration-[0.01ms]` right after `active:scale-[0.98]`.
3. Edit `packages/ui/src/components/sidebar-list-row.stories.tsx`:
   - In the import from `@workspace/storybook/story-utils` (lines 5-8), add `withMotionAllowed` to the imported names, keeping them alphabetical.
   - In the `Pressed` story (starts at line 640), find the line `if (!isInBrowserRunner()) return` inside `play`. Directly below it, add:

     ```tsx
     await expect(
     	Number.parseFloat(getComputedStyle(row).transitionDuration),
     ).toBeLessThan(0.001)
     await withMotionAllowed(() =>
     	expect(getComputedStyle(row).transitionDuration).toBe("0.16s"),
     )
     ```

   - In the same story's `docs.description.story` string, append this sentence at the end: ` Under reduced motion the row keeps the scale and loses its travel time, as the Button does.`
4. Run `bun run lint` from the repository root. If it reports a class sorting diagnostic on an edited line, reorder the classes exactly as the diagnostic prints them. Change nothing else.

## Boundaries

- Do NOT touch `packages/ui/src/styles/globals.css` or anything under `packages/ui/src/components/ui/`.
- Do NOT change `transition-[width,height,padding,scale]` in this plan; plan 003 owns that.
- Do NOT add a story to `message-bubble.stories.tsx` or `mission-card.stories.tsx`.
- Do NOT add dependencies. Do NOT change markup.
- If a step does not match the code you find (drift since commit `fbf3195dd`), STOP and report instead of improvising.

## Verification

- **Mechanical**, from the repository root:
  - `bun run lint` exits 0.
  - `bun run types` exits 0.
  - From `packages/ui`: `bunx vitest run --project=storybook src/components/sidebar-list-row.stories.tsx` passes. If the filter matches no test, run `bun run test` from the repository root instead.
  - `bun run baseline` reports nothing new.
- **Feel check**: run `bun run storybook`, open `Pressed` under the sidebar list row stories.
  - With the OS preference off, hold the row: it eases down to 0.98 and back, same as the `Button` beside it.
  - In Chrome DevTools, Rendering panel, set "Emulate CSS media feature prefers-reduced-motion" to `reduce`. Hold the row again: it is at 0.98 on the first frame, with no travel, and returns at once on release.
  - Repeat on an interactive message bubble (a mission card in a thread): same two behaviours.
- **Done when**: both strings carry `motion-reduce:duration-[0.01ms]`, the `Pressed` story asserts both durations, and the four mechanical commands pass.

Suggested commit: `fix(ui): land the roster row and bubble press at once under reduced motion`
