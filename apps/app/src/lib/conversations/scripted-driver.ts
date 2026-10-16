import type {
	AgentEvent,
	PermissionDecision,
	QuestionAnswers,
	RuntimeScope,
	SubmittedTurn,
} from "../agent/contract"
import type { ChatDriver } from "../chat/driver"

type Submission = {
	scope: RuntimeScope
	prompt: string
	turn?: SubmittedTurn
}

type Answered = {
	botId: string
	id: string
	answers: QuestionAnswers
}

type Decided = {
	botId: string
	id: string
	decision: PermissionDecision
}

export type ScriptedDriver = ChatDriver & {
	submissions: Submission[]
	pushTo: (botId: string, events: AgentEvent[]) => void
	emit: (scope: RuntimeScope, event: AgentEvent, hostId?: string | null) => void
	cancelled: string[]
	answered: Answered[]
	decided: Decided[]
	shutdowns: string[]
}

export const createScriptedDriver = (): ScriptedDriver => {
	const listeners = new Set<
		(
			scoped: { scope: RuntimeScope; event: AgentEvent },
			hostId?: string | null,
		) => void
	>()
	const submissions: Submission[] = []
	const cancelled: string[] = []
	const answered: Answered[] = []
	const decided: Decided[] = []
	const shutdowns: string[] = []

	const scopeOf = (botId: string) => {
		const last = submissions.findLast(
			(submission) => submission.scope.botId === botId,
		)
		if (!last) {
			throw new Error(`no run was opened for ${botId}`)
		}
		return last.scope
	}

	const emit = (
		scope: RuntimeScope,
		event: AgentEvent,
		hostId: string | null = null,
	) => {
		for (const listener of listeners) {
			listener({ scope, event }, hostId)
		}
	}

	return {
		submissions,
		cancelled,
		answered,
		decided,
		shutdowns,
		emit,
		pushTo: (botId, events) => {
			const scope = scopeOf(botId)
			for (const event of events) {
				emit(scope, event)
			}
		},
		check: () =>
			Promise.resolve({
				connection: "ready",
				binaryVersion: "1",
				authenticated: true,
				error: null,
			}),
		namingFor: () => Promise.resolve(null),
		startOrResumeSession: () => Promise.resolve({ resumed: false }),
		submitPrompt: (scope, prompt, turn) => {
			submissions.push({ scope, prompt, turn })
			return Promise.resolve()
		},
		storeAttachments: () => Promise.resolve([]),
		cancelTurn: (scope) => {
			cancelled.push(scope.botId)
			return Promise.resolve()
		},
		respondToPermission: (scope, id, decision) => {
			decided.push({ botId: scope.botId, id, decision })
			return Promise.resolve()
		},
		answerQuestion: (scope, id, answers) => {
			answered.push({ botId: scope.botId, id, answers })
			return Promise.resolve()
		},
		shutdown: (scope) => {
			shutdowns.push(scope.botId)
			return Promise.resolve()
		},
		pendingQuestions: () => Promise.resolve([]),
		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => listeners.delete(onEvent))
		},
	}
}

export const spoke = (botId: string, text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: {
			id: `msg-${botId}-${text.length}`,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{
		type: "messageDelta",
		id: `msg-${botId}-${text.length}`,
		seq: 1,
		text,
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]
