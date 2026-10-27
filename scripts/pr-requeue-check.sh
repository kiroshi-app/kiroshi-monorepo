#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly RUN_LIMIT=100

fail() {
	echo "pr-requeue-check.sh: $1" >&2
	exit 1
}

usage() {
	echo "pr-requeue-check.sh: usage: scripts/pr-requeue-check.sh [<PR number>] [--reason <text>], it reads the PR from the current branch when no number is given" >&2
	exit "$USAGE_ERROR"
}

number=
reason=
while [ $# -gt 0 ]; do
	if [ "$1" = "--reason" ] && [ -z "$reason" ] && [ $# -ge 2 ] && [ -n "${2//[[:space:]]/}" ]; then
		reason=$2
		shift 2
	elif [[ "$1" =~ ^[1-9][0-9]*$ ]] && [ -z "$number" ]; then
		number=$1
		shift
	else
		usage
	fi
done

if [ -z "$number" ]; then
	branch=$(git symbolic-ref --short HEAD)
	if [ "$branch" = "main" ]; then
		fail "refusing to check a PR from main, switch to the branch of the PR or name its number"
	fi
	open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number --jq '.[].number') ||
		fail "gh pr list --head $branch failed"
	if [ -z "$open_pull_requests" ]; then
		fail "branch $branch has no open PR"
	fi
	if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
		fail "branch $branch has several open PRs: $(paste -sd ' ' - <<<"$open_pull_requests")"
	fi
	number=$open_pull_requests
fi

head=$(gh pr view "$number" --repo "$REPOSITORY" --json headRefOid --jq '.headRefOid') ||
	fail "gh pr view $number failed"

pushed_at=$(gh run list --repo "$REPOSITORY" --commit "$head" --limit "$RUN_LIMIT" --json createdAt --jq 'map(.createdAt) | min // empty') ||
	fail "gh run list --commit $head failed"
if [ -z "$pushed_at" ]; then
	exit 0
fi

ejecting_run=$(gh run list --repo "$REPOSITORY" --event merge_group --status failure --limit "$RUN_LIMIT" --json databaseId,headBranch,createdAt \
	--jq "map(select((.headBranch | startswith(\"gh-readonly-queue/main/pr-$number-\")) and .createdAt > \"$pushed_at\")) | .[0].databaseId // empty") ||
	fail "gh run list --event merge_group failed"
if [ -z "$ejecting_run" ]; then
	exit 0
fi

if [ -z "$reason" ]; then
	fail "PR #$number was ejected from the merge queue by run $ejecting_run on its current head $head, push a fix or pass --reason <text> to queue it again"
fi
echo "pr-requeue-check.sh: PR #$number queued again on head $head after run $ejecting_run, reason: $reason"
