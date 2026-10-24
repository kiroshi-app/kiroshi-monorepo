#!/bin/bash
set -euo pipefail

readonly SLOT_DIRECTORY="$HOME/.kiroshi/slots"
readonly CORES_PER_SLOT=3
readonly POLL_SECONDS=1
readonly NOTICE_SECONDS=30
readonly LOCK_BUSY=75
readonly USAGE_ERROR=64

if [ $# -eq 0 ]; then
	echo "slot.sh: usage: scripts/slot.sh command [arguments]" >&2
	exit "$USAGE_ERROR"
fi

if [ ! -d "$SLOT_DIRECTORY" ] || [ -n "${KIROSHI_SLOT:-}" ]; then
	exec "$@"
fi

performance_cores() {
	local levels total=0 level
	levels=$(sysctl -n hw.nperflevels)
	if [ "$levels" -le 1 ]; then
		sysctl -n hw.physicalcpu
		return
	fi
	for ((level = 0; level < levels - 1; level++)); do
		total=$((total + $(sysctl -n "hw.perflevel$level.physicalcpu")))
	done
	echo "$total"
}

slot_count() {
	if [ -z "${KIROSHI_SLOTS:-}" ]; then
		local cores
		cores=$(performance_cores)
		echo $((cores / CORES_PER_SLOT > 1 ? cores / CORES_PER_SLOT : 1))
		return
	fi
	if [[ ! "$KIROSHI_SLOTS" =~ ^[1-9][0-9]*$ ]]; then
		echo "slot.sh: KIROSHI_SLOTS must be a positive integer, got \"$KIROSHI_SLOTS\"" >&2
		exit "$USAGE_ERROR"
	fi
	echo "$KIROSHI_SLOTS"
}

take_slot() {
	local slot="$SLOT_DIRECTORY/$1" status=0
	exec 9>>"$slot"
	lockf -s -t 0 9 || status=$?
	if [ "$status" -eq 0 ]; then
		export KIROSHI_SLOT="$slot"
		return 0
	fi
	exec 9>&-
	if [ "$status" -ne "$LOCK_BUSY" ]; then
		echo "slot.sh: locking $slot failed with exit $status" >&2
		exit "$status"
	fi
	return 1
}

slots=$(slot_count)
started=$SECONDS
next_notice=$started
while true; do
	for ((slot = 1; slot <= slots; slot++)); do
		if take_slot "$slot"; then
			exec "$@"
		fi
	done
	if [ "$SECONDS" -ge "$next_notice" ]; then
		echo "slot.sh: $* waiting for one of $slots slots for $((SECONDS - started))s" >&2
		next_notice=$((next_notice + NOTICE_SECONDS))
	fi
	sleep "$POLL_SECONDS"
done
