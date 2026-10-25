import type {
	CancelOutcome,
	CheckReport,
	ConversationNaming,
	LiveSession,
	PermissionDecision,
	QuestionAnswers,
	RuntimeScope,
	ScopedEvent,
	SessionHandle,
	SubmittedTurn,
} from "./contract"

import { activeJoinedSpaceId, invoke, listen } from "../host"
import type { SubmittedAttachment } from "../chat/attachments-contract"
import type { ChatDriver } from "../chat/driver"
import { traceAgentTurn } from "../perf/agent-turn-trace"

const EVENT_CHANNEL = "agent://event"

export const agentTransport: ChatDriver = {
	check: (scope: RuntimeScope | null) =>
		invoke<CheckReport>("agent_check", { scope }),

	namingFor: (text: string) =>
		invoke<ConversationNaming | null>("agent_title", { text }),

	startOrResumeSession: (
		scope: RuntimeScope,
		resume?: string,
		cwd?: string,
		outputSchema?: Record<string, unknown>,
	) =>
		invoke<SessionHandle>("agent_start_or_resume_session", {
			scope,
			resume: resume ?? null,
			cwd: cwd ?? null,
			outputSchema: outputSchema ?? null,
		}),

	submitPrompt: (scope: RuntimeScope, text: string, turn?: SubmittedTurn) =>
		invoke<void>("agent_submit_prompt", { scope, text, turn: turn ?? null }),

	storeAttachments: (
		conversationId: string,
		attachments: SubmittedAttachment[],
	) =>
		invoke<string[]>("chat_store_attachments", {
			conversationId,
			attachments,
		}),

	cancelTurn: (scope: RuntimeScope) =>
		invoke<CancelOutcome>("agent_cancel_turn", { scope }),

	respondToPermission: (
		scope: RuntimeScope,
		id: string,
		decision: PermissionDecision,
	) => invoke<void>("agent_respond_to_permission", { scope, id, decision }),

	answerQuestion: (
		scope: RuntimeScope,
		id: string,
		answers: QuestionAnswers,
		annotations?: Record<string, unknown>,
	) =>
		invoke<void>("agent_answer_question", {
			scope,
			id,
			answers,
			annotations: annotations ?? null,
		}),

	shutdown: (scope: RuntimeScope) => invoke<void>("agent_shutdown", { scope }),

	pendingQuestions: (conversationId: string) =>
		invoke<ScopedEvent[]>("agent_pending_questions", { conversationId }),

	subscribe: (onEvent) =>
		listen<ScopedEvent>(EVENT_CHANNEL, ({ payload }, hostId) => {
			traceAgentTurn(payload.event)
			onEvent(payload, hostId)
		}),
}

export const liveSessions = () => {
	const spaceId = activeJoinedSpaceId()
	return spaceId === null
		? invoke<LiveSession[]>("agent_live_sessions")
		: invoke<LiveSession[]>("agent_live_sessions_in_space", { spaceId })
}
