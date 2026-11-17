#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly PULL_REQUEST_STATE='[.statusCheckRollup[]
		| {name: (.name // .context), outcome: (if (.conclusion // "") != "" then .conclusion else (.state // .status) end)}] as $checks
	| "\(.baseRefName) \(.headRefOid) \(.mergeable)",
	([$checks[] | select(.outcome | IN("SUCCESS", "NEUTRAL", "SKIPPED") | not) | "\(.name) (\(.outcome))"] | join(", ")),
	"\(any($checks[]; .outcome == "SUCCESS")) \(any($checks[]; .name == "verify" and .outcome == "SUCCESS"))"'

fail() {
	echo "pr-merge-integration.sh: $1" >&2
	exit 1
}

if [ $# -ne 0 ]; then
	echo "pr-merge-integration.sh: usage: scripts/pr-merge-integration.sh, it reads the PR from the current branch" >&2
	exit "$USAGE_ERROR"
fi

branch=$(git symbolic-ref --short HEAD)
if [ "$branch" = "main" ]; then
	fail "refusing to merge from main, switch to the branch of the PR"
fi

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number --jq '.[].number')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(paste -sd ' ' - <<<"$open_pull_requests")"
fi
number=$open_pull_requests

pull_request=$(gh pr view "$number" --repo "$REPOSITORY" --json baseRefName,headRefOid,mergeable,statusCheckRollup --jq "$PULL_REQUEST_STATE")
read -r base head_sha mergeable <<<"$(head -n 1 <<<"$pull_request")"
checks_not_passing=$(sed -n 2p <<<"$pull_request")
read -r has_succeeded_check has_passed_fast_gate <<<"$(sed -n 3p <<<"$pull_request")"

case "$base" in
feature/*) ;;
*) fail "PR #$number targets $base, not a feature/* integration branch, run scripts/pr-enqueue.sh instead" ;;
esac
if [ -n "$checks_not_passing" ]; then
	fail "PR #$number has checks not passing: $checks_not_passing"
fi
if [ "$has_succeeded_check" != "true" ]; then
	fail "PR #$number has no check that succeeded on its head commit, CI did not run: $base may predate the feature/** pull_request trigger of ci.yml"
fi
if [ "$has_passed_fast_gate" != "true" ]; then
	fail "PR #$number did not pass the fast gate into $base: verify did not succeed on its head commit"
fi
if [ "$mergeable" = "CONFLICTING" ]; then
	fail "PR #$number conflicts with $base, rebase it first"
fi

gh pr merge "$number" --repo "$REPOSITORY" --squash --match-head-commit "$head_sha"
state=$(gh pr view "$number" --repo "$REPOSITORY" --json state --jq '.state')
if [ "$state" != "MERGED" ]; then
	fail "PR #$number is $state after gh pr merge --squash"
fi
echo "pr-merge-integration.sh: PR #$number merged into $base"
