import { i18n } from "@workspace/ui/lib/i18n"

import type { BotChat } from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { EventRouting } from "./event-routing"

import type {
	ReportedRun,
	ReportedRunsByTurnId,
	RunReportDraft,
} from "../../routines/routine-contract"
import {
	causeOf,
	readReportedCauses,
	writeReportTurn,
} from "../../routines/run-report"

export type ConversationOpening = ReturnType<typeof createConversationOpening>

type ConversationOpeningParts = {
	routePendingQuestions: EventRouting["routePendingQuestions"]
}

export const createConversationOpening = (
	{
		store,
		transcript,
		bots,
		enqueue,
		newId,
		now,
		readReportedRuns,
		announceReportTurn,
		dispatch,
		reportStore,
		syncBot,
	}: ChatContext,
	{ routePendingQuestions }: ConversationOpeningParts,
) => {
	const recallCommands = (bot: BotChat) =>
		store.botCommands(bot.id).then(
			(commands) => {
				if (bot.commands.announced) {
					return
				}
				bot.commands.stored = commands
				dispatch(bot, { type: "commandsRecalled", commands })
			},
			() => undefined,
		)

	const setCauses = (bot: BotChat, causes: ReportedRunsByTurnId) =>
		dispatch(bot, { type: "causesChanged", causes })

	const rememberCause = (bot: BotChat, reported: ReportedRun) =>
		setCauses(
			bot,
			new Map(bot.state.reportedCauses).set(reported.turnId, reported),
		)

	const readCauses = async (bot: BotChat, conversationId: string) => {
		const reported = await readReportedCauses({
			read: readReportedRuns,
			conversationId,
			description: i18n.t("chat:transcript.cause.unavailable.soloDescription"),
		})
		if (!reported?.size) {
			return
		}
		setCauses(bot, new Map([...reported, ...bot.state.reportedCauses]))
	}

	const leaveThreadBefore = (bot: BotChat, openedConversationId: string) => {
		const left = bot.state.conversationId
		if (left && left !== openedConversationId) {
			transcript.leave(left)
		}
	}

	const openConversation = async (bot: BotChat, spaceId: string | null) => {
		try {
			const chat = await store.mainChat(bot.id, spaceId)
			leaveThreadBefore(bot, chat.id)
			dispatch(bot, { type: "conversationOpened", conversationId: chat.id })
			void recallCommands(bot)
			void readCauses(bot, chat.id)
			void routePendingQuestions(bot, chat.id)
			syncBot(bot)
			await enqueue(() => transcript.load(chat.id))
			syncBot(bot)
		} catch (reason) {
			reportStore(bot, reason)
		}
	}

	const openChatOf = ({ botId, conversationId }: RunReportDraft) => {
		const bot = bots.get(botId)
		return bot?.state.conversationId === conversationId ? bot : null
	}

	const reportRun = async (draft: RunReportDraft) => {
		const reported = await enqueue(() =>
			writeReportTurn({ store, draft, newId, now }),
		)
		announceReportTurn(reported)
		const bot = openChatOf(draft)
		if (bot) {
			rememberCause(bot, causeOf(draft, reported.turnId))
			transcript.append(reported)
		}
		return reported.turnId
	}

	return { openConversation, reportRun }
}
