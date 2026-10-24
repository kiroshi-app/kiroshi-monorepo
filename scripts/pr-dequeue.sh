#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly QUEUE_STATE_QUERY='query($id: ID!) { node(id: $id) { ... on PullRequest { isInMergeQueue } } }'
readonly DEQUEUE_MUTATION='mutation($id: ID!) { dequeuePullRequest(input: {id: $id}) { clientMutationId } }'

fail() {
	echo "pr-dequeue.sh: $1" >&2
	exit 1
}

queue_state() {
	gh api graphql -f query="$QUEUE_STATE_QUERY" -f id="$1" --jq '.data.node.isInMergeQueue'
}

if [ $# -ne 0 ]; then
	echo "pr-dequeue.sh: usage: scripts/pr-dequeue.sh, it reads the PR from the current branch" >&2
	exit "$USAGE_ERROR"
fi

branch=$(git symbolic-ref --short HEAD)
if [ "$branch" = "main" ]; then
	fail "refusing to dequeue from main, switch to the branch of the PR"
fi

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number,id --jq '.[] | "\(.number) \(.id)"')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(cut -d ' ' -f 1 <<<"$open_pull_requests" | paste -sd ' ' -)"
fi
read -r number id <<<"$open_pull_requests"

if [ "$(queue_state "$id")" != "true" ]; then
	echo "pr-dequeue.sh: PR #$number is not queued"
	exit 0
fi

gh api graphql -f query="$DEQUEUE_MUTATION" -f id="$id" >/dev/null
is_in_merge_queue=$(queue_state "$id")
echo "pr-dequeue.sh: PR #$number isInMergeQueue=$is_in_merge_queue"
if [ "$is_in_merge_queue" != "false" ]; then
	fail "PR #$number is still in the merge queue"
fi
