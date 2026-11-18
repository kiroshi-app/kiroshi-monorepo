#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly PULL_REQUEST_FIELDS='"\(.state) \(.baseRefName) \(.mergeCommit.oid // "-")", .title'

fail() {
	echo "backport.sh: $1" >&2
	exit 1
}

usage() {
	echo "backport.sh: usage: scripts/backport.sh <merged PR number of main> <release/X.Y>" >&2
	exit "$USAGE_ERROR"
}

if [ $# -ne 2 ] || ! [[ "$1" =~ ^[0-9]+$ ]] || [[ "$2" != release/* ]]; then
	usage
fi
readonly number=$1
readonly release=$2
readonly branch="backport/${release#release/}/pr-$number"

pull_request=$(gh pr view "$number" --repo "$REPOSITORY" --json state,baseRefName,mergeCommit,title --jq "$PULL_REQUEST_FIELDS")
read -r state base squash_sha <<<"$(head -n 1 <<<"$pull_request")"
title=$(sed -n 2p <<<"$pull_request")

if [ "$state" != "MERGED" ]; then
	fail "PR #$number is not merged, it is $state"
fi
if [ "$base" != "main" ]; then
	fail "PR #$number was merged into $base, not main"
fi
if ! git ls-remote --exit-code --heads origin "$release" >/dev/null; then
	fail "release branch $release does not exist on origin"
fi
if git show-ref --verify --quiet "refs/heads/$branch" || git ls-remote --exit-code --heads origin "$branch" >/dev/null; then
	fail "branch $branch already exists, PR #$number may already be backported to $release"
fi

git fetch --quiet origin "+refs/heads/main:refs/remotes/origin/main" "+refs/heads/$release:refs/remotes/origin/$release"

worktree=$(mktemp -d)
is_pushed=false
clean_up() {
	git worktree remove --force "$worktree"
	if [ "$is_pushed" != "true" ]; then
		git branch --quiet -D "$branch"
	fi
}
git worktree add --quiet -b "$branch" "$worktree" "origin/$release" || {
	rmdir "$worktree"
	fail "creating $branch from $release failed"
}
trap clean_up EXIT

if ! git -C "$worktree" cherry-pick -x "$squash_sha" >&2; then
	conflicting_files=$(git -C "$worktree" diff --name-only --diff-filter=U)
	git -C "$worktree" cherry-pick --abort
	if [ -n "$conflicting_files" ]; then
		fail "PR #$number conflicts with $release, nothing pushed, conflicting files:
$conflicting_files"
	fi
	fail "cherry-picking $squash_sha of PR #$number onto $release failed, nothing pushed"
fi

git -C "$worktree" push --quiet -u origin "$branch"
is_pushed=true
gh pr create --repo "$REPOSITORY" --base "$release" --head "$branch" --title "$title" --body "Backport of #$number to $release."
