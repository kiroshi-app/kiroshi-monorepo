#!/bin/bash
set -euo pipefail

readonly REPOSITORY="kiroshi-app/kiroshi-monorepo"
readonly USAGE_ERROR=64
readonly PULL_REQUEST_FIELDS='"\(.state) \(.baseRefName) \(.mergeCommit.oid // "-") \(.mergedAt // "-")", .title'

fail() {
	echo "backport.sh: $1" >&2
	exit 1
}

usage() {
	echo "backport.sh: usage: scripts/backport.sh <merged PR number of main>... <release/X.Y>" >&2
	exit "$USAGE_ERROR"
}

if [ $# -lt 2 ] || [[ "${!#}" != release/* ]]; then
	usage
fi
readonly release=${!#}
requested=("${@:1:$#-1}")
for number in "${requested[@]}"; do
	if ! [[ "$number" =~ ^[0-9]+$ ]]; then
		usage
	fi
done

merge_order=""
for number in "${requested[@]}"; do
	pull_request=$(gh pr view "$number" --repo "$REPOSITORY" --json state,baseRefName,mergeCommit,mergedAt,title --jq "$PULL_REQUEST_FIELDS")
	read -r state base squash_sha merged_at <<<"$(head -n 1 <<<"$pull_request")"
	title=$(sed -n 2p <<<"$pull_request")
	if [ "$state" != "MERGED" ]; then
		fail "PR #$number is not merged, it is $state"
	fi
	if [ "$base" != "main" ]; then
		fail "PR #$number was merged into $base, not main"
	fi
	merge_order+="$merged_at"$'\t'"$number"$'\t'"$squash_sha"$'\t'"$title"$'\n'
done

numbers=()
squash_shas=()
titles=()
while IFS=$'\t' read -r _ number squash_sha title; do
	numbers+=("$number")
	squash_shas+=("$squash_sha")
	titles+=("$title")
done < <(printf '%s' "$merge_order" | sort)

readonly version=${release#release/}
if [ ${#numbers[@]} -eq 1 ]; then
	readonly branch="backport/$version/pr-${numbers[0]}"
	readonly carried="PR #${numbers[0]}"
	readonly pull_request_title=${titles[0]}
	readonly pull_request_body="Backport of #${numbers[0]} to $release."
else
	references=$(printf '#%s, ' "${numbers[@]}")
	references=${references%, }
	readonly branch="backport/$version/pr-$(IFS=-; echo "${numbers[*]}")"
	readonly carried="PRs $references"
	readonly pull_request_title="chore(release): backport $references to $release"
	readonly pull_request_body="Backport of $references to $release, cherry-picked in the order they merged on main:
$(for index in "${!numbers[@]}"; do echo "- #${numbers[$index]} ${titles[$index]}"; done)"
fi

if ! git ls-remote --exit-code --heads origin "$release" >/dev/null; then
	fail "release branch $release does not exist on origin"
fi
if git show-ref --verify --quiet "refs/heads/$branch" || git ls-remote --exit-code --heads origin "$branch" >/dev/null; then
	fail "branch $branch already exists, $carried may already be backported to $release"
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

for index in "${!numbers[@]}"; do
	number=${numbers[$index]}
	squash_sha=${squash_shas[$index]}
	if ! git -C "$worktree" cherry-pick -x "$squash_sha" >&2; then
		conflicting_files=$(git -C "$worktree" diff --name-only --diff-filter=U)
		git -C "$worktree" cherry-pick --abort
		if [ -n "$conflicting_files" ]; then
			fail "PR #$number conflicts with $release, nothing pushed, conflicting files:
$conflicting_files"
		fi
		fail "cherry-picking $squash_sha of PR #$number onto $release failed, nothing pushed"
	fi
done

git -C "$worktree" push --quiet -u origin "$branch"
is_pushed=true
create_pull_request=(gh pr create --repo "$REPOSITORY" --base "$release" --head "$branch" --title "$pull_request_title" --body "$pull_request_body")
if ! "${create_pull_request[@]}"; then
	rerun=$(printf ' %q' "${create_pull_request[@]}")
	fail "pushed $branch to origin but gh pr create failed, open its PR with:${rerun}"
fi
