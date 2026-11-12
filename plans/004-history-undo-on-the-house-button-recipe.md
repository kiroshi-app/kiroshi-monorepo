# 004 — Put the History undo control back on the house button recipe

- **Status**: TODO
- **Commit**: fbf3195dd
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 2 files, about 8 changed lines

## Problem

The undo control of a History row is a design system `Button` that hand-types its own transition.

`packages/ui/src/components/plugin-settings/history-panel.tsx:96-97` — current:

```ts
const UNDO_CONTROL_CLASS =
	"rounded-md bg-card text-muted-foreground transition-opacity duration-150 [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 motion-reduce:transition-none in-data-companion-page:-m-1.25 in-data-companion-page:bg-transparent in-data-companion-page:[@media(hover:hover)]:opacity-100"
```

It is applied at `packages/ui/src/components/plugin-settings/history-panel.tsx:320-328` on `<Button size="icon-xs" variant="ghost">`.

`transition-opacity` replaces the `transition-all` class every `Button` carries, and the house press and fade are keyed on that class. `packages/ui/src/styles/globals.css:531-544`:

```css
.group\/button:is(.transition-all, .transition-none):active:not(
	[aria-haspopup]
) {
	translate: none;
	scale: 0.98;
}

@media (prefers-reduced-motion: no-preference) {
	.group\/button.transition-all {
		transition:
			opacity 150ms,
			scale 160ms var(--ease-out);
	}
}
```

Two consequences:

1. The undo control is the one `Button` that does not press by `scale: 0.98`. It falls back to the vendored `active:translate-y-px`, a 1px nudge no other button in the app shows.
2. Its hover reveal fades by a hand-typed `transition-opacity duration-150` that duplicates what the house rule already gives any `Button` (`opacity 150ms`). The other hover-revealed `Button`, the table copy control at `packages/ui/src/components/markdown/table.tsx:61-62`, carries no transition class and gets its fade from the house rule.

## Target

`UNDO_CONTROL_CLASS` carries no transition utility. The `Button` keeps its own `transition-all`, so the house rule supplies the same 150ms opacity reveal, the 160ms `scale: 0.98` press on the `--ease-out` token (`cubic-bezier(0.23, 1, 0.32, 1)`), and the `0.01ms` duration under `prefers-reduced-motion: reduce` (`globals.css:724-727`).

```ts
const UNDO_CONTROL_CLASS =
	"rounded-md bg-card text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 in-data-companion-page:-m-1.25 in-data-companion-page:bg-transparent in-data-companion-page:[@media(hover:hover)]:opacity-100"
```

What the reader sees: the reveal on row hover is unchanged; the press now matches every other button.

## Repo conventions to follow

- A composed `Button` that wants the house motion passes no transition class. Exemplar: `COPY_CLASS` at `packages/ui/src/components/markdown/table.tsx:61-62`.
- Never edit files under `packages/ui/src/components/ui/` or the rules in `globals.css` for this.
- Default-preference assertions in stories go through `withMotionAllowed`, guarded by `isInBrowserRunner()`, both from `@workspace/storybook/story-utils` (contract in `packages/ui/.storybook/README.md`).
- No comments in code.

## Steps

1. In `packages/ui/src/components/plugin-settings/history-panel.tsx:97`, remove ` transition-opacity duration-150` and ` motion-reduce:transition-none` from the string. The result must equal the target string above, character for character.
2. In `packages/ui/src/components/plugin-settings/history-panel.stories.tsx`, make sure `isInBrowserRunner` and `withMotionAllowed` are imported from `@workspace/storybook/story-utils` (add them to the existing import from that module, or add the import if the file has none).
3. In the same file, in the `UndoByKeyboard` story, after the last line of `play` (`await expect(getComputedStyle(undo).opacity).toBe("1")`), add:

   ```tsx
   if (!isInBrowserRunner()) return
   await withMotionAllowed(() =>
   	expect(getComputedStyle(undo).transitionProperty).toBe("opacity, scale"),
   )
   ```

4. Run `bun run lint` from the repository root. If it reports a class sorting diagnostic on the edited line, reorder the classes exactly as the diagnostic prints them. Change nothing else.

## Boundaries

- Do NOT add `transition-none` or any other transition utility to `UNDO_CONTROL_CLASS`.
- Do NOT change the opacity classes: the control must stay hidden until the row is hovered or holds focus, and stay shown on a companion page.
- Do NOT touch `globals.css`, `packages/ui/src/components/ui/button.tsx` or `packages/ui/src/foundations/motion.mdx`.
- If the new assertion fails, STOP and report the value the browser returned; do not loosen the assertion.
- If a step does not match the code you find (drift since commit `fbf3195dd`), STOP and report instead of improvising.

## Verification

- **Mechanical**, from the repository root:
  - `bun run lint` exits 0.
  - `bun run types` exits 0.
  - From `packages/ui`: `bunx vitest run --project=storybook src/components/plugin-settings/history-panel.stories.tsx` passes. If the filter matches no test, run `bun run test` from the repository root instead.
  - `bun run baseline` reports nothing new.
- **Feel check**: run `bun run storybook` and open the History panel stories.
  - Hover a row: the undo control fades in over 150ms, as before. Move away: it fades out.
  - Press and hold the undo control: it scales to 0.98 and does not move down by a pixel. Compare with any other icon button on the page: same press.
  - In Chrome DevTools, Animations panel, set playback to 10% and press again: the scale eases out over 160ms, fast at the start.
  - In the Rendering panel, emulate `prefers-reduced-motion: reduce`: the control appears and presses at once.
  - Tab to the control without a pointer: it is drawn and focused, as before.
- **Done when**: the string equals the target, the `UndoByKeyboard` story asserts `"opacity, scale"`, and the four mechanical commands pass.

Suggested commit: `fix(ui): press the History undo control like every other button`
