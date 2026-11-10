# Contributing to Kiroshi

Thanks for taking the time. Kiroshi is a Rust desktop app drawn with Rune, in a Bun monorepo:
`crates/kiroshi-core` holds the host core, the app crate in `apps/rune-preview/app`
composes screens, the kit crate in `apps/rune-preview/kit` owns every visual.

## Conventions

**[`AGENTS.md`](../AGENTS.md) is the single source of truth** for how code is
written here — the SIMPLE principles, the UI/app boundary, naming, file layout,
commit format, and the safety rules. Read it before your first change and follow
it; this file only covers the mechanics of getting a change in. Where the two
disagree, `AGENTS.md` wins.

Two rules from it are worth repeating, because they are the ones pull requests
trip over:

- **No drawing in the app crate.** Everything the desktop app draws belongs in
  the kit crate, `apps/rune-preview/kit`, with a scene. A surface without a
  scene is not done.
- **No new dependencies without approval.** Open an issue first and say what the
  package buys us.

## Getting set up

```bash
bun install
bun run dev          # Build the sidecar, then launch the desktop app in its dev profile
bun run dev:website  # The website on Vite
```

You need [Bun](https://bun.sh) and the [Rust toolchain](https://rustup.rs). On
Linux, install `libxkbcommon-dev`, which the desktop app links.

Running the app locally launches a real Claude Code CLI on your machine. Read
[`SECURITY.md`](SECURITY.md) so you know what that means before you approve tool
calls from a branch you are reviewing.

## Making a change

1. Open an issue first for anything beyond a small fix, so the approach can be
   agreed before you write it. Bugs and features each have a form.
2. Branch off `main`. Never push to `main`.
3. Keep the change surgical — one concern per commit, and every changed line
   traceable to the request.
4. Write commits as [Conventional Commits](https://www.conventionalcommits.org):
   `feat(ui): …`, `fix(app): …`, `chore: …`.

## Before you push, and before you open a pull request

```bash
bun run ci:fast   # before every push: biome, knip, types, unit tests, story ids
bun run ci        # before opening a pull request: the exact checks of the PR jobs
```

`git push` runs `bun run ci:fast` through the husky pre-push hook that
`bun install` sets up, and refuses the push when it fails. A push that only
deletes branches skips it. `--no-verify` is not used in this repo: fix the
failure instead.

`bun run ci` runs `scripts/ci.ts`, the one definition of the gate the pull
request jobs run. Both must pass. Then fill in the pull request template: say what changed
and why, and how a reviewer can see it working. Screenshots or a short capture
for anything visual.

Before tagging a release, the manual checks in
[`apps/app/SMOKE.md`](../apps/app/SMOKE.md) cover what the automated suite cannot
reach.

## Reporting problems

- **Bug or feature request** — use the issue forms in the repository's Issues
  tab.
- **Security vulnerability** — do not open an issue. Follow
  [`SECURITY.md`](SECURITY.md).
- **Conduct** — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), which applies to
  every space in this project.
