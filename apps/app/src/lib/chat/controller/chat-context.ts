import {
	type BotChat,
	type BotTransition,
	newBotChat,
	postedIn,
} from "./bot-chat"

import type { ChatControllerOptions } from "../chat-controller"
import {
	type ChatAction,
	chatReducer,
	toReadError,
	toStoreError,
	toTransportError,
} from "../chat-state"
import type { ChatDriver } from "../driver"
import { withPostedRows } from "../posted-question"
import { PROMPTS_PER_RUN } from "../rotation"
import type { AgentEvent, RuntimeScope } from "../../agent/contract"
import {
	createMessageStoredListener,
	createReconnectionListener,
	createReportTurnAnnouncer,
} from "../../conversations/create-live-listeners"
import { createForeignTurns } from "../../conversations/foreign-turns"
import type { TranscriptStore } from "../../conversations/store-port"
import { createTranscriptController } from "../../conversations/transcript-controller"
import {
	selectHasMore,
	selectHasNewer,
	selectIsFirstLoadPending,
	selectMessages,
} from "../../conversations/transcript-state"
import { createQueue } from "../../queue"
import { createReportedRunsReader } from "../../routines/create-run-port"

export type ChatContext = ReturnType<typeof createChatContext>

export const createChatContext = (
	driver: ChatDriver,
	store: TranscriptStore,
	options: ChatControllerOptions,
) => {
	const newId = options.newId ?? (() => crypto.randomUUID())
	const now = options.now ?? (() => Date.now())
	const promptsPerRun = options.promptsPerRun ?? PROMPTS_PER_RUN
	const senderAccountId = options.senderAccountId ?? (() => null)
	const readReportedRuns =
		options.readReportedRuns ?? createReportedRunsReader()
	const onMessageStored =
		options.onMessageStored ?? createMessageStoredListener()
	const announceReportTurn =
		options.announceReportTurn ?? createReportTurnAnnouncer()
	const onReconnected = options.onReconnected ?? createReconnectionListener()
	const transcript = createTranscriptController(store)
	const hearSilence = ({ conversationId }: RuntimeScope) => {
		botsShowing(conversationId).forEach(showForeignTurn)
		options.rereadConversation?.(conversationId)
	}
	const foreignTurns = createForeignTurns(transcript, now, hearSilence)

	const bots = new Map<string, BotChat>()
	const transitions = new Map<string, BotTransition>()
	const listeners = new Set<() => void>()

	const enqueue = createQueue()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const botFor = (id: string): BotChat => {
		const known = bots.get(id)
		if (known) {
			return known
		}
		const bot = newBotChat(id)
		bots.set(id, bot)
		return bot
	}

	const dispatch = (bot: BotChat, action: ChatAction) => {
		const next = chatReducer(bot.state, action, now())
		if (next === bot.state) {
			return
		}
		bot.state = next
		publish()
	}

	const announce = (bot: BotChat, event: AgentEvent) =>
		dispatch(bot, { type: "driverEvent", scope: bot.state.runtime, event })

	const report = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toTransportError(reason) })

	const reportStore = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toStoreError(reason) })

	const reportRead = (bot: BotChat, reason: unknown) =>
		announce(bot, { type: "failed", error: toReadError(reason) })

	const write = (
		bot: BotChat,
		operation: () => Promise<unknown>,
		shown?: () => void,
	) => {
		void enqueue(operation).then(
			() => shown?.(),
			(reason) => reportStore(bot, reason),
		)
	}

	const syncBot = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		const current = transcript.getState()
		dispatch(bot, {
			type: "transcriptChanged",
			messages: withPostedRows(
				selectMessages(current, conversationId),
				postedIn(bot, conversationId),
			),
			hasOlder: selectHasMore(current, conversationId),
			hasNewer: selectHasNewer(current, conversationId),
			isFirstLoadPending: selectIsFirstLoadPending(current, conversationId),
		})
	}

	const syncTranscript = () => {
		for (const bot of bots.values()) {
			syncBot(bot)
		}
	}

	transcript.subscribe(syncTranscript)

	const botsShowing = (conversationId: string) =>
		[...bots.values()].filter(
			(bot) => bot.state.conversationId === conversationId,
		)

	const foreignTurnOf = (bot: BotChat) => {
		const { conversationId } = bot.state
		if (!conversationId) {
			return null
		}
		return (
			foreignTurns
				.speakersIn(conversationId)
				.find(({ scope }) => scope.botId === bot.id) ?? null
		)
	}

	const showForeignTurn = (bot: BotChat) =>
		dispatch(bot, { type: "foreignTurnChanged", speaker: foreignTurnOf(bot) })

	return {
		driver,
		store,
		newId,
		now,
		promptsPerRun,
		senderAccountId,
		readReportedRuns,
		onMessageStored,
		announceReportTurn,
		onReconnected,
		transcript,
		foreignTurns,
		bots,
		transitions,
		listeners,
		enqueue,
		publish,
		botFor,
		dispatch,
		announce,
		report,
		reportStore,
		reportRead,
		write,
		syncBot,
		botsShowing,
		showForeignTurn,
	}
}
