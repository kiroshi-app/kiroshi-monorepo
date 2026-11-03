import type { UUID } from "node:crypto"

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import { asAsyncIterable, yielded } from "../../async-iterable"

const UUID_SHAPE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = (value: string | undefined): value is UUID =>
	value !== undefined && UUID_SHAPE.test(value)

const asUserMessage = (text: string, uuid?: string): SDKUserMessage => ({
	type: "user",
	message: { role: "user", content: [{ type: "text", text }] },
	parent_tool_use_id: null,
	...(isUuid(uuid) ? { uuid } : {}),
})

export const createPromptStream = () => {
	const queued: SDKUserMessage[] = []
	let wake: (() => void) | undefined
	let ended = false

	const release = () => {
		wake?.()
		wake = undefined
	}

	const next = async (): Promise<IteratorResult<SDKUserMessage>> => {
		while (queued.length === 0 && !ended) {
			await new Promise<void>((resolve) => {
				wake = resolve
			})
		}
		return yielded(queued.shift())
	}

	return {
		push: (text: string, uuid?: string) => {
			queued.push(asUserMessage(text, uuid))
			release()
		},
		end: () => {
			ended = true
			release()
		},
		stream: asAsyncIterable(next),
	}
}
