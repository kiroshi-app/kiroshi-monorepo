---
name: release
description: Publish an Kiroshi release end to end — read the commits since the last release, draft one to three user-facing highlights, and hand them to `bun run release` as the release notes.
when_to_use: When shipping a new Kiroshi version — "release", "publish a release", "ship the next version", "cut a patch/minor/major" — including when the notes still have to be written from the commit history. Not for writing a changelog without publishing, and not for opening a plain pull request — use /git:create.
argument-hint: "[patch|minor|major]"
disable-model-invocation: true
allowed-tools: Bash, Write, Read, AskUserQuestion
---

# Release Kiroshi

This skill calls `scripts/release.ts`. It never edits that script or `.github/workflows/`.

## 1. Preflight

One call:

```bash
ANCHOR=$(git log -1 --format=%H --grep='^chore(app): release v' HEAD)
echo "branch: $(git rev-parse --abbrev-ref HEAD)"
echo "dirty:  $(git status --porcelain | wc -l)"
echo "notes:  $(grep -c -- '--notes' scripts/release.ts)"
git log ${ANCHOR:+$ANCHOR..}HEAD --no-merges --format='%s'
```

The anchor is the last release **commit** reachable from HEAD, not the last tag: releases land on `main` squash-merged, so `v*` tags are usually unreachable and `git describe` fails. The grep matches the commit message `scripts/release.ts` writes, so the two stay in step. No anchor means no release yet — the range is the whole history.

Stop, and publish nothing, when:

- The commit list is empty — say nothing has landed since the last release.
- `notes:` is `0` — `scripts/release.ts` does not carry `--notes` yet, so the notes would be silently dropped. Say so and stop.
- `dirty:` is non-zero — the script refuses a dirty tree. Ask what to do; never commit or stash on your own.

## 2. Version

Use `$ARGUMENTS` when it is `patch`, `minor`, or `major`. Otherwise ask with `AskUserQuestion`, recommending what the commits justify: a new capability → `minor`, fixes and polish only → `patch`. While the version is `0.x`, a breaking change is also `minor` — never propose `major` without being asked for it.

```bash
bun run release <type> --dry-run
```

It reports the current and next version without touching anything. Take `<next>` from it.

## 3. Draft the notes

Pick **one to three** highlights from the commit list. Rank by what a user would notice; drop the rest.

One sentence per highlight, written for someone who does not read this repo:

- Name what the user can now do, in the present tense.
- No PR numbers, hashes, file or package names, commit-type prefixes, or internal vocabulary (`Tauri`, `IPC`, `store`, `hook`).
- Under ~120 characters — the notes are read in a narrow panel.

| Instead of | Write |
| :-- | :-- |
| `feat(apps/app): wire the update badge to the updater (#116)` | The app now tells you when a new version is ready to install. |
| `fix: debounce the chat driver reconnect loop` | Chat reconnects cleanly after a dropped connection. |

When the range holds nothing user-visible, write one sentence about the effect anyway ("Faster startup and a steadier window."). Never invent a feature that is not in the commits.

Write them to `/tmp/kiroshi-release-notes-v<next>.md` — outside the repo, so the tree stays clean for the script's own check. One sentence per line, blank line between them. No headings, no bullets, no version number.

## 4. Approve

Show the sentences as written, with the target version and bump type, and name what the release will commit: the five version files and `bun.lock`. Ask with `AskUserQuestion`: publish, rewrite, or cancel. Publish nothing until the answer is publish.

Before publishing, confirm [`apps/app/SMOKE.md`](../../../apps/app/SMOKE.md) has been walked — `README.md` makes it the gate for tagging, and CI cannot run it.

## 5. Publish

From a release branch — the script refuses `main`:

```bash
git checkout -b release/v<next>   # only when on main
bun run release <type> --notes /tmp/kiroshi-release-notes-v<next>.md
```

Then report:

- The tag it published and the CI URL it printed. The Release run publishes the GitHub release once every desktop job is green, and leaves it a **draft** when one is red: re-run the failed jobs of that run, never publish the draft by hand.
- That the version bump still has to reach `main`: hand off to `/git:create` for the release branch. Skipping it leaves `main` on the old version, and the next release recomputes the same tag and fails after rewriting the version files.
