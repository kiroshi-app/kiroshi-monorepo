# AGENTS.md — Single Source of Truth

All AI agents working in this monorepo must follow these instructions.

## SIMPLE — Core Principles (Absolute Priority)

Every decision must pass through these six principles:

- **S — Simple** — Favor the simplest solution that solves the problem. Less code, fewer abstractions, no over-engineering.
- **I — Intentional** — Every line of code exists for a reason. No speculative features, no "just in case" logic.
- **M — Measurable** — Changes must have observable impact. If you can't verify it works, rethink the approach.
- **P — Pragmatic** — Ship what works today. Perfect is the enemy of done. Choose proven patterns over clever ones.
- **L — Layered** — Build incrementally. Each change should be a stable, shippable layer on top of what exists.
- **E — Envisioned** — Keep the end goal in sight. Short-term decisions should align with the long-term product vision.

## Behavioral Guidelines

Four rules that govern HOW you work. SIMPLE defines WHAT to build; these define how to approach the task.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask rather than guess.
- If multiple interpretations exist, present them — never pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First

- No features beyond what was asked. No abstractions for single-use code.
- No "flexibility" that wasn't requested. No error handling for impossible scenarios.
- Self-check: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

- Touch only what you must. Match existing style, even if you'd do it differently.
- Don't refactor things that aren't broken. If you notice unrelated dead code, mention it — don't delete it.
- Every changed line should trace directly to the request.

### 4. Goal-Driven Execution

- Define success criteria up front, then loop until verified.
- For multi-step tasks, state a brief plan with a verification step for each.

## UI / App Boundary (Absolute Rule)

**No visual code in `apps/app`. Every desktop visual belongs to `packages/ui`.** No exception.

### The test

The moment you are about to write a `<div>` — or *any* raw HTML element, or *any* Tailwind class, or *any* markup that is not already a `@workspace/ui` component — stop. That code belongs in `packages/ui`. Build the component there, give it a story, then consume it from the app.

### `packages/ui` owns

- Every raw DOM element: `div`, `span`, `p`, `button`, `input`, `svg`, `ul`…
- Every Tailwind class, `cva` variant, inline style, CSS file, design token.
- Layout, spacing, color, typography, icons, animation, transitions.
- Visual state: hover, focus, loading skeletons, empty states, error banners.
- A Storybook story per component — anything that renders on its own ships with its stories, and a component without a story is not done. Out of that rule: re-export barrels, mapping tables and context providers, which render nothing on their own.
- A story title is `Section/Component`, Section taken from the `SECTIONS` list in `packages/ui/.storybook/preview.tsx`. Full contract: `packages/ui/.storybook/README.md`.
- The visible Storybook catalogue lists only the states the app renders: a story that proves behaviour on a composition the app never assembles carries the `test-only` tag on its meta, which keeps it out of the sidebar while the storybook suite still plays it.
- `packages/ui/src/components/ui` holds what the shadcn CLI wrote and nothing else: a file enters it through `bunx shadcn@latest add <item>` run from `packages/ui`, never copied, never invented, and is never edited or formatted by hand afterwards, with two deviations from the registry output. The `cn` import line reads `import { cn } from "@workspace/ui/lib/utils"` instead of `from "cn"`, so the project class groups merge there too: keep `cn` out of every `package.json`, `packages/ui/src/lib/utils.test.ts` fails otherwise. Icons import from `@keyline-icons/react`, never `lucide-react` and never the registry's `IconPlaceholder`, since the registry does not know Keyline. Rewrite both lines after every `shadcn add`. Added behaviour lives in a composed component beside that folder, and a vendored primitive still ships its story, placed beside the folder.

### `apps/app` owns

Only **technical composition** — it places things, it does not draw them:

- Assembling `@workspace/ui` components into a screen.
- State, controllers, state machines, hooks, data flow.
- Tauri IPC, drivers, transports, parsing, business logic.
- Mapping domain models to component props (`toActivityItems`, `statusFor`…).
- Routing, providers, wiring, event handlers.

### Consequences

- An app file imports visuals **only** from `@workspace/ui/components/*`.
- Needs a wrapper, a grid, a stack, a gap? That is a `packages/ui` layout component (`ChatLayout`, `AppHeader`…), not a `div` in the app.
- Needs a one-off tweak? Add a variant or a prop to the UI component — never a Tailwind class in the app.
- A component in the app that is not pure composition of UI components is a bug: move it to `packages/ui`.
- Reference: `apps/app/src/components/thread-screen.tsx` — composition only, zero markup.

## iOS App

**`apps/ios` is the native iPhone app. No desktop rule reaches it, no desktop code enters it.**

