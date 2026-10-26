#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64

fail() {
	echo "pr-enqueue.sh: $1" >&2
	exit 1
}

if [ $# -ne 0 ]; then
	echo "pr-enqueue.sh: usage: scripts/pr-enqueue.sh, it reads the PR from the current branch" >&2
	exit "$USAGE_ERROR"
fi

branch=$(git symbolic-ref --short HEAD)
if [ "$branch" = "main" ]; then
	fail "refusing to arm auto-merge from main, switch to the branch of the PR"
fi

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number --jq '.[].number')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(paste -sd ' ' - <<<"$open_pull_requests")"
fi
number=$open_pull_requests

gh pr merge --auto "$number" --repo "$REPOSITORY"
is_auto_merge_armed=$(gh pr view "$number" --repo "$REPOSITORY" --json autoMergeRequest --jq '.autoMergeRequest != null')
echo "pr-enqueue.sh: PR #$number autoMergeArmed=$is_auto_merge_armed"
if [ "$is_auto_merge_armed" != "true" ]; then
	fail "PR #$number has no auto-merge armed after gh pr merge --auto"
fi
