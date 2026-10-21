import type { SubmittedAttachment } from "./attachments-contract"
import { type ChatState, initialChatState } from "./chat-state"
import type { ChatDriver } from "./driver"
import type { PostedAnswerHandler, PostedRequest } from "./posted-question"

import type {
	CheckReport,
	PermissionDecision,
	QuestionAnswers,
	SessionHandle,
} from "../agent/contract"
import type {
	MessageStoredListener,
	ReconnectionListener,
} from "../conversations/create-live-listeners"
import type {
	MessagePin,
	MessageReference,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import type { RunReportDraft } from "../routines/routine-contract"
import type { ReportedRunsReader } from "../routines/run-port"
import { createAgentQuestions } from "./controller/agent-questions"
import type { BotChat } from "./controller/bot-chat"
import { createBotTransitions } from "./controller/bot-transitions"
import { createCarriedContext } from "./controller/carried-context"
import { createChatContext } from "./controller/chat-context"
import { createConversationLanding } from "./controller/conversation-landing"
import { createConversationOpening } from "./controller/conversation-opening"
import { createEventPersistence } from "./controller/event-persistence"
import { createEventRouting } from "./controller/event-routing"
import { createOpenThread, NO_PINS } from "./controller/open-thread"
import { createOutbox } from "./controller/outbox"
import { createPostedAnswers } from "./controller/posted-answers"
import { createPostedQuestions } from "./controller/posted-questions"
import { createPromptRows } from "./controller/prompt-rows"
import { createPromptSubmission } from "./controller/prompt-submission"
import { createReplyWriter } from "./controller/reply-writer"
import { createRunRotation } from "./controller/run-rotation"
import { createSessionRunner } from "./controller/session-runner"
import {
	createTranscriptPaging,
	NO_LANDED_MESSAGES,
} from "./controller/transcript-paging"

export type ChatController = {
	getState: () => ChatState
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
	attach: () => () => void
	check: () => Promise<CheckReport | null>
	start: (resume?: string) => Promise<SessionHandle | null>
	preflight: (resume?: string) => Promise<SessionHandle | null>
	open: (botId: string, spaceId: string | null) => Promise<SessionHandle | null>
	openAside: (
		botId: string,
		spaceId: string | null,
	) => Promise<SessionHandle | null>
	close: (botId: string) => Promise<void>
	enter: (botId: string) => void
	leave: (botId: string) => void
	redescribe: (botId: string) => void
	restart: () => Promise<SessionHandle | null>
	reopen: (botId: string) => Promise<SessionHandle | null>
	loadOlder: () => Promise<void>
	loadNewer: () => Promise<void>
	loadLatest: () => Promise<boolean>
	landOn: (seq: number) => Promise<TranscriptMessage[]>
	follow: (isAtLiveEdge: boolean) => void
	send: (text: string, repliedToMessageId?: string) => Promise<void>
	sendTo: (
		botId: string,
		text: string,
		repliedToMessageId?: string,
	) => Promise<void>
	reference: (messageId: string) => Promise<MessageReference | null>
	pin: (messageId: string, blockIndex: number) => Promise<void>
	unpin: (messageId: string, blockIndex: number) => Promise<void>
	pins: () => Promise<MessagePin[]>
	reportRun: (draft: RunReportDraft) => Promise<string>
	storeAttachments: (
		botId: string,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	stop: () => Promise<void>
	discard: (id: string) => void
	dismissError: (id: string) => void
	respond: (id: string, decision: PermissionDecision) => Promise<void>
	answer: (id: string, answers: QuestionAnswers) => Promise<void>
	postQuestion: (
		botId: string,
		request: PostedRequest,
		onAnswers: PostedAnswerHandler,
	) => boolean
	withdrawQuestion: (botId: string, id: string) => void
	retry: (id: string) => Promise<void>
	shutdown: () => Promise<void>
}

export type ChatControllerOptions = {
	newId?: () => string
	now?: () => number
	promptsPerRun?: number
	readReportedRuns?: ReportedRunsReader
	senderAccountId?: () => string | null
	onMessageStored?: MessageStoredListener
	onReconnected?: ReconnectionListener
	rereadConversation?: (conversationId: string) => void
}

export function createChatController(
	driver: ChatDriver,
	store: TranscriptStore,
	options: ChatControllerOptions = {},
): ChatController {
	const context = createChatContext(driver, store, options)
	const { bots, listeners, dispatch } = context
	const pump = (bot: BotChat) => outbox.pump(bot)
	const { landedConversationOf } = createConversationLanding(context)
	const replies = createReplyWriter(context)
	const { persist } = createEventPersistence(context, replies)
	const thread = createOpenThread(context)
	const paging = createTranscriptPaging(context)
	const routing = createEventRouting(context, {
		persist,
		reloadPage: thread.reloadPage,
		pump,
	})
	const session = createSessionRunner(context, {
		settleOpenReplies: replies.settleOpenReplies,
		connect: routing.connect,
		isAttached: routing.isAttached,
		pump,
		landedConversationOf,
	})
	const carried = createCarriedContext(context)
	const rotation = createRunRotation(context, session, carried)
	const opening = createConversationOpening(context, {
		routePendingQuestions: routing.routePendingQuestions,
	})
	const selection = createBotTransitions(context, {
		openConversation: opening.openConversation,
		openedFor: session.openedFor,
		pump,
	})
	const promptRows = createPromptRows(context)
	const prompts = createPromptSubmission(context, {
		startFor: session.startFor,
		rotateIfDue: rotation.rotateIfDue,
		contextFor: carried.contextFor,
		loadLatest: paging.loadLatest,
		promptRows,
		landedConversationOf,
	})
	const posted = createPostedQuestions(context)
	const { answerPosted } = createPostedAnswers(context)
	const questions = createAgentQuestions(context, {
		loadLatest: paging.loadLatest,
		answerPosted,
	})
	const outbox = createOutbox(context, {
		openedFor: session.openedFor,
		promptRows,
		prompts,
		answer: questions.answer,
	})
	const { onSelected, forSelected } = selection

	return {
		getState: () => selection.chosenBot()?.state ?? initialChatState,
		stateFor: (botId) => bots.get(botId)?.state ?? initialChatState,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		attach: routing.attach,
		check: () => onSelected(session.checkFor, null),
		start: (resume) => onSelected((bot) => session.startFor(bot, resume), null),
		preflight: (resume) =>
			onSelected((bot) => session.preflightFor(bot, resume), null),
		open: selection.open,
		openAside: selection.openAside,
		close: selection.close,
		enter: thread.enterThread,
		leave: thread.leaveThread,
		redescribe: rotation.redescribe,
		restart: () =>
			onSelected(
				(bot) => session.preflightFor(bot, bot.state.sessionId ?? undefined),
				null,
			),
		reopen: (botId) => {
			const bot = bots.get(botId)
			return bot ? session.reopenFor(bot) : Promise.resolve(null)
		},
		loadOlder: () => onSelected(paging.loadOlder, undefined),
		loadNewer: () => onSelected(paging.loadNewer, undefined),
		loadLatest: () => onSelected(paging.loadLatest, true),
		landOn: (seq) =>
			onSelected((bot) => paging.landOn(bot, seq), NO_LANDED_MESSAGES),
		follow: (isAtLiveEdge) =>
			forSelected((bot) => paging.follow(bot, isAtLiveEdge)),
		send: (text, repliedToMessageId) =>
			onSelected(
				(bot) => outbox.send(bot, text, repliedToMessageId),
				undefined,
			),
		sendTo: async (botId, text, repliedToMessageId) => {
			const bot = bots.get(botId)
			if (bot) {
				await outbox.send(bot, text, repliedToMessageId)
			}
		},
		reference: (messageId) =>
			onSelected((bot) => thread.referenceFor(bot, messageId), null),
		pin: (messageId, blockIndex) =>
			onSelected((bot) => thread.pinFor(bot, messageId, blockIndex), undefined),
		unpin: (messageId, blockIndex) =>
			onSelected(
				(bot) => thread.unpinFor(bot, messageId, blockIndex),
				undefined,
			),
		pins: () => onSelected(thread.pinsOf, NO_PINS),
		reportRun: opening.reportRun,
		storeAttachments: prompts.storeAttachments,
		stop: () => onSelected(outbox.stop, undefined),
		discard: (id) =>
			forSelected((bot) => dispatch(bot, { type: "outboxEntryRemoved", id })),
		dismissError: (id) =>
			forSelected((bot) => dispatch(bot, { type: "errorDismissed", id })),
		respond: (id, decision) =>
			onSelected((bot) => questions.respond(bot, id, decision), undefined),
		answer: (id, answers) =>
			onSelected((bot) => questions.answer(bot, id, answers), undefined),
		postQuestion: (botId, request, onAnswers) => {
			const bot = bots.get(botId)
			return bot ? posted.postQuestion(bot, request, onAnswers) : false
		},
		withdrawQuestion: (botId, id) => {
			const bot = bots.get(botId)
			if (bot) {
				posted.withdrawQuestion(bot, id)
			}
		},
		retry: (id) =>
			onSelected(
				(bot) => prompts.admit(bot, () => prompts.retryPrompt(bot, id)),
				undefined,
			),
		shutdown: () => onSelected(selection.shutdown, undefined),
	}
}
