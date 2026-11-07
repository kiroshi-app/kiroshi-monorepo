#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly PULL_REQUEST_FIELDS="baseRefName,headRefOid,isDraft,mergeable,changedFiles,statusCheckRollup"
readonly PULL_REQUEST_SUMMARY='([.baseRefName, .headRefOid, .isDraft, .mergeable, .changedFiles, (.statusCheckRollup | length)] | map(tostring) | join("\t")),
(.statusCheckRollup[]
	| {name: (.name // .context), status: (.status // .state // ""), conclusion: (.conclusion // .state // "")}
	| select(.conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")
	| "\(.name) status=\(.status) conclusion=\(.conclusion)")'
readonly CHANGED_FILE_PATHS='.[] | "\(.filename)\t\(.previous_filename // "")"'
readonly ROOTED_DIRECTORY='^/[^*?[]+/$'
readonly ROOTED_FILE='^/[^*?[]*[^*?[/]$'
readonly DOUBLE_STAR_FILE='^\*\*/[^*?[/]+$'

fail() {
	echo "pr-merge-sub.sh: $1" >&2
	exit 1
}

fail_listing() {
	{
		echo "pr-merge-sub.sh: $1"
		sed 's/^/  /' <<<"$2"
	} >&2
	exit 1
}

owns() {
	local pattern=$1 path=$2
	if [[ $pattern =~ $ROOTED_DIRECTORY ]]; then
		[[ "/$path" == "$pattern"* ]]
	elif [[ $pattern =~ $ROOTED_FILE ]]; then
		[[ "/$path" == "$pattern" ]]
	else
		[[ "${path##*/}" == "${pattern#\*\*/}" ]]
	fi
}

owner_pattern_of() {
	local path=$1 pattern
	while read -r pattern; do
		if owns "$pattern" "$path"; then
			echo "$pattern"
			return
		fi
	done <<<"$owner_patterns"
}

if [ $# -ne 0 ]; then
	echo "pr-merge-sub.sh: usage: scripts/pr-merge-sub.sh, it reads the PR from the current branch" >&2
	exit "$USAGE_ERROR"
fi

branch=$(git symbolic-ref --short HEAD)

open_pull_requests=$(gh pr list --repo "$REPOSITORY" --head "$branch" --state open --json number --jq '.[].number')
if [ -z "$open_pull_requests" ]; then
	fail "branch $branch has no open PR"
fi
if [ "$(wc -l <<<"$open_pull_requests")" -gt 1 ]; then
	fail "branch $branch has several open PRs: $(paste -sd ' ' - <<<"$open_pull_requests")"
fi
number=$open_pull_requests

pull_request=$(gh pr view "$number" --repo "$REPOSITORY" --json "$PULL_REQUEST_FIELDS" --jq "$PULL_REQUEST_SUMMARY")
read -r base head_sha is_draft mergeable changed_file_count check_count <<<"$(head -n 1 <<<"$pull_request")"
offending_checks=$(tail -n +2 <<<"$pull_request")

if [ "$base" = "main" ]; then
	fail "PR #$number targets main, which merges only through scripts/pr-enqueue.sh"
fi
if [ "$is_draft" = "true" ]; then
	fail "PR #$number is a draft"
fi
if [ "$mergeable" = "CONFLICTING" ]; then
	fail "PR #$number conflicts with its base $base"
fi
if [ "$check_count" -eq 0 ]; then
	fail "PR #$number has no check on its head $head_sha"
fi
if [ -n "$offending_checks" ]; then
	fail_listing "PR #$number has checks that are not green on its head $head_sha:" "$offending_checks"
fi

owner_patterns=$(gh api --method GET "repos/$REPOSITORY/contents/.github/CODEOWNERS" -f ref="$base" -H "Accept: application/vnd.github.raw+json" | awk '$1 !~ /^#/ && NF { print $1 }')
while read -r pattern; do
	if [ -n "$pattern" ] && ! [[ $pattern =~ $ROOTED_DIRECTORY || $pattern =~ $ROOTED_FILE || $pattern =~ $DOUBLE_STAR_FILE ]]; then
		fail "CODEOWNERS pattern $pattern on $base has a shape this script cannot match"
	fi
done <<<"$owner_patterns"

changed_files=$(gh api --paginate "repos/$REPOSITORY/pulls/$number/files" --jq "$CHANGED_FILE_PATHS")
listed_file_count=0
owned_files=""
while IFS=$'\t' read -r filename previous_filename; do
	if [ -z "$filename" ]; then
		continue
	fi
	listed_file_count=$((listed_file_count + 1))
	for path in "$filename" "$previous_filename"; do
		if [ -z "$path" ]; then
			continue
		fi
		pattern=$(owner_pattern_of "$path")
		if [ -n "$pattern" ]; then
			owned_files+="$path matches $pattern"$'\n'
		fi
	done
done <<<"$changed_files"

if [ "$listed_file_count" -ne "$changed_file_count" ]; then
	fail "PR #$number lists $listed_file_count of its $changed_file_count changed files, the rest cannot be checked against CODEOWNERS"
fi
if [ -n "$owned_files" ]; then
	fail_listing "PR #$number changes files owned in .github/CODEOWNERS, they need a review:" "${owned_files%$'\n'}"
fi

gh pr merge "$number" --repo "$REPOSITORY" --squash --match-head-commit "$head_sha"
is_merged=$(gh pr view "$number" --repo "$REPOSITORY" --json mergedAt --jq '.mergedAt != null')
echo "pr-merge-sub.sh: PR #$number base=$base merged=$is_merged"
if [ "$is_merged" != "true" ]; then
	fail "PR #$number is not merged after gh pr merge --squash"
fi
