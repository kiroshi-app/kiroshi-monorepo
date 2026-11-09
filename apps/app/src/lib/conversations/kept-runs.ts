import { keyOf } from "./foreign-turns"

import type { AgentEvent, RuntimeScope } from "../agent/contract"
import { isTurnBusy } from "../chat/chat-state"

type KeptRun = {
	scope: RuntimeScope
	questionIds: Set<string>
	isStreaming: boolean
}

export type KeptRuns = {
	keep: (scope: RuntimeScope, questionId: string, isStreaming: boolean) => void
	hear: (scope: RuntimeScope, event: AgentEvent) => void
	settle: (scope: RuntimeScope, questionId: string) => void
	isKeeping: (scope: RuntimeScope) => boolean
	ride: (conversationId: string, botId: string) => RuntimeScope | null
	releaseWhere: (isGone: (scope: RuntimeScope) => boolean) => Promise<void>
}

const isStreamingEvent = (event: AgentEvent) =>
	event.type === "messageStarted" ||
	event.type === "messageDelta" ||
	event.type === "activity" ||
	(event.type === "turnChanged" && isTurnBusy(event.state))

export const createKeptRuns = (
	release: (scope: RuntimeScope) => Promise<void>,
): KeptRuns => {
	const runs = new Map<string, KeptRun>()
	const settledIds = new Set<string>()

	const releaseOnceIdle = (run: KeptRun) => {
		if (run.isStreaming || run.questionIds.size > 0) {
			return
		}
		runs.delete(keyOf(run.scope))
		void release(run.scope)
	}

	const keep = (
		scope: RuntimeScope,
		questionId: string,
		isStreaming: boolean,
	) => {
		const key = keyOf(scope)
		const run = runs.get(key) ?? { scope, questionIds: new Set(), isStreaming }
		if (settledIds.has(questionId) || run.questionIds.has(questionId)) {
			return
		}
		run.questionIds.add(questionId)
		run.isStreaming ||= isStreaming
		runs.set(key, run)
	}

	const settle = (scope: RuntimeScope, questionId: string) => {
		settledIds.add(questionId)
		const run = runs.get(keyOf(scope))
		if (!run) {
			return
		}
		run.questionIds.delete(questionId)
		releaseOnceIdle(run)
	}

	const endStreaming = (run: KeptRun) => {
		run.isStreaming = false
		releaseOnceIdle(run)
	}

	const hear = (scope: RuntimeScope, event: AgentEvent) => {
		const run = runs.get(keyOf(scope))
		if (!run) {
			return
		}
		if (isStreamingEvent(event)) {
			run.isStreaming = true
			return
		}
		switch (event.type) {
			case "permissionResolved":
				return settle(scope, event.id)
			case "turnEnded":
			case "failed":
				return endStreaming(run)
			default:
				return
		}
	}

	const ride = (conversationId: string, botId: string) => {
		const run = [...runs.values()].find(
			({ scope }) =>
				scope.conversationId === conversationId && scope.botId === botId,
		)
		if (!run) {
			return null
		}
		runs.delete(keyOf(run.scope))
		return run.scope
	}

	const releaseWhere = async (isGone: (scope: RuntimeScope) => boolean) => {
		const gone = [...runs.values()].filter(({ scope }) => isGone(scope))
		for (const { scope } of gone) {
			runs.delete(keyOf(scope))
		}
		await Promise.all(gone.map(({ scope }) => release(scope)))
	}

	const isKeeping = (scope: RuntimeScope) => runs.has(keyOf(scope))

	return { keep, hear, settle, isKeeping, ride, releaseWhere }
}