### Boundary

- Owned by Yon alone. Ichi, Ni and San never edit `apps/ios`.
- Never imports from `apps/app` or `packages/ui`.
- Talks to the desktop host only through the relay member contract: the Rust `hosting` and `joined_spaces` modules, owned by Ni, schema in `docs/relay/member-socket.schema.json`.
- `packages/ui`, Biome, React, Storybook, the i18n catalogue and kebab-case files stop at `apps/ios`. Swift is formatted by `swift format` with the root `.swift-format`.

### Native

- iOS 27, SwiftUI, system components only: tab bar, navigation bars, sheets, grouped inset lists, alerts.
- SF Pro, SF Symbols, Apple's gestures and density. No custom chrome, no third-party UI kit.
- Two tabs: Conversations, then Missions.
- Sign in happens inside the app (email, then a code by mail), never in a browser. The session bearer lives only in the Keychain.

### Colour

- Chrome wears the iOS system colours, by their semantic names: backgrounds (`systemBackground`, `systemGroupedBackground`, `secondarySystemBackground`…), labels (`.primary`, `.secondary`), separators, fills and grays, `systemRed` for errors and Sign out, `systemBlue` for the text cursor, the tab bar tinted with the label colour. No hex, no `Color(red:)`.
- The Kiroshi catalogue (`Color.kiroshi`, `Colors.xcassets`) paints only what an artboard draws in a Kiroshi colour. On Sign in, Home and Settings it still feeds the companion avatars and the Hive (with its `+N` counter), your initial top left of Home and in Settings, and the online dot of the menu of Spaces.
- Your bubbles, in a Conversation, a group Conversation or a Mission thread, wear the current Space's colour through `SpaceAccent`; a Space without a colour keeps the catalogue's `user-bubble`. The chrome never follows the Space: the app's global accent stays the catalogue's `primary`, which tints the Conversations and Missions screens, and Send stays the label colour.

### Vocabulary

- Carried over from the desktop app: Companion, Conversation (never Chat), Message, Send, "the agent" (never "Claude Code" on screen), Applications, Secrets, Approvals, the Space name shown.
- Contractions everywhere: `You're signed in.`, `Couldn't send.`
- An error says what failed plus the gesture to fix it.
- A deletion says `This can't be undone.`

### Tooling

- XcodeGen `apps/ios/project.yml` is the only source of truth. The `.xcodeproj` is generated: never edited, never committed.
- `swift format lint --recursive apps/ios` reports nothing. Xcode is pinned in `.xcode-version`.
- `ios:run` and `ios:test` share the iPhone 17 simulator: never run them at once.

## Data reading

`apps/app` reads host data through TanStack Query. `packages/ui` never imports it.

### A read

- One `useQuery` per read inside a `use-*.ts` hook of the domain folder, its `queryFn` the existing reader (`readModelCatalogue`). Never `useEffect` plus `useState`.
- The hook maps query state to what its caller needs: `{ models, hasFailedToLoad }`, never raw `data`.
- Every query and mutation declares its failure in `meta`: `{ failureNotice: () => ({ title: i18n.t(...) }), raisedIn: "use-model-catalogue" }`, or `{ rendersErrorInline: true }` when the screen shows the error itself. The cache `onError` in `lib/query/query-client.ts` raises it through `raiseReportedFailure`: never call it from the hook.
- Defaults live in `lib/query/query-client.ts`. Only a joined host offline retries a read, once. A refused or local read never retries, a mutation never retries.

### Keys

- One factory per domain, `<domain>-query-keys.ts` in that domain folder (`lib/bots/bot-query-keys.ts`), from generic to specific: `botQueryKeys.all`, then `botQueryKeys.modelCatalogue()`.
- The key carries every input the `queryFn` reads.

### Invalidation

- `useInvalidateOnHostEvent(event, keys)` from `lib/query/host-invalidations.ts` invalidates `keys` when the host emits `event`, and stops on unmount.
- A host reconnect invalidates every query on its own.
- A mutation invalidates either through the host event it triggers or in its `onSettled`, never both.

### Tests

- `createQueryTestWrapper()` from `lib/query/query-test-wrapper.tsx` gives each test a fresh `QueryClient`, retry off and no gc timer left running: `renderHook(useX, { wrapper: createQueryTestWrapper().wrapper })`. A test rendering `App` passes it too.

## House Rules

