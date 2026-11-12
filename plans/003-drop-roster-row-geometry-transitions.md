# 003 — Drop the geometry transitions the roster rows never run in the app

- **Status**: TODO
- **Commit**: fbf3195dd
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 2 files, about 6 changed lines
- **Run after**: plan 001 (both edit the same string and the same story)

## Problem

The roster rows of the left sidebar list `width`, `height` and `padding` in their transition. These are layout properties, and on these rows their computed values only change under `group-data-[collapsible=icon]`, a state set by the vendored `<Sidebar collapsible="icon">` (`packages/ui/src/components/ui/sidebar.tsx:212`).

`packages/ui/src/components/sidebar-list-row.tsx:18-28` — current:

```ts
const ROSTER_ROW =
	"flex-nowrap border-0 text-foreground transition-[width,height,padding,scale] duration-160 ease-out hover:will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pe-0"

const ROW: Record<SidebarListRowGeometry, string> = {
	roster: cn(ROSTER_ROW, "py-1.5 pl-1.5 pe-1.5"),
	agent: cn(ROSTER_ROW, SIDEBAR_ROW_INSET),
	conversation: cn(
		SIDEBAR_ROW_INSET,
		"flex-nowrap border-0 text-foreground transition-[width,height,padding] hover:bg-transparent active:bg-transparent data-active:bg-transparent after:absolute after:inset-0 focus-visible:ring-sidebar-ring *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:p-0",
	),
```

The app does not render that state. Its sidebar is `NavigationSidebar` (`packages/ui/src/components/navigation-sidebar.tsx`), which swaps `ExpandedSidebar` for `CollapsedSidebar` outright and has no `<Sidebar>` ancestor. The only non-story, non-test `<Sidebar collapsible="icon">` is in `packages/ui/src/components/app-sidebar-panel.tsx:178`, reached only through `AppSidebar`, which the app imports for its types only. Commit `78903d66e` already made the app's fold snap and dropped two other transitions that never ran.

So in the app these three properties never transition, and the rows the user presses most carry a layout transition list for nothing. In the stories that do mount `<Sidebar collapsible="icon">`, the row geometry will now change at once when the sidebar collapses, which matches the snap the app has.

One story asserts the current list on purpose and must move with it. `packages/ui/src/components/sidebar-list-row.stories.tsx`, `Pressed` story (starts at line 640), lines 669-673:

```tsx
		await waitFor(() =>
			expect(getComputedStyle(row).transitionProperty).toBe(
				"width, height, padding, scale",
			),
		)
```

## Target

`ROSTER_ROW` transitions `scale` only. The `conversation` row, which has no press scale, transitions nothing.

- In `ROSTER_ROW`: `transition-[width,height,padding,scale]` becomes `transition-[scale]`. Everything else in the string stays, including `duration-160 ease-out` and, if plan 001 ran, `motion-reduce:duration-[0.01ms]`.
- In the `conversation` string: `transition-[width,height,padding]` becomes `transition-none`. It must be `transition-none` and not a plain removal: the row is built on the vendored `SidebarMenuButton`, whose own classes carry `transition-[width,height,padding] duration-200`, and only an explicit transition utility makes `cn` drop that.
- In the `Pressed` story: the asserted value becomes `"scale"`.

## Repo conventions to follow

- `transition-none` is the house way to still a control built on a vendored primitive; it appears on dozens of components. Exemplar: `packages/ui/src/components/space-switcher.tsx:59`.
- Never edit files under `packages/ui/src/components/ui/`. The vendored `SidebarMenuButton` keeps its classes; the composed row overrides them through `cn`.
- No comments in code.

## Steps

1. Precondition, from the repository root. Run:

   ```bash
   git grep -nE "<Sidebar( |$|>)" -- packages/ui/src apps/app/src ':!*.stories.tsx' ':!*.test.tsx'
   ```

   Expected: exactly two hits, `packages/ui/src/components/app-sidebar-panel.tsx:178` and `packages/ui/src/components/routines-panel.tsx:552`. Then run:

   ```bash
   git grep -nE "<AppSidebar([ >/]|$)" -- packages/ui/src apps/app/src ':!*.stories.tsx' ':!*.test.tsx'
   ```

   Expected: no output. If either result differs, the app may render the collapsible state after all: STOP and report the output.
2. In `packages/ui/src/components/sidebar-list-row.tsx`, inside `ROSTER_ROW` (line 19), replace `transition-[width,height,padding,scale]` with `transition-[scale]`.
3. In the same file, inside the `conversation` string (line 26), replace `transition-[width,height,padding]` with `transition-none`.
4. In `packages/ui/src/components/sidebar-list-row.stories.tsx`, `Pressed` story, replace the string `"width, height, padding, scale",` with `"scale",`.
5. In the same story's `docs.description.story` string, replace `transitions only its geometry and that scale` with `transitions only that scale`.
6. Run `bun run lint` from the repository root. If it reports a class sorting diagnostic on an edited line, reorder the classes exactly as the diagnostic prints them. Change nothing else.

## Boundaries

- Do NOT touch `packages/ui/src/components/ui/sidebar.tsx` or any other file under `packages/ui/src/components/ui/`.
- Do NOT delete `AppSidebar`, `AppSidebarPanel` or their stories, even though the app does not render them.
- Do NOT change `duration-160`, `ease-out`, `active:scale-[0.98]` or any `group-data-[collapsible=icon]:` class.
- If another story fails because it asserted the old transition list, STOP and report its name and message; do not edit it.
- If a step does not match the code you find (drift since commit `fbf3195dd`), STOP and report instead of improvising.

## Verification

- **Mechanical**, from the repository root:
  - `git grep -n "width,height,padding" -- packages/ui/src/components/sidebar-list-row.tsx` prints nothing.
  - `bun run lint` exits 0.
  - `bun run types` exits 0.
  - From `packages/ui`: `bunx vitest run --project=storybook src/components/sidebar-list-row.stories.tsx src/components/app-sidebar-conversation-row.stories.tsx src/components/app-sidebar-roster.stories.tsx src/components/expanded-sidebar.stories.tsx` passes. If the filter matches no test, run `bun run test` from the repository root instead.
  - `bun run baseline` reports nothing new.
- **Feel check**: run `bun run dev`.
  - Press and hold an agent row and a conversation row in the left sidebar: the agent row still eases to 0.98 and back; the conversation row does not scale, as before.
  - Fold the sidebar with the toggle and with Cmd+B, then drag the sidebar resize handle: rows follow at once in both cases, exactly as before this change.
  - In DevTools, select an agent row and read its computed `transition-property`: `scale`.
- **Done when**: the grep prints nothing, the `Pressed` story asserts `"scale"`, and the four mechanical commands pass.

Suggested commit: `refactor(ui): drop the roster row geometry transitions that never ran`
