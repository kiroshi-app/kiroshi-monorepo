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

## Rune Layout (Absolute Rule)

The desktop app is a Rust binary drawn with Rune, with no webview and no TypeScript.

| Path | Holds | Owner |
|------|-------|-------|
| `crates/kiroshi-core` | The host core: the database, the agent sessions, hosting and joined Spaces, the event channel, updates, and the system plugins and hooks it embeds | Ni |
| `apps/rune-preview/app` | The desktop app crate: state, routing, wiring the core to the kit views | Ichi |
| `apps/rune-preview/kit` | Every desktop visual: tokens, primitives, surfaces, scenes | San |
| `apps/rune-preview/os` | The operating system: notifications, the `kiroshi://` scheme, single instance | Ni |
| `apps/rune-preview/scripts` | The build: the macOS bundle, the signed packages, the Windows installer | Ni |
| `apps/app/sidecar` | The bun agent sidecar the core spawns | Ni |
| `apps/website` | The public site, React and Vite, with `packages/ui` as its only component source | |
| `apps/ios` | The native iPhone app | Yon |

### The test

The moment the app crate is about to draw something itself, stop: that drawing belongs in the kit. The app crate places kit views and feeds them state, it does not draw them.

### Consequences

- An agent writes only in the crate it owns, and names what is missing in another one instead of writing there.
- The kit renders without the core: every surface has a scene in `kit/src/scenes`, and a surface without a scene is not done.
- The core knows no window: what it tells the app crosses the event channel, what the app asks of it crosses `invoke`.
- `apps/rune-preview` keeps its own Cargo workspace and lockfile, beside the root workspace that holds `crates/kiroshi-core`.

## iOS App

**`apps/ios` is the native iPhone app. No desktop rule reaches it, no desktop code enters it.**

### Boundary

- Owned by Yon alone. Ichi, Ni and San never edit `apps/ios`.
- Never imports from `apps/rune-preview`, `apps/app` or `packages/ui`.
- Talks to the desktop host only through the relay member contract: the `hosting` and `joined_spaces` modules of `crates/kiroshi-core`, owned by Ni, schema in `docs/relay/member-socket.schema.json`.
- `packages/ui`, Biome, React, the i18n catalogue and kebab-case files stop at `apps/ios`. Swift is formatted by `swift format` with the root `.swift-format`.

### Native

- iOS 27, SwiftUI, system components only: tab bar, navigation bars, sheets, grouped inset lists, alerts.
- SF Pro, SF Symbols, Apple's gestures and density. No custom chrome, no third-party UI kit.
- Two tabs: Conversations, then Missions.
- Sign in happens inside the app (email, then a code by mail), never in a browser. The session bearer lives only in the Keychain.

### Colour

- Chrome wears the iOS system colours, by their semantic names: backgrounds (`systemBackground`, `systemGroupedBackground`, `secondarySystemBackground`…), labels (`.primary`, `.secondary`), separators, fills and grays, `systemRed` for errors and Sign out, `systemBlue` for the text cursor, the tab bar tinted with the label colour. No hex, no `Color(red:)`.
- The Kiroshi catalogue (`Color.kiroshi`, `Colors.xcassets`) paints only what an artboard draws in a Kiroshi colour. On Sign in, Home and Settings it still feeds the agent avatars and the Hive (with its `+N` counter), your initial top left of Home and in Settings, and the dot of the Space avatar.
- Your bubbles, in a Conversation, a group Conversation or a Mission thread, wear the current Space's colour through `SpaceAccent`; a Space without a colour keeps the catalogue's `user-bubble`. The chrome never follows the Space: the app's global accent stays the catalogue's `primary`, which tints the Conversations and Missions screens, and Send stays the label colour.

### Vocabulary

- Carried over from the desktop app: Agent, Conversation (never Chat), Message, Send, Applications, Secrets, Approvals, the Space name shown.
- The coding runtime has no name on screen, never "Claude Code": the agent acts under its own name, and a mission calls the runtime "the coding session".
- "bot" and "companion" are banned in strings, tickets and briefs, like "connecteur".
- Contractions everywhere: `You're signed in.`, `Couldn't send.`
- An error says what failed plus the gesture to fix it.
- A deletion says `This can't be undone.`

