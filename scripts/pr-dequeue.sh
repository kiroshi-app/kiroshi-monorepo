#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly STATE_QUERY='query($id: ID!) { node(id: $id) { ... on PullRequest { isMergeQueueEnabled isInMergeQueue autoMergeRequest { enabledAt } } } }'
readonly STATE_FIELDS='.data.node | "\(.isMergeQueueEnabled) \(.isInMergeQueue) \(.autoMergeRequest != null)"'
readonly DEQUEUE_MUTATION='mutation($id: ID!) { dequeuePullRequest(input: {id: $id}) { clientMutationId } }'

fail() {
	echo "pr-dequeue.sh: $1" >&2
	exit 1
}

read_state() {
	local state
	state=$(gh api graphql -f query="$STATE_QUERY" -f id="$id" --jq "$STATE_FIELDS")
	read -r is_queue_on is_in_queue is_auto_merge_armed <<<"$state"
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

read_state
if [ "$is_in_queue" != "true" ] && [ "$is_auto_merge_armed" != "true" ]; then
	if [ "$is_queue_on" = "true" ]; then
		echo "pr-dequeue.sh: PR #$number is not in the merge queue and has no auto-merge armed"
	else
		echo "pr-dequeue.sh: PR #$number has no auto-merge armed"
	fi
	exit 0
fi

if [ "$is_in_queue" = "true" ]; then
	gh api graphql --silent -f query="$DEQUEUE_MUTATION" -f id="$id"
	read_state
fi
if [ "$is_auto_merge_armed" = "true" ]; then
	gh pr merge --disable-auto "$number" --repo "$REPOSITORY"
	read_state
fi

if [ "$is_queue_on" != "true" ]; then
	echo "pr-dequeue.sh: PR #$number autoMergeArmed=$is_auto_merge_armed"
	if [ "$is_auto_merge_armed" != "false" ]; then
		fail "PR #$number still has auto-merge armed after gh pr merge --disable-auto"
	fi
	exit 0
fi

echo "pr-dequeue.sh: PR #$number inQueue=$is_in_queue autoMergeArmed=$is_auto_merge_armed"
if [ "$is_in_queue" != "false" ] || [ "$is_auto_merge_armed" != "false" ]; then
	fail "PR #$number is still in the merge queue or armed for auto-merge"
fi
