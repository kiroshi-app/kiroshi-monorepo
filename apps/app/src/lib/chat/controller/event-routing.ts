import {
	type BotChat,
	isMutedFailure,
	noteEvolution,
	noteFailure,
} from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { EventPersistence } from "./event-persistence"
import type { OpenThread } from "./open-thread"

import { isSameRuntimeScope } from "../chat-state"
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
			foreignTurns.render(scope, event)
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

	const routeShown = (
		bot: BotChat,
		conversationId: string,
		pending: ScopedEvent[],
	) => {
		if (bot.state.conversationId === conversationId) {
			pending.forEach(route)
		}
	}

	const routePendingQuestions = async (
		bot: BotChat,
		conversationId: string,
	) => {
		try {
			const pending = await driver.pendingQuestions(conversationId)
			await enqueue(async () => routeShown(bot, conversationId, pending))
		} catch (reason) {
			reportRead(bot, reason)
		}
	}

	const connect = () => {
		disconnect()
		stopStoredMessages = onMessageStored(({ conversationId }) =>
			botsShowing(conversationId).forEach(reloadPage),
		)
		stopReconnections = onReconnected(() => bots.forEach(reloadPage))
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
