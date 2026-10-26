#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly ARMED_STATE_QUERY='query($id: ID!) { node(id: $id) { ... on PullRequest { autoMergeRequest { enabledAt } isInMergeQueue } } }'

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

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number,id --jq '.[] | "\(.number) \(.id)"')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(cut -d ' ' -f 1 <<<"$open_pull_requests" | paste -sd ' ' -)"
fi
read -r number id <<<"$open_pull_requests"

gh pr merge --auto "$number" --repo "$REPOSITORY"
is_auto_merge_armed=$(gh api graphql -f query="$ARMED_STATE_QUERY" -f id="$id" --jq '.data.node | .autoMergeRequest != null or .isInMergeQueue')
echo "pr-enqueue.sh: PR #$number autoMergeArmed=$is_auto_merge_armed"
if [ "$is_auto_merge_armed" != "true" ]; then
	fail "PR #$number has no auto-merge armed and is not in the merge queue after gh pr merge --auto"
fi