### Tooling

- XcodeGen `apps/ios/project.yml` is the only source of truth. The `.xcodeproj` is generated: never edited, never committed.
- `swift format lint --recursive apps/ios` reports nothing. Xcode is pinned in `.xcode-version`.
- `ios:run` and `ios:test` share the iPhone 17 simulator: never run them at once.

## House Rules

- **No new dependencies without approval** — Ask before adding any package.
- **Shared deps live in the root `package.json`** — Sub-package `package.json` only for truly package-specific deps. Check root first; duplicate versions cause type conflicts.
- **English only** — All code and identifiers in English.
- **No comments** — A comment is the signal that the code is not explicit enough: rename, split, or extract until it reads on its own. Only two things survive. Machine-read directives — `// biome-ignore`, `// @ts-*`, `/// <reference … />` — which are instructions to a tool, not prose. And `TODO:` / `FIXME:`, which mark work that is genuinely not done. No JSDoc, no "why" paragraph, no section banner, no commented-out code.
- **Named exports only** — No default exports, except where a tool requires one, as a Vitest config.
- **Files in kebab-case** — `chat-screen.tsx`, not `ChatScreen.tsx`.
- **Check before creating** — Search the kit, or `packages/ui/src/components` for the website, for an existing component before adding a new one.
- **Copy lives in the catalogue** — On the website and in `packages/ui`, read every user-facing string with `useTranslation` from `packages/ui/src/lib/i18n-en`; lint fails on JSX text and on `alt`, `aria-label`, `placeholder` and `title` written into the markup. `src/foundations` is exempt. In the desktop app, every string lives in `kit/src/strings`.
- **One concern per commit** — Conventional Commits.
- **Avoid `useEffect`** — On the website, use only when genuinely necessary.

## Monorepo

| Workspace | Path | Purpose | Stack |
|-----------|------|---------|-------|
| `kiroshi-core` | `crates/kiroshi-core` | The host core | Rust |
| `kiroshi-rune-preview` | `apps/rune-preview/app` | The desktop app | Rust + Rune |
| `kiroshi-rune-kit` | `apps/rune-preview/kit` | Every desktop visual | Rust + Rune |
| `kiroshi-rune-os` | `apps/rune-preview/os` | The operating system layer | Rust |
| `sidecar` | `apps/app/sidecar` | The agent sidecar | Bun + Claude Agent SDK |
| `website` | `apps/website` | The public site | React + Vite |
| `@workspace/ui` | `packages/ui` | The components the website renders | React + Tailwind + Base UI |
| — | `apps/ios` | Native iPhone app, owned by Yon | Swift 6 + SwiftUI + XcodeGen |

## Stack

- Desktop: Rust, Rune, rune-kit
- Runtime / package manager: Bun
- Monorepo: Turborepo for the TypeScript workspaces, Cargo for the Rust ones
- Lint / format: Biome, rustfmt, clippy
- Website: React 19, Tailwind v4, Motion
- Tests: Vitest and bun test, `cargo test`
- iOS: Swift 6, SwiftUI, XcodeGen

## Commands

```bash
bun run dev          # Build the sidecar, then launch the desktop app in its dev profile
bun run dev:website  # The website on Vite
bun run build        # Build the TypeScript workspaces: the website and the sidecar
bun run test         # Vitest and bun test, then cargo test for kiroshi-core and the Rune workspace
bun run test:rust    # cargo test for kiroshi-core and the Rune workspace, the fake agent on
bun run test:live    # The kiroshi-core tests against a real Claude, run by hand
KIROSHI_TEST_WORKERS=4 bun run test  # Raise the vitest worker budget for one run, 2 by default outside CI
bun run lint         # Check
bun run lint:fix     # Fix
bun run types        # Type check (tsc -b)
bun run ci           # The CI gate on this machine: lint, vitest, website, core, then ios
bun run ci:fast      # The pre-push check: format, Biome and knip against the baseline, types, the changed unit tests
bun run snapshots    # Rewrite every back-end contract snapshot in apps/app/contracts from the live code
bun run baseline     # Check the vitest suites, biome and knip against baselines/
bun run baseline:update  # Record the newly reported items, keeping every entry already there
bun run baseline:prune   # Drop the baseline entries no longer reported
bun run release <patch|minor|major|X.Y.Z|X.Y.Z-beta.N>  # Bump the app version, tag it, push both
bun run ios:generate # Generate apps/ios/Kiroshi.xcodeproj from project.yml
bun run ios:build    # Generate, then build the iOS app for the Simulator
bun run ios:test     # Generate, then run the iOS tests on the iPhone 17 simulator
bun run ios:run      # Generate, build and launch the iOS app on the simulator
```