- **No new dependencies without approval** — Ask before adding any package.
- **Shared deps live in the root `package.json`** — Sub-package `package.json` only for truly package-specific deps. Check root first; duplicate versions cause type conflicts.
- **English only** — All code and identifiers in English.
- **No comments** — A comment is the signal that the code is not explicit enough: rename, split, or extract until it reads on its own. Only two things survive. Machine-read directives — `// biome-ignore`, `// @ts-*`, `/// <reference … />` — which are instructions to a tool, not prose. And `TODO:` / `FIXME:`, which mark work that is genuinely not done. No JSDoc, no "why" paragraph, no section banner, no commented-out code.
- **Named exports only** — No default exports (except Storybook stories).
- **Files in kebab-case** — `chat-screen.tsx`, not `ChatScreen.tsx`.
- **Check before creating** — Search `packages/ui/src/components` for an existing component before adding a new one.
- **Copy lives in the catalogue** — Read every user-facing string with `useTranslation` from `packages/ui/src/lib/i18n-en`; lint fails on JSX text and on `alt`, `aria-label`, `placeholder` and `title` written into the markup. Stories and `src/foundations` are exempt.
- **One concern per commit** — Conventional Commits.
- **Avoid `useEffect`** — Use only when genuinely necessary.

## Monorepo

| Workspace | Path | Purpose | Stack |
|-----------|------|---------|-------|
| `app` | `apps/app` | Desktop application — technical composition only | Tauri + React + Vite |
| `@workspace/ui` | `packages/ui` | Every desktop visual: components, foundations, tokens | React + Storybook + Tailwind + Base UI |
| — | `apps/ios` | Native iPhone app, owned by Yon | Swift 6 + SwiftUI + XcodeGen |

## Stack

- Runtime / package manager: Bun
- Monorepo: Turborepo
- Lint / format: Biome
- Frontend: React 19, Tailwind v4, Motion
- Desktop: Tauri (Rust)
- UI development: Storybook
- Tests: Vitest (+ `cargo test` for the Tauri host)
- iOS: Swift 6, SwiftUI, XcodeGen

## Commands

```bash
bun run dev          # Launch the Tauri app (Vite + native window)
bun run storybook    # Storybook on :6006 — the place to build UI
bun run build        # Build all
bun run tauri:build  # Package the desktop app
bun run test         # Vitest + cargo test
KIROSHI_TEST_WORKERS=4 bun run test  # Raise the vitest worker budget for one run, 2 by default outside CI
bun run lint         # Check
bun run lint:fix     # Fix
bun run types        # Type check (tsc -b)
bun run snapshots    # Rewrite every back-end contract snapshot in apps/app/contracts, and docs/relay/member-socket.schema.json, from the live code
bun run baseline     # Check the three vitest suites, biome, knip and the story counts against baselines/
bun run baseline:update  # Record the newly reported items and the live story counts, keeping every entry already there
bun run baseline:prune   # Drop the baseline entries no longer reported
bun run ios:generate # Generate apps/ios/Kiroshi.xcodeproj from project.yml
bun run ios:build    # Generate, then build the iOS app for the Simulator
bun run ios:test     # Generate, then run the iOS tests on the iPhone 17 simulator
bun run ios:run      # Generate, build and launch the iOS app on the simulator
```

A machine opts in to the heavy job slots with `mkdir -p ~/.kiroshi/slots`, `KIROSHI_SLOTS` overriding their number; there, every `xcodebuild` and `cargo` run outside the repository scripts goes through `scripts/slot.sh`, `scripts/slot.sh cargo test ...`.

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `chat-screen.tsx` |
| Components | PascalCase | `ChatScreen` |
| Functions | camelCase | `createChatDriver` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Booleans | is/has/can prefix | `isLoading` |

## Code Style

- **Arrow functions only** — never the `function` keyword.
- **Named types for object params** — never inline `{ x }: { x: string }`; extract a named type.
- **Direct imports** — never barrel files. `@workspace/ui/components/button`, not `@workspace/ui`.

## Safety

### Destructive operations — NEVER without confirmation

Force push, hard reset, `git clean -fd`, branch delete (`-D`), `rm -rf` on a directory.

### Protected files

- **Never read/modify:** `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, `*.cert`.
- **Confirm before modifying:** `package.json`, `biome.json`, `tsconfig*.json`, `turbo.json`, `src-tauri/tauri*.conf.json`, `.github/workflows/`.

### Branch protection

Never push to `main`. Always work on feature branches.

Right after `gh pr create`, run `scripts/pr-enqueue.sh` alone in its own Bash call: it arms auto-merge on the PR of the current branch and fails if it is not armed.

PR already queued and a fix must land: run `scripts/pr-dequeue.sh`, push, then run `scripts/pr-enqueue.sh` again. Never close the PR.
