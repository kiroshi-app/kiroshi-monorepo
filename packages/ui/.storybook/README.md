# Kiroshi story contract

Authoring rules for every story in this repo, human or agent written. A story that breaks a rule below is not done.

Reference story: `packages/ui/src/components/button.stories.tsx`. When in doubt, copy its shape.

## 1. Taxonomy

Stories are discovered from `packages/ui/src/**` (`*.stories.tsx` and `*.mdx`).

Every story file is authored with the CSF factories exported by `@workspace/storybook/preview` — `preview.meta({...})` at the top, `meta.story({...})` per export. No default export, no `Meta` / `StoryObj` types.

`@workspace/storybook/*` is the **single canonical form** for anything under `.storybook`.

**A story must import its own component by package subpath, never relatively.** Write `import { Button } from "@workspace/ui/components/button"`, not `from "./button"` — even though the story sits right next to it.

This is the one place the contract overrides normal colocation instinct, and it is not cosmetic. `@storybook/addon-mcp` copies the story's own import specifier into `manifests/components.json`, which is what an agent pastes into real code. A relative specifier cannot survive that copy: the addon rewrites it to the bare package root, emitting `import { Button } from "@workspace/ui"` — an import that does not resolve, because `@workspace/ui` has no root entry point. The subpath form is passed through untouched and resolves from anywhere in the monorepo. The per-component cost is exactly one longer import line; there is no annotation to add and nothing to keep in sync.

```tsx
import preview from "@workspace/storybook/preview"

const meta = preview.meta({
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Button", onClick: fn() },
})
```

One title shape, enforced by `storySort` in `preview.tsx`: `<Family>/<Component>` — two levels, three only under `Conversation` and `Settings`, which carry a sub-level. `<Family>` comes from the `SECTIONS` array in `preview.tsx` and its sub-level from `SUB_LEVELS` — those arrays are the list and its sidebar order, the table below says what each entry takes. The family reflects what the component **is**, not the folder it sits in. Full rationale: **Foundations → Introduction** (`src/foundations/introduction.mdx`).

| Family | Sub-levels | What lands there |
| --- | --- | --- |
| `Foundations` | pages | The raw material — tokens, palette, type scale, motion, icons. Not components. |
| `Primitives` | — | Single-purpose building blocks with a variant API: `Button`, `Disclosure`. |
| `Forms` | — | Domain-free controls a reader fills in, and the fields that label them. |
| `Feedback` | — | What the system reports about itself: status, progress, notice, error. |
| `Navigation` | — | Sidebars, rails, tabs and header controls that move a reader between places. |
| `Layout` | — | Shells and regions that hand room to their slots and draw nothing themselves. |
| `Overlays` | — | Surfaces drawn above the page: `Dialog`, `Popover`, `Tooltip`. |
| `Branding` | — | The product's identity marks: `BotAvatar`, `BotIdentityAvatar`. |
| `Conversation` | `Message`, `Prompt`, `Markdown`, `Tools` | **The conversation with an agent** — the transcript, its turns, its composer, the payloads it renders, the approvals that interrupt it. |
| `Settings` | `Bot`, `User`, `Space`, `Conversation`, `Plugins` | The dialogs that configure one subject, and the panels each holds. |

`Conversation` is the family authors over-reach for. Ask what the component would be in a product with no agent in it: `ProgressRing` still reports work, `AppSidebar` still moves between places, `Disclosure` still opens and closes. Only a component with no answer to that stays in `Conversation`.

A settings panel goes under the subject it configures, never under `Forms`. `Forms` keeps only the controls that know nothing about a bot, a user or a space.

Every family opens on an `Overview` MDX page — `src/families/<family>.mdx`, or `src/foundations/introduction.mdx` for `Foundations` — sorted first under its family. A new component is not documented until its name appears there.

An unknown root **throws** at sort time, so a typo fails the sidebar rather than the review.

### Stories the catalogue does not list

The visible catalogue lists only the states the app renders. A story that proves behaviour on a composition the app never assembles carries the `test-only` tag on its meta:

```tsx
const meta = preview.meta({ tags: ["test-only"] })
```

`main.ts` declares `test-only` with `defaultFilterSelection: "exclude"`, so the sidebar hides the story until a reader turns the `test-only` filter on. The story keeps the default `test` tag, so the `storybook` vitest project still plays it. Use it instead of `!dev`, which hides a story with no way back.

