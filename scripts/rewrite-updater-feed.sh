#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly ASSET_NAME='
def asset_name($url):
	if ($url | startswith($api)) then
		($url | ltrimstr($api)) as $id | first($assets[] | select((.id | tostring) == $id) | .name) // null
	elif ($url | startswith($download)) then
		($url | ltrimstr($download)) as $encoded | first($assets[] | select((.name | @uri) == $encoded) | .name) // null
	else null end;
'

fail() {
	echo "rewrite-updater-feed.sh: $1" >&2
	exit 1
}

if [ $# -ne 3 ]; then
	echo "rewrite-updater-feed.sh: usage: scripts/rewrite-updater-feed.sh <owner/repo> <release id> <latest.json>, it prints the feed with every platform url on the download address of that release" >&2
	exit "$USAGE_ERROR"
fi

repository=$1
release_id=$2
feed=$3

tag=$(gh api "repos/$repository/releases/$release_id" --jq .tag_name)
assets=$(gh api --paginate "repos/$repository/releases/$release_id/assets?per_page=100" --jq '.[] | {id, name}' | jq -s .)
api="https://api.github.com/repos/$repository/releases/assets/"
download="https://github.com/$repository/releases/download/$tag/"

absent=$(jq -r --argjson assets "$assets" --arg api "$api" --arg download "$download" "$ASSET_NAME"'
	.platforms | to_entries[] | select(asset_name(.value.url) == null) | "platform \(.key) names asset \(.value.url)"
' "$feed")
if [ -n "$absent" ]; then
	fail "release $tag has no asset for: $(paste -sd ';' - <<<"$absent" | sed 's/;/; /g')"
fi

jq -j --argjson assets "$assets" --arg api "$api" --arg download "$download" "$ASSET_NAME"'
	.platforms |= map_values(.url = $download + (asset_name(.url) | @uri))
' "$feed"
