# Kiroshi

Kiroshi is a desktop app where you keep a team of agents. Each Agent has a name, a face, a job, a folder to work in and a memory of its own. You talk with one or several of them in Conversations, hand one a mission, or set a routine that runs while you do something else. Everything lives in a folder on your computer and is there again on the next launch.

Kiroshi runs on macOS (10.15 Catalina or later, Apple silicon and Intel), Windows and Linux. An iPhone app reaches your Spaces from anywhere through the online mode.

## What Kiroshi offers

### Agents

- **Your roster.** Name an Agent, give it a face, a job and the folder it works in, and keep as many as you need.
- **How it works.** Each Agent has its own model, effort level and answer style, picked from what your model provider offers.
- **Skills it learns.** Correct an Agent once and it writes a skill down. Every write is saved as its own change in that Agent's History, where you read it and undo it, one change at a time.
- **Delegation.** An Agent can hand a self-contained job to a nested read-only agent and bring its report back in the same turn.

### Conversations

- **One Agent or several.** A Conversation seats as many Agents as you name. `@` the ones you need: every Agent named in one Message works in the same wave, so one can be working while you read another.
- **Rich answers.** Code, tables, diagrams, files and web sources render inside the answer. You attach files to a Message, pin the Messages that matter and quote a selection back.
- **Questions and Approvals inline.** When an Agent asks you something or wants to run a tool that needs your yes, the question waits in the Conversation and in a notification.
- **Search.** Search every Message, Conversation, mission and routine.

### Missions

A mission is a longer piece of work an Agent owns: an objective, the ticket it comes from, and a thread of its own. It runs a coding session in a checkout, moves through events (opened, note, question, answer, escalated, ready to merge, checks failed, failed, closed, reopened) and rests in a state you read at a glance: working, blocked on you, ready to merge, blocked, completed or closed. A mission can watch a branch on GitHub, so commits, pull requests and red checks reach its thread. From a mission you message or stop the coding session, answer its question, open the pull request, close or reopen it.

### Routines

A routine is a standing instruction of one Conversation: a trigger fires, the Agent carries out the instruction, and its report lands in that Conversation. Three triggers ship: a cron schedule, a watched file changing, and a call on the local webhook. Each routine filters the trigger payload field by field. You set routines from the Conversation, and an Agent can create, edit, run and delete its own.

### Spaces

- **Work kept apart.** Each Space has its own name, colour, Agents, Conversations, missions, Applications and Secrets.
- **Shared Spaces.** Host a Space from your computer and invite people by e-mail: they reach it through the relay while Kiroshi is open on your computer. Join a Space someone hosts for you from an invitation. The owner sees the members and removes them.
- **Your devices.** A new device signed in to your Kiroshi account waits until you approve it from a device you already use, or with a code sent by e-mail. You see and remove your devices from Settings.

### Applications, Secrets and Approvals

- **Applications.** Plug in the tools you already use from a directory, for one Agent, one Space or all of them, signing in to the ones that ask for it.
- **Secrets.** Keys and tokens are stored outside the Agents' folders, scoped to a Space, an Agent or one Application, and handed only where you allow them.
- **Approvals.** Choose how an Agent answers a tool request (ask every time, accept edits, plan first, decide alone, never ask) and write allow, ask and deny rules that hold whatever the mode.

### Library, documents and boards

Every Space has a Library: every image, document and board in it, filtered and searched. Import files, save an image or a Message from a Conversation, start a new document or a new board. Agents write in a document live while you watch, and draw on a board beside you: sticky notes, text, shapes, links and images, with the Agents drawing shown as they go. A board or a document opens in a drawer beside its Conversation.

### Tabs and windows

Conversations, missions and the Library open in tabs: pin, duplicate, close others, reopen the last closed tab, or drag a tab into a new window and back. A tab whose Agent needs you says so.

### Around the app

