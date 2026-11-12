# 002 — Give each reduced motion constant one name and one home

- **Status**: TODO
- **Commit**: fbf3195dd
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 2 files, about 6 changed lines, no behaviour change

## Problem

`packages/ui/src/lib/reduced-motion.ts:1` exports the shared constant that fourteen components import:

```ts
export const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"
```

Two files declare a private constant under the same name.

`packages/ui/src/components/tooltip-hint.tsx:15` — an identical copy of the shared string:

```ts
const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"
```

`packages/ui/src/components/toggle-switch.tsx:6-7` — the same name for a different string:

```ts
const STILL_UNDER_REDUCED_MOTION =
	"motion-reduce:[&_[data-slot=switch-thumb]]:transition-none"
```

The second one is not redundant: the `ReducedMotion` story in `packages/ui/src/components/toggle-switch.stories.tsx` asserts the thumb reports `transition-property: none`, which only this class delivers. It keeps its value and only loses the colliding name.

## Target

`packages/ui/src/components/tooltip-hint.tsx` imports the shared constant and declares none:

```ts
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const HOVER_INTENT_DELAY_MS = 120

type TooltipHintSide = "top" | "right" | "bottom" | "left"
```

`packages/ui/src/components/toggle-switch.tsx` names its constant after what it stills:

```ts
const THUMB_STILL_UNDER_REDUCED_MOTION =
	"motion-reduce:[&_[data-slot=switch-thumb]]:transition-none"
```

and its single use at line 31 becomes:

```tsx
		className={cn(THUMB_STILL_UNDER_REDUCED_MOTION, className)}
```

## Repo conventions to follow

- Direct imports, never barrels. Exemplar of the shared import: `packages/ui/src/components/app-rail.tsx:45`.
- Imports are sorted; `@workspace/ui/lib/reduced-motion` sits before `@workspace/ui/lib/utils`.
- Constants are SCREAMING_SNAKE. No comments in code.

## Steps

1. In `packages/ui/src/components/tooltip-hint.tsx`, delete line 15 (`const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"`) and the blank line that follows it, so one blank line remains between `HOVER_INTENT_DELAY_MS` and `type TooltipHintSide`.
2. In the same file, add `import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"` between the `@workspace/ui/components/ui/tooltip` import and the `@workspace/ui/lib/utils` import. Leave line 30 (`className={cn("break-words", STILL_UNDER_REDUCED_MOTION)}`) as it is.
3. In `packages/ui/src/components/toggle-switch.tsx`, rename `STILL_UNDER_REDUCED_MOTION` to `THUMB_STILL_UNDER_REDUCED_MOTION` at its declaration (line 6) and at its use (line 31). The string value does not change.

## Boundaries

- Do NOT change the value of any constant.
- Do NOT touch `packages/ui/src/lib/reduced-motion.ts`, `packages/ui/src/styles/globals.css` or anything under `packages/ui/src/components/ui/`.
- Do NOT touch the stories: nothing they assert changes.
- If a step does not match the code you find (drift since commit `fbf3195dd`), STOP and report instead of improvising.

## Verification

- **Mechanical**, from the repository root:
  - `git grep -n "const STILL_UNDER_REDUCED_MOTION" -- packages/ui/src` prints exactly one line, in `packages/ui/src/lib/reduced-motion.ts`.
  - `bun run lint` exits 0.
  - `bun run types` exits 0.
  - From `packages/ui`: `bunx vitest run --project=storybook src/components/toggle-switch.stories.tsx src/components/tooltip-hint.stories.tsx` passes. If the filter matches no test, run `bun run test` from the repository root instead.
- **Feel check**: none needed, the rendered classes are byte for byte the same. Confirm it once: in Storybook, inspect a tooltip bubble and a toggle switch root and check their `class` attributes still contain `motion-reduce:animate-none!` and `motion-reduce:[&_[data-slot=switch-thumb]]:transition-none` respectively.
- **Done when**: the grep prints one line and the three commands pass.

Suggested commit: `refactor(ui): give each reduced motion constant one name`
