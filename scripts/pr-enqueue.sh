#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly STATE_QUERY='query($id: ID!) { node(id: $id) { ... on PullRequest { isMergeQueueEnabled isInMergeQueue autoMergeRequest { enabledAt } } } }'
readonly STATE_FIELDS='.data.node | "\(.isMergeQueueEnabled) \(.isInMergeQueue) \(.autoMergeRequest != null)"'

fail() {
	echo "pr-enqueue.sh: $1" >&2
	exit 1
}

read_state() {
	local state
	state=$(gh api graphql -f query="$STATE_QUERY" -f id="$id" --jq "$STATE_FIELDS")
	read -r is_queue_on is_in_queue is_auto_merge_armed <<<"$state"
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

read_state
if [ "$is_queue_on" != "true" ]; then
	gh pr merge --auto --squash "$number" --repo "$REPOSITORY"
	read_state
	echo "pr-enqueue.sh: PR #$number autoMergeArmed=$is_auto_merge_armed"
	if [ "$is_auto_merge_armed" != "true" ]; then
		fail "PR #$number has no auto-merge armed after gh pr merge --auto --squash"
	fi
	exit 0
fi

if [ "$is_in_queue" != "true" ]; then
	gh pr merge --auto "$number" --repo "$REPOSITORY"
	read_state
fi
echo "pr-enqueue.sh: PR #$number inQueue=$is_in_queue autoMergeArmed=$is_auto_merge_armed"
if [ "$is_in_queue" != "true" ] && [ "$is_auto_merge_armed" != "true" ]; then
	fail "PR #$number is neither in the merge queue nor armed for auto-merge after gh pr merge --auto"
fi