- **Bring in a Claude Code setup.** If you use Claude as your model provider, Kiroshi finds what is in `~/.claude` (agents, skills and more) and brings in what you select.
- **Notifications** when an Agent asks you something, wants your approval, finishes its turn, or when a mission needs you or is ready to merge.
- **Updates.** Kiroshi tells you when a new version is out, downloads it when you ask and applies it on restart.
- **English and French**, light, dark or system appearance.

### The iPhone app

The iPhone app is a native app for your Spaces online. Sign in with Apple, Google or a code by e-mail, approve the device, accept the invitations you were sent, then follow your Conversations and Missions in two tabs: read and send Messages, `@` an Agent, and answer the questions it asks.

## Your model provider

Your Agents need a model to think with, on your own account with the model provider. Kiroshi ships the coding session executable beside its agent sidecar: nothing else to install.

The provider Kiroshi ships today is Claude. When you first open Kiroshi, sign-in offers two ways in:

- **A Claude account.** Sign in with Claude in your browser, with your Claude Pro or Max subscription, or use the account already signed in on your computer.
- **An API key.** Paste an Anthropic API key and pay per use.

What you send goes to the model provider through your account with it.

## Pricing

- **Local is free.** Everything Kiroshi does on your computer: Agents, skills, Conversations, missions, routines, Applications, Secrets, Approvals, the Library.
- **Pro is the online mode:** the relay, a Space you host for people who are not on your network, a Space someone hosts for you, and the iPhone app. Pro is priced per user: $15 per user per month billed yearly, or $20 per user per month billed monthly.
- **Pro is free during the beta.** Payment is not set up, so nobody is charged. Nothing about Pro is promised beyond the beta.

You sign in to your Kiroshi account from the desktop app's Settings, in your browser. The account only connects you to Spaces and devices beyond your computer.

## Building Kiroshi

### Requirements

