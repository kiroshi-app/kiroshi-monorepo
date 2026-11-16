import {
	type BotChat,
	isMutedFailure,
	isRunOutsideOpenThread,
	noteEvolution,
	noteFailure,
} from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { EventPersistence } from "./event-persistence"
import type { OpenThread } from "./open-thread"

import { isSameRuntimeScope } from "../chat-state"
import { isPostedRequest } from "../posted-question"
import { waitingQuestionIdsIn } from "../waiting-questions"
import type { ScopedEvent } from "../../agent/contract"

type EventRoutingParts = {
	persist: EventPersistence["persist"]
	reloadPage: OpenThread["reloadPage"]
	pump: (bot: BotChat) => void
}

export type EventRouting = ReturnType<typeof createEventRouting>

export const createEventRouting = (
	{
		driver,
		bots,
		foreignTurns,
		dispatch,
		botsShowing,
		showForeignTurn,
		onMessageStored,
		onReconnected,
		isListedInOpenSpace,
		reportRead,
		enqueue,
	}: ChatContext,
	{ persist, reloadPage, pump }: EventRoutingParts,
) => {
	let detach: Promise<() => void> | null = null
	let stopStoredMessages: Promise<() => void> | null = null
	let stopReconnections: (() => void) | null = null

	const disconnect = () => {
		detach?.then((unlisten) => unlisten())
		detach = null
		stopStoredMessages?.then((unlisten) => unlisten())
		stopStoredMessages = null
		stopReconnections?.()
		stopReconnections = null
	}

	const isShowing = (conversationId: string) =>
		[...bots.values()].some(
			(bot) => bot.state.conversationId === conversationId,
		)

	const renderForeign = ({ scope, turn, event }: ScopedEvent) => {
		if (scope && turn && isShowing(turn.conversationId)) {
			foreignTurns.render(scope, turn, event)
			botsShowing(turn.conversationId).forEach(showForeignTurn)
		}
	}

	const route = (scoped: ScopedEvent) => {
		const { scope, event } = scoped
		const owners = [...bots.values()].filter((bot) =>
			isSameRuntimeScope(scope, bot.state.runtime),
		)
		if (owners.length === 0) {
			renderForeign(scoped)
			return
		}
		for (const bot of owners) {
			if (!isMutedFailure(bot, event)) {
				dispatch(bot, { type: "driverEvent", scope, event })
			}
			noteFailure(bot, event)
			noteEvolution(bot, event)
			persist(bot, scope, event)
			pump(bot)
		}
	}

	const ownQuestionIdShownBy = (bot: BotChat) => {
		const { question } = bot.state
		return question &&
			!isPostedRequest(question) &&
			!isRunOutsideOpenThread(bot)
			? question.id
			: null
	}

	const agentQuestionIdsShownBy = (bot: BotChat) =>
		[
			ownQuestionIdShownBy(bot),
			bot.state.foreignTurn?.question?.id ?? null,
		].filter((id) => id !== null)

	const withdrawQuestion = (bot: BotChat, id: string) => {
		if (bot.state.question?.id === id) {
			dispatch(bot, { type: "questionWithdrawn", id })
		}
		const foreign = bot.state.foreignTurn
		if (foreign?.question?.id === id) {
			foreignTurns.release(foreign.scope, id)
			showForeignTurn(bot)
		}
	}

	const withdrawUnheld = (
		bot: BotChat,
		shownIds: string[],
		pending: ScopedEvent[],
	) => {
		const heldIds = waitingQuestionIdsIn(pending)
		for (const id of shownIds.filter((shown) => !heldIds.has(shown))) {
			withdrawQuestion(bot, id)
		}
	}

	const settleShown = (
		bot: BotChat,
		conversationId: string,
		shownIds: string[],
		pending: ScopedEvent[],
	) => {
		if (bot.state.conversationId !== conversationId) {
			return
		}
		withdrawUnheld(bot, shownIds, pending)
		pending.forEach(route)
	}

	const routePendingQuestions = async (
		bot: BotChat,
		conversationId: string,
	) => {
		const shownIds =
			bot.state.conversationId === conversationId
				? agentQuestionIdsShownBy(bot)
				: []
		try {
			const pending = await driver.pendingQuestions(conversationId)
			await enqueue(async () =>
				settleShown(bot, conversationId, shownIds, pending),
			)
		} catch (reason) {
			reportRead(bot, reason)
		}
	}

	const catchUp = (bot: BotChat) => {
		reloadPage(bot)
		const conversationId = bot.state.conversationId
		if (conversationId) {
			void routePendingQuestions(bot, conversationId)
		}
	}

	const reloadListedBots = () => {
		for (const bot of bots.values()) {
			if (isListedInOpenSpace(bot.id)) {
				catchUp(bot)
			}
		}
	}

	const connect = () => {
		disconnect()
		stopStoredMessages = onMessageStored(({ conversationId }) =>
			botsShowing(conversationId).forEach(reloadPage),
		)
		stopReconnections = onReconnected(reloadListedBots)
		detach = driver.subscribe((scoped) => route(scoped))
		return detach
	}

	const isAttached = () => detach !== null

	const attach = () => {
		connect()
		return disconnect
	}

	return { connect, isAttached, attach, routePendingQuestions }
}