Spell the tag as a literal: the CSF indexer reads `tags` statically and rejects anything else.

### Stories under the default motion preference

The `storybook` vitest project emulates `prefers-reduced-motion: reduce` for every story. A story that proves the default case switches the browser to `no-preference` inside its play, through the Chrome DevTools Protocol, and back to `reduce` in a `finally` block, so a failed assertion never leaks the preference into the next story. The play returns early outside the browser runner, so the Storybook UI keeps the reader's own preference:

```tsx
const emulateMotion = async (value: "no-preference" | "reduce") => {
	const { cdp } = await import("vitest/browser")
	await cdp().send("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value }],
	})
}

if (!isInBrowserRunner()) return
await emulateMotion("no-preference")
try {
	await expect(getComputedStyle(control).transitionProperty).toBe("none")
} finally {
	await emulateMotion("reduce")
}
```

## 2. Story names

One shared vocabulary of exported names. Reuse an existing name before inventing one.

**Structural names** — exhaustive matrices, for primitives with a variant API.

| Export | Must contain |
| --- | --- |
| `Variants` | Every visual variant, exhaustively. |
| `Sizes` | Every size, exhaustively. |
| `States` | Hover, focus, active via `parameters.pseudo`, plus disabled — and loading when the component has that state. |

`Variants` and `Sizes` must be derived, not hand-listed. Use `listExhaustively` from `@workspace/storybook/story-utils` so a new variant added to the component is a **type error** in the story:

```tsx
const BUTTON_VARIANTS = listExhaustively<ButtonVariant>({
  default: true,
  secondary: true,
  outline: true,
})
```

Interactive states come from `storybook-addon-pseudo-states`, targeted by id:

```tsx
export const States = meta.story({
  parameters: {
    pseudo: { hover: "#button-hover", focusVisible: "#button-focus", active: "#button-active" },
  },
  render: () => (
    <Row>
      <Button id="button-hover">Hover</Button>
      <Button disabled>Disabled</Button>
    </Row>
  ),
})
```

**Scenario names** — named after the real data condition they exercise, never after the render.

| Export | The condition |
| --- | --- |
| `Default` | The nominal case the component was designed for. |
| `LongContent` | Text or lists long enough to wrap, truncate or overflow. |
| `ZeroValue` | Real data whose value is `0` / `null` — not the same as empty. |
| `SparseData` | Enough data to render, too little to be representative (gaps, one point). |
| `Loading` | The pending / skeleton surface. |
| `Empty` | No data at all. |
| `Error` | The failure surface. |
| `With*` | Composition with another component (`WithIcons`, `WithAction`). |
| `As*` | Rendered as another element (`AsLink`, `AsChildTrigger`). |
| `In*` | Placed in a realistic host layout (`InToolbar`, `InLayout`). |

`Empty`, `Loading` and `Error` only when the component genuinely has that state. Never faked.

`Playground` is **optional**: the args-driven knob story, worth adding for a tunable primitive, pointless for a component with no interesting args.

## 3. Fixtures

Fictional and deterministic. `test:storybook` runs every story in a real browser, so the same story must render identically on every run.

- No `Math.random()`, no `Date.now()`, no bare `new Date()`. A date is a fixed ISO string: `new Date("2026-03-04T09:30:00Z")`.
- No incrementing ids, no counters, no faker or any generator.
- Names, emails and phone numbers must be obviously fake: `Ada Martin`, `ada@example.com`, `+33 1 23 45 67 89`.

Fixtures live **inline** by default — in the story, or as a module-level `const` above `meta`.

Promote to a shared fixture once **2+ story files** need the same data: a colocated `<component>.fixtures.ts` next to the stories. Explicitly typed against the component's props or its domain type, `const` exports only, no barrel, no logic, no factory functions.

## 4. Descriptions that help the MCP

This Storybook runs `@storybook/addon-mcp`: agents read story text to pick the right state. A description that describes the pixels is noise; one that states **when and why** to reach for that state is the payload.

Component purpose goes on the meta.

**Scope of the rule:** every **new or genuinely reworked** scenario story MUST carry `parameters.docs.description.story`. Backfilling the stories that predate this contract is opportunistic — do it when you touch the file, never as a blocker.

The description names the condition, what to check, and when to pick this story over its neighbour.

