import { keyOf } from "./foreign-turns"

import type { AgentEvent, RuntimeScope } from "../agent/contract"
import { isTurnBusy } from "../chat/chat-state"

export const KEPT_RUN_GRACE_MS = 30_000

type KeptRun = {
	scope: RuntimeScope
	questionIds: Set<string>
	settledIds: Set<string>
	isStreaming: boolean
	grace: ReturnType<typeof setTimeout> | null
}

export type KeptRuns = {
	keep: (scope: RuntimeScope, questionId: string) => void
	linger: (scope: RuntimeScope) => void
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

	const track = (scope: RuntimeScope): KeptRun => {
		const run: KeptRun = {
			scope,
			questionIds: new Set(),
			settledIds: new Set(),
			isStreaming: false,
			grace: null,
		}
		runs.set(keyOf(scope), run)
		return run
	}

	const endGrace = (run: KeptRun) => {
		clearTimeout(run.grace ?? undefined)
		run.grace = null
	}

	const drop = (run: KeptRun) => {
		endGrace(run)
		runs.delete(keyOf(run.scope))
	}

	const releaseOnceIdle = (run: KeptRun) => {
		if (run.grace || run.isStreaming || run.questionIds.size > 0) {
			return
		}
		drop(run)
		void release(run.scope)
	}

	const ask = (run: KeptRun, questionId: string) => {
		if (run.settledIds.has(questionId)) {
			return
		}
		endGrace(run)
		run.questionIds.add(questionId)
	}

	const keep = (scope: RuntimeScope, questionId: string) => {
		ask(track(scope), questionId)
	}

	const linger = (scope: RuntimeScope) => {
		const run = track(scope)
		run.grace = setTimeout(() => {
			run.grace = null
			releaseOnceIdle(run)
		}, KEPT_RUN_GRACE_MS)
	}

	const settle = (scope: RuntimeScope, questionId: string) => {
		const run = runs.get(keyOf(scope))
		if (!run) {
			return
		}
		run.settledIds.add(questionId)
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
			case "questionRequested":
				run.isStreaming = true
				return ask(run, event.request.id)
			case "permissionResolved":
				return settle(scope, event.id)
			case "turnEnded":
			case "failed":
				return endStreaming(run)
			default:
				return
		}
	}

	const isKeeping = (scope: RuntimeScope) => runs.has(keyOf(scope))

	const ride = (conversationId: string, botId: string) => {
		const run = [...runs.values()].find(
			({ scope }) =>
				scope.conversationId === conversationId && scope.botId === botId,
		)
		if (!run) {
			return null
		}
		drop(run)
		return run.scope
	}

	const releaseWhere = async (isGone: (scope: RuntimeScope) => boolean) => {
		const gone = [...runs.values()].filter(({ scope }) => isGone(scope))
		gone.forEach(drop)
		await Promise.all(gone.map(({ scope }) => release(scope)))
	}

	return { keep, linger, hear, settle, isKeeping, ride, releaseWhere }
}
