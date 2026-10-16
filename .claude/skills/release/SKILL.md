---
name: release
description: Publish a Kiroshi release end to end, stable or beta. Preview the release notes git-cliff will generate, pick the version, and run `bun run release`.
when_to_use: When shipping a new Kiroshi version, "release", "publish a release", "ship the next version", "cut a patch/minor/major", "cut a beta". Not for writing a changelog without publishing, and not for opening a plain pull request: use /git:create.
argument-hint: "[patch|minor|major|beta|X.Y.Z|X.Y.Z-beta.N]"
disable-model-invocation: true
allowed-tools: Bash, Read, AskUserQuestion
---

# Release Kiroshi

This skill calls `scripts/release.ts`. It never edits that script, `cliff.toml` or `.github/workflows/`.

The release body is not written here. `.github/workflows/release.yml` generates it with git-cliff from the squash-merged PR titles of the tag's range. This skill only previews it.

## 1. Preflight

One call:

```bash
git fetch --quiet --tags origin
echo "branch:  $(git rev-parse --abbrev-ref HEAD)"
echo "dirty:   $(git status --porcelain | wc -l)"
echo "current: $(grep -m1 '"version"' apps/app/src-tauri/tauri.conf.json)"
git tag --list 'v*' --sort=-creatordate | head -5
```

Stop, and publish nothing, when `dirty:` is non-zero: the script refuses a dirty tree. Ask what to do; never commit or stash on your own.

## 2. Version

The channel and the version come from `$ARGUMENTS`, or from the request:

- `patch`, `minor`, `major`: a stable bump. Refused by the script when `current` carries `-beta.N`: then the stable version is explicit, `X.Y.Z`, usually the `X.Y.Z` of the current beta.
- `beta`, or the person asks for a beta: always an explicit `X.Y.Z-beta.N`.
  - From a beta current `X.Y.Z-beta.N`: `X.Y.Z-beta.<N+1>`.
  - From a stable current: `X.Y.Z` is the stable bump the commits justify, then `-beta.1`, or one past the highest `vX.Y.Z-beta.N` tag already listed.
- An explicit `X.Y.Z` or `X.Y.Z-beta.N`: taken as given.

When nothing says which, ask with `AskUserQuestion`, recommending what the commits justify: a new capability is `minor`, fixes and polish only are `patch`. While the version is `0.x`, a breaking change is also `minor`: never propose `major` without being asked for it.

```bash
bun run release <type-or-version> --dry-run
```

It reports the current and next version and the tag, without touching anything. Take `<next>` from it.

## 3. Preview the notes

The range is the one `release.yml` computes, from the most recently created tag of the channel to the tag about to be cut. That tag does not exist yet, so the end of the range is `HEAD`: the release commit the script adds on top is left out of the body anyway.

- Stable `<next>`: from the previous stable tag, betas skipped.
- Beta `<next>`: from the previous tag of either channel.

```bash
STABLE='^v[0-9]+[.][0-9]+[.][0-9]+$'
BETA='^v[0-9]+[.][0-9]+[.][0-9]+-beta[.][0-9]+$'
PREVIOUS=$(git tag --list 'v*' --sort=-creatordate | grep -E -m1 "$STABLE")     # stable <next>
PREVIOUS=$(git tag --list 'v*' --sort=-creatordate | grep -E -m1 "$STABLE|$BETA") # beta <next>
echo "range: $PREVIOUS..HEAD"
bunx git-cliff@2.14.2 --config cliff.toml "$PREVIOUS..HEAD"
```

Run only the `PREVIOUS=` line of the channel. `git-cliff@2.14.2` is the version `release.yml` pins.

An empty preview means the release goes out with the line `See the assets to download and install this version.` Say so before asking to publish.

## 4. Approve

Show the preview as printed, with the target version, the channel and the bump type, and name what the release will commit: the five version files and `bun.lock`. Ask with `AskUserQuestion`: publish or cancel. Publish nothing until the answer is publish.

The body is built from the PR titles and is not edited here: when a line reads badly, cancel and say which title it comes from.

Before publishing, confirm [`apps/app/SMOKE.md`](../../../apps/app/SMOKE.md) has been walked: `README.md` makes it the gate for tagging, and CI cannot run it.

## 5. Publish

From a release branch, the script refuses `main`:

```bash
git checkout -b release/v<next>   # only when on main
bun run release <type-or-version>
```

Then report:

- The tag it published and the CI URL it printed. The Release run publishes the GitHub release once every desktop job is green, and leaves it a **draft** when one is red: re-run the failed jobs of that run, never publish the draft by hand.
- For a beta: the release is a pre-release, never the latest, and its `latest.json` is mirrored on the `beta` release that the beta channel polls.
- That a `whats-new.png` asset, when there is one, is added by hand to the published release: the pipeline attaches no visual.
- That the version bump still has to reach `main`: hand off to `/git:create` for the release branch. Skipping it leaves `main` on the old version, and the next release recomputes the same tag and fails after rewriting the version files.