```tsx
export const SparseData = meta.story({
  args: { data: NEWLY_ONBOARDED_WEEK },
  parameters: {
    docs: {
      description: {
        story:
          "Reach for this when an account was onboarded mid-week: three real points, two null days. Check that the line anchors to the y-axis floor instead of collapsing, and that no empty state takes over — `Empty` covers no data at all, this one covers data too thin to be representative.",
      },
    },
  },
})
```

Bad: `"A line chart with three points and two gaps."` — restates the render; an agent still cannot tell when to open it.
Good: the snippet above — the reader learns the condition it reproduces, what to verify, and why it is not `Empty`.

## 5. A11y and viewports

`parameters.a11y = { test: "error" }` is set globally in `preview.tsx`. An accessibility violation **fails** `test:storybook`.

- Never disable a rule to go green. Fix the markup. The one sanctioned exception is `A11Y_CONTRAST_AWAITING_DESIGN_DECISION` from `@workspace/storybook/story-utils`: it covers the palette contrast debt tracked by `PAIRS_AWAITING_DESIGN_DECISION` in **Foundations → Token Contrast**, marks violations for review instead of hiding them, and must be removed from a story the moment the tokens it excuses pass the audit.
- Icon-only controls need `aria-label` — see `Sizes` and `WithIcons` in `button.stories.tsx`.
- Every input needs a label, visible or `aria-label`.

Viewports available: `mobile` 390x844, `tablet` 768x1024, `laptop` 1280x800, `desktop` 1536x960. Set `parameters.viewport.defaultViewport` only for stories whose layout is genuinely viewport-dependent; the default is fine for everything else.

One toolbar global exists as a review tool, not as story config: `theme_layout` (`single` / `side-by-side`, renders light and dark at once). Check it before calling a story done.

## 6. Forbidden

This Storybook is a public build artifact — that is the whole reason for both rules below.

**No network egress, ever.** No live API, no `axios` or `fetch` reaching a real host, no remote image or font URL.

Connected views are allowed, rendered through **local deterministic doubles**, at either level:

- **module level** — the default: a decorator wrapping the story in the real provider, callbacks stubbed with `fn()` from `storybook/test`, in-memory fixture data from section 3;
- **request level** — allowed when a dedicated ticket justifies intercepting the HTTP layer rather than the module.

MSW is not installed today. Adding a request-mock layer is a dependency decision — it needs its own ticket and approval (house rule: no new deps without approval), not an inline call by a story author.

Determinism is absolute: whatever the double, the story renders identically on every run.

**Zero real user data.** No real names, emails, phone numbers or account identities — including anonymised production exports. Invent everything.

## 7. Validation

Run from `packages/ui`.

```bash
bun run storybook         # local dev, not part of the gate
bun run lint
bun run test:storybook
bun run build-storybook
```

A story is done only when `lint`, `test:storybook` and `build-storybook` all pass.

### The invocation that reports a green it never ran

On bun 1.3.13 `bun --cwd packages/ui run test:storybook` runs nothing: the flag in
front of `run` makes bun print this package's script list and exit `0`, so the gate
looks green without a single story having rendered. `bun --filter '@workspace/ui'
run test:storybook` exits `0` on `No packages matched the filter` for the same
reason. Run the gate from inside `packages/ui` as above, or keep the flag behind
`run`:

```bash
bun run --cwd packages/ui test:storybook
```

### Do not delete `vitest.setup.ts`

Every run prints `Info: Found a setup file with "setProjectAnnotations"` and invites
you to remove the file. Following that advice breaks all 97 browser tests at once.

`storybookTest()` injects five setup files. Four are listed in the addon's own
`optimizeDeps.include`, so Vite pre-bundles them into the cache dir under
`packages/ui` and serves them from there. The fifth,
`@storybook/addon-vitest/internal/setup-file-with-project-annotations`, cannot be
pre-bundled because it imports a Vite virtual module, so it is served from its real
path — which under bun's non-hoisted layout is `node_modules/.bun/...`, outside the
Vite root, reachable only through a `/@fs/`-prefixed URL that does not get emitted.

`.storybook/vitest.setup.ts` is that same module, moved inside the Vite root. The
addon skips injecting its own copy when `test.setupFiles` names a file whose
directory is this one and whose source contains `setProjectAnnotations`, so the file
must stay here, must keep that call, and must stay listed in `vitest.config.ts`.