- [Bun](https://bun.sh): runtime and package manager.
- [Rust toolchain](https://rustup.rs): the desktop app's host is Rust.
- On Linux, the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).
- Headless Chromium, for the Storybook half of the test run: install it once with `bunx playwright install chromium` from `packages/ui`.
- For the iPhone app, on macOS only: Xcode at the version pinned in `.xcode-version`, and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

The version of the coding session executable is pinned by `claudeCodeVersion` in `apps/app/sidecar/package.json`. The sidecar build fails when the executable resolved in `node_modules` disagrees, so that pin moves in the same commit as `@anthropic-ai/claude-agent-sdk`.

### Getting started

```bash
bun install
bun run dev
```

`bun run dev` launches the desktop app locally: the Vite dev server plus the native window, with hot reload.

### Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Launch the desktop app: Vite dev server and native window, hot reload. |
| `bun run storybook` | Storybook on <http://localhost:6006>, the place to build UI. |
| `bun run build` | Build every workspace. |
| `bun run build:website` | Build the website only. |
| `bun run tauri:build` | Package the desktop app. |
| `bun run test` | Vitest for the app, the UI, the website and the shared package, `bun test` for the sidecar, `cargo test` for the desktop host. |
| `bun run lint` | Biome lint. |
| `bun run lint:fix` | Biome check with fixes applied. |
| `bun run format` | Biome format. |
| `bun run types` | Type check across the workspaces. |
| `bun run baseline` | Check the vitest suites, Biome, knip and the story counts against `baselines/`. |
| `bun run baseline:update` | Record the newly reported items and the live story counts. |
| `bun run baseline:prune` | Drop the baseline entries no longer reported. |
| `bun run snapshots` | Rewrite every back-end contract snapshot in `apps/app/contracts`, and `docs/relay/member-socket.schema.json`, from the live code. |
| `bun run tokens:build` | Regenerate the colour tokens. |
| `bun run tokens:check-sets` | Check the iPhone app colour sets in `Colors.xcassets` against `packages/ui/tokens.json`. |
| `bun run avatar:build` | Bundle the Agent avatar drawing into the iPhone app resources. |
| `bun run ci:fast` | Runs on every `git push` through the husky pre-push hook and refuses the push when it fails: format, Biome and knip against the baseline, types and the fast unit tests. |
| `bun run ci` | Run before opening a pull request: the checks of the pull request jobs, from `scripts/ci.ts`, skipping the groups untouched since the merge base with `origin/main`. |
| `bun run release` | Bump the version everywhere, commit, tag and push. Takes `patch`, `minor`, `major` or `X.Y.Z`. |
| `bun run ios:generate` | Generate `apps/ios/Kiroshi.xcodeproj` from `apps/ios/project.yml`. |
| `bun run ios:build` | Generate, then build the iPhone app for the Simulator. |
| `bun run ios:test` | Generate, then run the iPhone app tests on the iPhone 17 simulator. |
| `bun run ios:test:unit` | Generate, then run the iPhone app unit tests only. |
| `bun run ios:run` | Generate, build and launch the iPhone app on the simulator. |
| `bun run ios:screenshots` | Capture the App Store screenshots. |

`ios:run` and `ios:test` share the iPhone 17 simulator: never run them at once.

### Environment

| Variable | Read by | What it does |
| --- | --- | --- |
| `KIROSHI_AGENT_SIDECAR` | the desktop app, whenever it resolves the agent | Path to a `kiroshi-agent` executable. It is tried **before** the copy beside the app executable and the one left in the build tree, so it wins over the sidecar the app ships with. Leave it unset to run that one. |
| `KIROSHI_CLAUDE_EXECUTABLE` | the sidecar, whenever it resolves the Claude provider | Path to the coding session executable. It is tried **before** the copy shipped beside the sidecar. Leave it unset to run that one; the sidecar test suites point it at the platform binary of the agent SDK in `node_modules`. |
| `KIROSHI_ROUTINE_DEADLINE_SECS` | the desktop app, in a debug build only | A positive whole number of seconds that replaces the 30-minute routine deadline. A release build ignores it. |
| `APPLE_SIGNING_IDENTITY` | `bun run tauri:build` | Developer ID to sign the macOS bundle with. Turbo passes it through to that task, and the release workflow feeds it from a repository secret. |

`KIROSHI_AGENT_SIDECAR` is what the host test suites point at a fake sidecar. A leftover export silently sends the app at that fake too, so `unset KIROSHI_AGENT_SIDECAR` before running against the bundled sidecar.

### Monorepo

| Workspace | Path | Purpose |
| --- | --- | --- |
| `app` | `apps/app` | The desktop app, technical composition only. Tauri, React and Vite. |
| `sidecar` | `apps/app/sidecar` | The `kiroshi-agent` binary: one compiled Bun executable carrying the agent SDK, the coding session executable it spawns, and the protocol the host speaks. |
| `@workspace/ui` | `packages/ui` | Every desktop visual: components, foundations, tokens. React, Storybook, Tailwind and Base UI. |
| `@workspace/shared` | `packages/shared` | Code shared between the workspaces. |
| `website` | `apps/website` | The public site at kiroshi.app. |
| (none) | `apps/ios` | The native iPhone app. Swift, SwiftUI and XcodeGen. |

The boundary between the app and the UI package is absolute: no markup, no Tailwind class and no raw DOM element lives in `apps/app`. That rule and the rest of the conventions are in [`AGENTS.md`](AGENTS.md), which every contributor and every AI agent working here must follow.

The protocol the host speaks to the sidecar (the frames, the permission handshake, session resume) is documented in [`apps/app/src-tauri/src/agent/PROTOCOL.md`](apps/app/src-tauri/src/agent/PROTOCOL.md).

### Releasing

```bash
bun run tauri:build
```

To sign the macOS bundle with a Developer ID, put the identity in the environment:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: ..." bun run tauri:build
```

Signing is not notarization: a signed bundle is still refused by Gatekeeper until it has been submitted to Apple and stapled, which is a separate step. The release workflow carries the Apple credentials for it.

Before tagging a release, walk [`apps/app/SMOKE.md`](apps/app/SMOKE.md): the manual checks against a real signed-in binary, the network and a packaged bundle that the automated suite cannot reach.

## Author

Kiroshi is an independent project run from France by Steve Puget. Write to <support@kiroshi.app>.

## License

MIT, see [`LICENSE`](LICENSE).
