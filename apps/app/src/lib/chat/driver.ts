import type { SubmittedAttachment } from "./attachments-contract"

import type {
	CancelOutcome,
	CheckReport,
	ConversationNaming,
	PermissionDecision,
	QuestionAnswers,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
	SubmittedTurn,
} from "../agent/contract"

type ChatDriverUnsubscribe = () => void

export type ChatDriver = {
	check: (scope: RuntimeScope | null) => Promise<CheckReport>
	namingFor: (text: string) => Promise<ConversationNaming | null>
	startOrResumeSession: (
		scope: RuntimeScope,
		resume?: string,
		cwd?: string,
		outputSchema?: Record<string, unknown>,
	) => Promise<SessionHandle>
	submitPrompt: (
		scope: RuntimeScope,
		text: string,
		turn?: SubmittedTurn,
	) => Promise<void>
	storeAttachments: (
		conversationId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	cancelTurn: (scope: RuntimeScope) => Promise<CancelOutcome>
	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => Promise<void>
	answerQuestion: (
		scope: RuntimeScope,
		id: string,
		answers: QuestionAnswers,
		annotations?: Record<string, unknown>,
	) => Promise<void>
	shutdown: (scope: RuntimeScope) => Promise<void>
	pendingQuestions: (conversationId: string) => Promise<ScopedEvent[]>
	subscribe: (
		onEvent: (event: ScopedEvent, hostId?: string | null) => void,
	) => Promise<ChatDriverUnsubscribe>
}
