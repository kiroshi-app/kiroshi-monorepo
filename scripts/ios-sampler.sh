#!/bin/bash
set -uo pipefail

readonly SIMULATOR="$1"
readonly INTERVAL_SECONDS=30

while true; do
	echo "=== sample $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	echo "--- runner top"
	top -l 2 -s 1 -o cpu -n 15 -stats pid,command,cpu,time,mem | awk '/^Processes:/ { sample++ } sample == 2'
	echo "--- simulator processes"
	xcrun simctl spawn "$SIMULATOR" launchctl list | awk 'NR == 1 || $1 != "-"'
	sleep "$INTERVAL_SECONDS"
done
