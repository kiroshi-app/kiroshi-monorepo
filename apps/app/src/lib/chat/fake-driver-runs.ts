import { isSameRuntimeScope } from "./chat-state"

import type { AgentEvent, ChatMessage, RuntimeScope } from "../agent/contract"

export type FakeRun = {
	scope: RuntimeScope
	sessionId: string | null
	deltaSeq: number
	turnActive: boolean
	waiting: boolean
	streaming: ChatMessage | null
	pendingPermissionId: string | null
	announced: boolean
	queue: Array<() => void>
	timer: ReturnType<typeof setTimeout> | null
}

export type EmitFor = (run: FakeRun, event: AgentEvent) => void

const participantOf = (scope: RuntimeScope) =>
	`${scope.conversationId} ${scope.botId}`

export const createFakeRun = (
	scope: RuntimeScope,
	sessionId: string,
): FakeRun => ({
	scope,
	sessionId,
	deltaSeq: 0,
	turnActive: false,
	waiting: false,
	streaming: null,
	pendingPermissionId: null,
	announced: false,
	queue: [],
	timer: null,
})

export const createFakeRuns = () => {
	const runs = new Map<string, FakeRun>()
	let latest: FakeRun | null = null

	const heldFor = (scope: RuntimeScope) =>
		runs.get(participantOf(scope)) ?? null

	const isForeign = (scope: RuntimeScope) => {
		const held = heldFor(scope)
		return held !== null && !isSameRuntimeScope(scope, held.scope)
	}

	const hold = (run: FakeRun) => {
		runs.set(participantOf(run.scope), run)
		latest = run
	}

	const release = (run: FakeRun) => {
		runs.delete(participantOf(run.scope))
		if (latest === run) {
			latest = null
		}
	}

	const latestScope = () => latest?.scope ?? null

	return { heldFor, isForeign, hold, release, latestScope }
}

export const createRunQueue = (stepMs: number) => {
	const pump = (run: FakeRun) => {
		if (run.timer || run.waiting || run.queue.length === 0) {
			return
		}
		run.timer = setTimeout(() => {
			run.timer = null
			run.queue.shift()?.()
			pump(run)
		}, stepMs)
	}

	const clearQueue = (run: FakeRun) => {
		run.queue = []
		if (run.timer) {
			clearTimeout(run.timer)
			run.timer = null
		}
	}

	return { pump, clearQueue }
}
