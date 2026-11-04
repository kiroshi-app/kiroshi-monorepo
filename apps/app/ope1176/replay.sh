#!/bin/bash
set -eu
here=$(cd "$(dirname "$0")" && pwd)
app=$(dirname "$here")
real_home=$HOME
export PATH="$real_home/.bun/bin:$real_home/.cargo/bin:$PATH"
export CARGO_HOME=$real_home/.cargo RUSTUP_HOME=$real_home/.rustup BUN_INSTALL=$real_home/.bun

seeded_replay() {
	local replay_home=${OPE1176_HOME:-/tmp/ope1176-home}
	local profile="$replay_home/Library/Application Support/com.kiroshi.app.dev"
	local out=${OPE1176_OUT:-/tmp/ope1176-replay.log}

	mkdir -p "$replay_home/Library/Application Support"
	bun "$here/seed.ts" "$profile"

	bun "$here/fake-cloud.ts" > "$out.cloud" 2>&1 &
	local cloud=$!
	trap "kill $cloud 2>/dev/null" EXIT INT TERM

	cd "$app"
	HOME=$replay_home KIROSHI_API_URL=http://127.0.0.1:47176 bun run dev 2>&1 | tee "$out"
}

joined_spaces_in() {
	local profile=$1
	local copy
	copy=$(mktemp -d /tmp/ope1176-count.XXXXXX)
	for suffix in "" "-wal" "-shm"; do
		if [ -f "$profile/conversations.sqlite3$suffix" ]; then
			cp "$profile/conversations.sqlite3$suffix" "$copy/"
		fi
	done
	local count=0
	if [ -f "$copy/conversations.sqlite3" ]; then
		count=$(sqlite3 "$copy/conversations.sqlite3" \
			"SELECT COALESCE(MAX(json_array_length(value)), 0) FROM app_settings WHERE key = 'app.joined_spaces';")
	fi
	rm -rf "$copy"
	echo "${count:-0}"
}

other_kiroshi_dev() {
	ps -axo pid=,comm= | awk '{ pid = $1; $1 = ""; sub(/^ /, ""); if ($0 ~ /target\/debug\/Kiroshi$/ || $0 ~ /Kiroshi Dev$/) print pid, $0 }'
	ps -axo pid=,comm=,args= | awk '$2 ~ /(^|\/)node$/ && $0 ~ /\/\.bin\/tauri dev/ { print $1, "tauri dev" }'
	local pid cwd
	for pid in $(ps -axo pid=,comm=,args= | awk '$2 ~ /(^|\/)bun$/ && $0 ~ /bun run dev$/ { print $1 }'); do
		cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
		case "$cwd" in
			*/apps/app) echo "$pid bun run dev (in $cwd)" ;;
		esac
	done
	lsof -nP -iTCP:1420 -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $2, $1, "listens on 1420" }'
}

real_replay() {
	local profile="$real_home/Library/Application Support/com.kiroshi.app.dev"
	local out=/tmp/ope1176-real.log
	local full=/tmp/ope1176-real-terminal.log
	local seconds=${OPE1176_REAL_SECONDS:-1800}

	local running
	running=$(other_kiroshi_dev)
	if [ -n "$running" ]; then
		echo "[ope1176] another Kiroshi Dev or bun dev already runs, nothing launched:"
		echo "$running"
		exit 1
	fi

	local joined
	joined=$(joined_spaces_in "$profile")
	if [ "$joined" -lt 1 ]; then
		echo "[ope1176] the dev profile at $profile has no joined Space: nothing launched."
		exit 1
	fi
	echo "[ope1176] real replay on $profile: $joined joined Space(s), one switch every 5 s for $seconds s, lines in $out"

	: > "$out"
	: > "$full"
	cd "$app"
	set -m
	VITE_OPE1176_DRIVE=1 VITE_OPE1176_DRIVE_ALL=1 bun run dev > "$full" 2>&1 &
	local dev=$!
	set +m
	tail -n +1 -F "$full" 2>/dev/null | grep --line-buffered '\[ope1176' > "$out" &
	local follower=$!
	trap "kill -TERM -- -$dev 2>/dev/null; kill $follower 2>/dev/null" EXIT INT TERM

	sleep "$seconds"
	echo "[ope1176] $seconds s elapsed: stopping Kiroshi Dev"
	kill -TERM -- "-$dev" 2>/dev/null || true
	sleep 5
	kill -KILL -- "-$dev" 2>/dev/null || true
	kill "$follower" 2>/dev/null || true
	trap - EXIT INT TERM
	echo "[ope1176] done: $(wc -l < "$out" | tr -d ' ') lines in $out"
}

case "${1:-}" in
	--real) real_replay ;;
	"") seeded_replay ;;
	*)
		echo "usage: $0 [--real]" >&2
		exit 2
		;;
esac
