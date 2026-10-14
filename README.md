# Kiroshi

Kiroshi is a desktop app for Claude Code: a roster of bots you name, dress and brief — each with its own model, working directory and instructions — grouped into spaces and talking in conversations that are stored locally and come back on the next launch.

A conversation seats as many bots as you name in it, and every bot named in one message runs in the same wave, so one can be working while you read another. Every turn is answered by the Claude Code executable Kiroshi ships beside its agent sidecar.

## What a bot carries

**Its space.** A bot belongs to a space, and a space carries a plugin of its own — `about-this-space` and whatever the bots wrote there — read by every bot of that space. A second plugin, `me`, holds what the bots know about you and is read by every bot in the app.

**Its skills.** Each bot owns a plugin directory: an agent file at `agents/agent.md` for what it always knows, and `skills/<name>/SKILL.md` files for what a task calls for. A bot writes there itself, each write is a git commit in that directory, and you read and undo them in its History. On top of that, every session is given the bundled `kiroshi` plugin, whose `learn` and `routines` skills are preloaded into the system prompt.

**Its MCP servers.** Servers are declared in `.mcp.json` inside a plugin directory and stacked system, then space, then bot, so a bot can override a server the space declares. A server declaration may hold `${VAR}` placeholders; a server whose placeholders cannot be filled is left out of the session and named to the bot, with the reason, so it can tell you.

**Its environment variables.** Values are stored outside the plugins, under the app's `env/` directory, scoped to a space, to a bot, or to one named server of either. They are what fills the `${VAR}` placeholders above.

**Its routines.** A routine is a standing instruction of one conversation: a trigger fires, the bot carries out the instruction, and its report lands in that conversation. Three triggers ship: a cron schedule, a watched file changing, and a call on the local webhook. Each routine filters the trigger payload field by field, and a bot creates, edits, runs, lists and deletes its own routines through the `routine_*` tools on the `kiroshi` server.

**Its missions.** A mission is a longer piece of work a bot owns: an objective, the ticket it comes from, and a thread of its own. It moves through events — opened, note, agent_asked, answered, escalated, ready, failed, closed — and rests in a state you can read from the roster. A bot opens, notes, escalates, closes and lists its missions through the `mission_*` tools, and `mission_watch` arms a branch so what happens to it on GitHub reaches the mission thread; pointed at a git checkout, it also installs an agent hook there.

Every bot also holds `delegate`, which hands a self-contained job to a nested read-only agent and brings its report back in the same turn.

## Requirements

- **A [Claude](https://claude.com/claude-code) subscription, signed in.** Kiroshi bundles the Claude Code executable that answers — nothing to install — but it answers on your own sign-in. Its version is pinned by `claudeCodeVersion` in `apps/app/sidecar/package.json`; the sidecar build fails when the executable resolved in `node_modules` disagrees, so that pin is bumped in the same commit as `@anthropic-ai/claude-agent-sdk`.
- **No API key.** The session Kiroshi opens inherits a fixed allowlist of environment variables, and no API key is on it.
- [Bun](https://bun.sh) — runtime and package manager.
- [Rust toolchain](https://rustup.rs) — the Tauri host is Rust.
- On Linux, the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).
- Headless Chromium, for the Storybook half of the test run — install it once with `bunx playwright install chromium` from `packages/ui`.

macOS, Linux and Windows.

## Getting started

```bash
bun install
bun run dev
```

`bun run dev` launches the Tauri app locally: Vite dev server plus the native window, with hot reload.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Launch the Tauri app — Vite dev server + native window, hot reload. |
| `bun run storybook` | Storybook on <http://localhost:6006> — the place to build UI. |
| `bun run test` | Vitest for the app and the UI, `bun test` for the sidecar, and `cargo test` for the Tauri host. |
| `bun run lint` | Biome lint. |
| `bun run lint:fix` | Biome check with fixes applied. |
| `bun run format` | Biome format. |
| `bun run types` | Type check across the workspaces. |
| `bun run build` | Build every workspace. |
| `bun run tauri:build` | Package the desktop app. |
| `bun run ci:fast` | Run before every push: biome format, biome and knip against the baseline, types, the app and UI unit tests and the story ids against the baseline, in under 2 minutes. |
| `bun run ci` | Run before opening a pull request: exactly the checks of the pull request jobs, from `scripts/ci.ts`, lint, rust, vitest, website then ios. A group `scripts/ci-changes.ts` finds untouched since the merge base with `origin/main` is skipped, and ios is skipped off macOS. |
| `bun run release` | Bump the version everywhere, commit, tag and push. Takes `patch`, `minor`, `major` or `X.Y.Z`. |

## Environment

| Variable | Read by | What it does |
| --- | --- | --- |
| `KIROSHI_AGENT_SIDECAR` | the app, whenever it resolves the agent | Path to an `kiroshi-agent` executable. It is tried **before** the copy beside the app executable and the one left in the build tree, so it wins over the sidecar the app ships with. Leave it unset to run that one. |
| `KIROSHI_CLAUDE_EXECUTABLE` | the sidecar, whenever it resolves the provider | Path to a Claude Code executable. It is tried **before** the copy shipped beside the sidecar, which is what a bundle and a build tree both carry. Leave it unset to run that one; the sidecar test suites point it at the platform binary of the agent SDK in `node_modules`, having no bundle of their own. |
| `APPLE_SIGNING_IDENTITY` | `bun run tauri:build` | Developer ID to sign the macOS bundle with. Turbo passes it through to that task, and the release workflow feeds it from a repository secret. |

`KIROSHI_AGENT_SIDECAR` is what the host test suites point at a fake sidecar. A leftover export silently sends the app at that fake too, so `unset KIROSHI_AGENT_SIDECAR` before running against the bundled sidecar.

None of them belongs in the repository: two are local paths, the third a personal certificate name.

## Monorepo

| Workspace | Path | Purpose |
| --- | --- | --- |
| `app` | `apps/app` | The desktop application — technical composition only. Tauri + React + Vite. |
| `sidecar` | `apps/app/sidecar` | The `kiroshi-agent` binary: one compiled Bun executable carrying the Claude Agent SDK, the Claude Code executable it spawns, and the protocol the host speaks. |
| `@workspace/ui` | `packages/ui` | Every visual: components, foundations, tokens. React + Storybook + Tailwind + Base UI. |

The boundary between the app and the UI package is absolute — no markup, no Tailwind class and no raw DOM element lives in `apps/app`. That rule and the rest of the conventions are in [`AGENTS.md`](AGENTS.md), which every contributor and every AI agent working here must follow.

The protocol the host speaks to the sidecar — the frames, the permission handshake, session resume — is documented in [`apps/app/src-tauri/src/agent/PROTOCOL.md`](apps/app/src-tauri/src/agent/PROTOCOL.md).

## Releasing

```bash
bun run tauri:build
```

To sign the macOS bundle with a Developer ID, put the identity in the environment:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: …" bun run tauri:build
```

Signing is not notarization: a signed bundle is still refused by Gatekeeper until it has been submitted to Apple and stapled, which is a separate step. The release workflow carries the Apple credentials for it.

Before tagging a release, walk [`apps/app/SMOKE.md`](apps/app/SMOKE.md) — the manual checks against a real signed-in binary, the network and a packaged bundle that the automated suite cannot reach.

## License

MIT — see [`LICENSE`](LICENSE).
