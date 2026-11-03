#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly ARMED_STATE_QUERY='query($id: ID!) { node(id: $id) { ... on PullRequest { autoMergeRequest { enabledAt } } } }'

fail() {
	echo "pr-dequeue.sh: $1" >&2
	exit 1
}

auto_merge_state() {
	gh api graphql -f query="$ARMED_STATE_QUERY" -f id="$1" --jq '.data.node.autoMergeRequest != null'
}

if [ $# -ne 0 ]; then
	echo "pr-dequeue.sh: usage: scripts/pr-dequeue.sh, it reads the PR from the current branch" >&2
	exit "$USAGE_ERROR"
fi

branch=$(git symbolic-ref --short HEAD)
if [ "$branch" = "main" ]; then
	fail "refusing to disarm auto-merge from main, switch to the branch of the PR"
fi

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number,id --jq '.[] | "\(.number) \(.id)"')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(cut -d ' ' -f 1 <<<"$open_pull_requests" | paste -sd ' ' -)"
fi
read -r number id <<<"$open_pull_requests"

if [ "$(auto_merge_state "$id")" != "true" ]; then
	echo "pr-dequeue.sh: PR #$number has no auto-merge armed"
	exit 0
fi

gh pr merge --disable-auto "$number" --repo "$REPOSITORY"
is_auto_merge_armed=$(auto_merge_state "$id")
echo "pr-dequeue.sh: PR #$number autoMergeArmed=$is_auto_merge_armed"
if [ "$is_auto_merge_armed" != "false" ]; then
	fail "PR #$number still has auto-merge armed after gh pr merge --disable-auto"
fi
