#!/bin/bash
set -uo pipefail

readonly GUI_DOMAIN="gui/$(id -u)"
readonly UNUSED_SERVICES=(
	"$GUI_DOMAIN/com.apple.campo"
	"$GUI_DOMAIN/com.apple.siriactionsd"
	"$GUI_DOMAIN/com.apple.siriinferenced"
	"$GUI_DOMAIN/com.apple.assistantd"
	"$GUI_DOMAIN/com.apple.intelligenceplatformd"
	"$GUI_DOMAIN/com.apple.corespotlightd"
	"$GUI_DOMAIN/com.apple.linkd"
	"$GUI_DOMAIN/com.apple.triald"
	"$GUI_DOMAIN/com.apple.cloudd"
	"$GUI_DOMAIN/com.apple.mediaanalysisd"
	"$GUI_DOMAIN/com.apple.amsengagementd"
	"system/com.apple.softwareupdated"
)

print_host_load() {
	echo "--- host $1"
	top -l 1 -n 0 | grep -E '^(Processes|Load Avg|PhysMem):'
}

print_host_load "before"

if ! sudo mdutil -a -i off; then
	echo "::warning::Couldn't turn Spotlight indexing off, it keeps indexing"
fi

for service in "${UNUSED_SERVICES[@]}"; do
	if ! sudo launchctl bootout "$service"; then
		echo "::warning::Couldn't stop $service, it keeps running"
	fi
done

print_host_load "after"
