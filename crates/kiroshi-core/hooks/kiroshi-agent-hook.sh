#!/bin/bash
set -u

hooks=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

export KIROSHI_AGENT_HOOK="${KIROSHI_AGENT_HOOK:-$hooks/agent-hook.json}"

python3 "$hooks/kiroshi-agent-hook.py" | {
	IFS= read -r url || exit 0
	IFS= read -r key || exit 0
	IFS= read -r delivery_id || exit 0
	IFS= read -r body || exit 0
	printf '%s' "$body" | curl \
		--silent \
		--output /dev/null \
		--max-time 5 \
		--request POST \
		--header "Content-Type: application/json" \
		--header "X-Kiroshi-Delivery: $key" \
		--header "X-Kiroshi-Delivery-Id: $delivery_id" \
		--data-binary @- \
		"$url" ||
		printf 'kiroshi agent hook: the call was not carried\n' >&2
}

exit 0