Rust checks, from the repo root:

```bash
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test -p kiroshi-core
cargo fmt --manifest-path apps/rune-preview/Cargo.toml --all --check
cargo clippy --manifest-path apps/rune-preview/Cargo.toml --workspace --all-targets --features fake-claude -- -D warnings
cargo test --manifest-path apps/rune-preview/Cargo.toml --workspace --features fake-claude
apps/rune-preview/scripts/bundle-macos.sh  # The Kiroshi Dev.app bundle, which registers the kiroshi:// scheme on macOS
```

The app version lives in `apps/rune-preview/app/Cargo.toml`. A `v*` tag builds the signed Rune packages, `Kiroshi.app` on macOS, a `.deb` on Linux and an NSIS installer on Windows, all under `com.kiroshi.app`, and writes the `latest.json` the updater reads.

A machine opts in to the heavy job slots with `mkdir -p ~/.kiroshi/slots`, `KIROSHI_SLOTS` overriding their number; there, every `xcodebuild` and `cargo` run outside the repository scripts goes through `scripts/slot.sh`, `scripts/slot.sh cargo test ...`.

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case in TypeScript, snake_case in Rust | `chat-screen.tsx`, `local_core.rs` |
| Components | PascalCase | `ChatScreen` |
| Functions | camelCase | `createChatDriver` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Booleans | is/has/can prefix | `isLoading` |

## Code Style

- **Arrow functions only** in TypeScript — never the `function` keyword.
- **Named types for object params** — never inline `{ x }: { x: string }`; extract a named type.
- **Direct imports** — never barrel files. `@workspace/ui/components/button`, not `@workspace/ui`.

## Safety

### Destructive operations — NEVER without confirmation

Force push, hard reset, `git clean -fd`, branch delete (`-D`), `rm -rf` on a directory.

### Protected files

- **Never read/modify:** `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, `*.cert`.
- **Confirm before modifying:** `package.json`, `Cargo.toml`, `biome.json`, `tsconfig*.json`, `turbo.json`, `.github/workflows/`.

### Branch protection

Never push to `main`. Always work on feature branches.

Right after `gh pr create`, run `scripts/pr-enqueue.sh` alone in its own Bash call: it arms auto-merge with the squash method on the PR of the current branch and fails if it is not armed. The PR squash-merges as soon as its fast gate is green: lint, types, baseline, the touched tests and `verify`.

A PR whose base is not main is merged by `scripts/pr-merge-sub.sh` alone in its own Bash call: it squash-merges the PR of the current branch once every check on its head is green, and refuses a base of main, a draft, a conflict or a file owned in `.github/CODEOWNERS`. Its refusal `has no check on its head` most likely comes from a push that landed while the PR was in conflict, so Proof never fired: if its `mergeable_state` is `dirty`, rebase on or merge the Rune branch, otherwise push an empty commit, wait for Proof on the new head and run the script again.

Auto-merge armed and a fix must land: run `scripts/pr-dequeue.sh` to disarm it, push, then run `scripts/pr-enqueue.sh` again. Never close the PR.

Every push to main runs the full verify: lint, then vitest, website, core (kiroshi-core and the Rune workspace on Linux, macOS and Windows) and the Windows installer on the paths it changed, then ios. A red run opens the Red main ticket. A fix PR merges on its own fast gate whatever the state of main.

A push to main retries a failing vitest or Rust test once and names every test that passed only on its retry in the job summary; a pull_request, `bun run ci` and `ci:fast` retry nothing.
