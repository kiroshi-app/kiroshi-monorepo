import type { MessageAuthor } from "@workspace/ui/components/message"
import type { MissionEventModel } from "@workspace/ui/components/mission"
import type { RosterBot } from "@workspace/ui/components/roster"

import type { ChatController } from "./chat-controller"
import type { ChatError, ChatState } from "./chat-state"
import { isSessionReady, isTurnBusy } from "./chat-state"
import { type ReplyTarget, workingStateFor } from "./screen-model"
import type { Chat } from "./use-chat"
import type { WorkingState } from "./working-kind"

import { avatarSrc } from "../host"
import type { PermissionRequest, QuestionRequest } from "../agent/contract"
import type {
	ConversationController,
	ConversationState,
	PendingPrompt,
	RefusedMessage,
	UnresolvedMention,
} from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { CompanionArrival } from "../conversations/transcript-contract"
import type { Mission } from "../missions/mission-contract"
import type { OpenedMission } from "../missions/opened-mission-controller"
import type { ReportedRunsByTurnId } from "../routines/routine-contract"

export type ThreadFace = RosterBot

export type ThreadAuthors = ReadonlyMap<string, MessageAuthor>

export type ThreadQuotes = ReadonlyMap<string, ReplyTarget>

export type BotThread = {
	kind: "bot"
	bot: Bot
	chat: Chat
	isOverlayOpen: boolean
	onToggleSettings: () => void
}

export type ThreadMission = {
	mission: Mission
	events: MissionEventModel[]
	now: number
	opening: OpenedMission
	onLeave: () => void
}

export type ConversationThread = {
	kind: "conversation"
	conversation: Conversation
	runtimes: ConversationRuntimes
	isSettingsOpen: boolean
	onOpenSettings: (conversationId: string) => void
	mission?: ThreadMission
}

export type Thread = BotThread | ConversationThread

export type LoadedBotThread = BotThread & {
	state: ChatState
	controller: ChatController
}

export type LoadedConversationThread = ConversationThread & {
	state: ConversationState
	controller: ConversationController
}

export type LoadedThread = LoadedBotThread | LoadedConversationThread

export const faceOfBot = (bot: Bot): ThreadFace => ({
	id: bot.id,
	name: bot.name,
	title: bot.title || undefined,
	blot: bot.avatarBlot,
	image: avatarSrc(bot.avatarImagePath),
})

export type ThreadPermission = {
	request: PermissionRequest
	authorBotId: string | null
}

export type ThreadFacts = {
	id: string
	bot: Bot | null
	botController: ChatController | null
	conversation: Conversation | null
	botWork: WorkingState | null
	isReady: boolean
	isBusy: boolean
	isLoadingOlder: boolean
	isLoadingNewer: boolean
	isFirstLoadPending: boolean
	isPromptPending: boolean
	isOverlayOpen: boolean
	canAttach: boolean
	permission: ThreadPermission | null
	latestError?: ChatError
	question: QuestionRequest | null
	refused: RefusedMessage | null
	rejectedPromptId: string | null
	workingBotIds: (string | null)[]
	causes: ReportedRunsByTurnId
	mission: ThreadMission | null
	arrivals: CompanionArrival[]
	unresolvedMentions: UnresolvedMention[]
	dismissUnresolvedMentions: () => void
}

const NO_WORKING_BOT_IDS: (string | null)[] = []

const NO_ARRIVALS: CompanionArrival[] = []

const NO_UNRESOLVED_MENTIONS: UnresolvedMention[] = []

const DISMISS_NOTHING = () => undefined

const questionIn = (prompt: PendingPrompt | null): QuestionRequest | null =>
	prompt?.kind === "question" ? prompt.request : null

const permissionIn = (prompt: PendingPrompt | null): ThreadPermission | null =>
	prompt?.kind === "permission"
		? { request: prompt.request, authorBotId: prompt.botId }
		: null

const permissionOf = (
	request: PermissionRequest | null,
): ThreadPermission | null => (request ? { request, authorBotId: null } : null)

const botFactsOf = (thread: LoadedBotThread): ThreadFacts => {
	const isReady = isSessionReady(thread.state)
	const { foreignTurn } = thread.state
	const permission = thread.state.permission ?? foreignTurn?.permission ?? null
	const question = thread.state.question ?? foreignTurn?.question ?? null

	return {
		id: thread.bot.id,
		bot: thread.bot,
		botController: thread.controller,
		conversation: null,
		botWork: workingStateFor(thread.state),
		isReady,
		isBusy: isTurnBusy(thread.state.turn),
		isLoadingOlder: thread.state.loadingOlder,
		isLoadingNewer: thread.state.loadingNewer,
		isFirstLoadPending: thread.state.isFirstLoadPending,
		isPromptPending: permission !== null || question !== null,
		isOverlayOpen: thread.isOverlayOpen,
		canAttach: isReady,
		permission: permissionOf(permission),
		latestError: thread.state.errors.at(-1),
		question,
		refused: null,
		rejectedPromptId: thread.state.rejectedPromptId,
		workingBotIds: NO_WORKING_BOT_IDS,
		causes: thread.state.reportedCauses,
		mission: null,
		arrivals: NO_ARRIVALS,
		unresolvedMentions: NO_UNRESOLVED_MENTIONS,
		dismissUnresolvedMentions: DISMISS_NOTHING,
	}
}

const conversationFactsOf = (
	thread: LoadedConversationThread,
): ThreadFacts => ({
	id: thread.conversation.id,
	bot: null,
	botController: null,
	conversation: thread.conversation,
	botWork: null,
	isReady: false,
	isBusy: thread.state.speakers.length > 0,
	isLoadingOlder: thread.state.isLoadingOlder,
	isLoadingNewer: thread.state.isLoadingNewer,
	isFirstLoadPending: thread.state.isFirstLoadPending,
	isPromptPending: thread.state.pendingPrompt !== null,
	isOverlayOpen: false,
	canAttach: true,
	permission: permissionIn(thread.state.pendingPrompt),
	latestError: thread.state.latestError ?? undefined,
	question: questionIn(thread.state.pendingPrompt),
	refused: thread.state.refusedMessage,
	rejectedPromptId: null,
	workingBotIds: [
		...thread.state.speakers.map(({ botId }) => botId),
		...thread.state.waitingBotIds,
	],
	causes: thread.state.reportedCauses,
	mission: thread.mission ?? null,
	arrivals: thread.state.arrivals,
	unresolvedMentions: thread.state.unresolvedMentions,
	dismissUnresolvedMentions: thread.controller.dismissUnresolvedMentions,
})

export const factsOf = (thread: LoadedThread): ThreadFacts =>
	thread.kind === "bot" ? botFactsOf(thread) : conversationFactsOf(thread)
