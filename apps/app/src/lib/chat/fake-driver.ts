import type { ChatDriver } from "./driver"
import {
	createFakeRun,
	createFakeRuns,
	createRunQueue,
	type FakeRun,
} from "./fake-driver-runs"
import { FAKE_STATELESS_METHODS } from "./fake-driver-stateless"
import {
	createFinishTurn,
	createTurnSteps,
	defaultReply,
} from "./fake-driver-turn"

import type {
	AgentEvent,
	PermissionDecision,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"

export type FakeChatDriver = ChatDriver & {
	pushEvent: (event: AgentEvent, scope?: RuntimeScope | null) => void
}

export type FakeChatDriverOptions = {
	stepMs?: number
	replyFor?: (prompt: string) => string
}

const FAKE_COMMANDS = [
	{ name: "clear", description: "Start a fresh conversation" },
	{ name: "compact", description: "Summarise the thread and free the context" },
	{ name: "cost", description: "Show what this session has spent so far" },
	{ name: "init", description: "Write a CLAUDE.md for this repository" },
	{ name: "review", description: "Review the pending changes on this branch" },
	{
		name: "status",
		description: "Report the session's model, mode and account",
	},
]

export function createFakeChatDriver(
	options: FakeChatDriverOptions = {},
): FakeChatDriver {
	const listeners = new Set<(event: ScopedEvent) => void>()
	const { heldFor, isForeign, hold, release, latestScope } = createFakeRuns()
	const { pump, clearQueue } = createRunQueue(options.stepMs ?? 120)
	let sessionSeq = 0

	const emit = (
		event: AgentEvent,
		scope: RuntimeScope | null = latestScope(),
	) => {
		for (const listener of listeners) {
			listener({ scope, event })
		}
	}

	const emitFor = (run: FakeRun, event: AgentEvent) => emit(event, run.scope)

	const finishTurn = createFinishTurn(emitFor)

	const buildTurnSteps = createTurnSteps({
		emitFor,
		finishTurn,
		replyFor: options.replyFor ?? defaultReply,
	})

	const refuseStale = (scope: RuntimeScope) =>
		Promise.reject({
			kind: "staleRuntimeSession",
			runtimeSessionId: scope.runtimeSessionId,
		})

	const resolvePermission = (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => {
		if (isForeign(scope)) {
			return refuseStale(scope)
		}
		const run = heldFor(scope)
		if (run?.pendingPermissionId !== id) {
			return Promise.reject({ kind: "unknownPermission", id })
		}
		run.pendingPermissionId = null
		emitFor(run, { type: "permissionResolved", id, decision })
		if (decision === "deny") {
			clearQueue(run)
			finishTurn(run, "cancelled")
			return Promise.resolve()
		}
		run.waiting = false
		pump(run)
		return Promise.resolve()
	}

	return {
		...FAKE_STATELESS_METHODS,

		startOrResumeSession: (scope: RuntimeScope, resume?: string) => {
			const replaced = heldFor(scope)
			if (replaced) {
				clearQueue(replaced)
			}
			sessionSeq += 1
			const run = createFakeRun(scope, resume ?? `fake-session-${sessionSeq}`)
			hold(run)
			emitFor(run, { type: "connectionChanged", state: "ready" })
			emitFor(run, { type: "commandsListed", commands: FAKE_COMMANDS })
			return Promise.resolve({ resumed: Boolean(resume) })
		},

		submitPrompt: (scope: RuntimeScope, text: string) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run?.sessionId) {
				return Promise.reject({ kind: "notStarted" })
			}
			if (run.turnActive) {
				return Promise.reject({ kind: "turnAlreadyRunning" })
			}
			run.turnActive = true
			if (!run.announced) {
				run.announced = true
				emitFor(run, {
					type: "sessionReady",
					sessionId: run.sessionId,
					resumed: false,
				})
			}
			run.queue.push(...buildTurnSteps(run, text))
			pump(run)
			return Promise.resolve()
		},

		cancelTurn: (scope: RuntimeScope) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run?.turnActive) {
				return Promise.resolve({ kind: "nothingToCancel" })
			}
			clearQueue(run)
			emitFor(run, { type: "turnChanged", state: "stopping" })
			finishTurn(run, "cancelled")
			return Promise.resolve({ kind: "cancelled" })
		},

		respondToPermission: resolvePermission,

		answerQuestion: (scope: RuntimeScope, id: string) =>
			resolvePermission(scope, id, "allowOnce"),

		shutdown: (scope: RuntimeScope) => {
			if (isForeign(scope)) {
				return refuseStale(scope)
			}
			const run = heldFor(scope)
			if (!run) {
				return Promise.resolve()
			}
			clearQueue(run)
			if (run.turnActive) {
				finishTurn(run, "cancelled")
			}
			release(run)
			return Promise.resolve()
		},

		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => {
				listeners.delete(onEvent)
			})
		},

		pushEvent: emit,
	}
}
