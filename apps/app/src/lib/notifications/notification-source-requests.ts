import {
	type ConversationRound,
	notificationsFor,
	notifiesFinishedRound,
} from "./notification-policy"
import type { NotificationRequest } from "./notification-port"
import type { NotificationSourceOptions } from "./notification-source"
import type { Reading } from "./notification-source-delivery"
import { notificationWordsFor } from "./notification-words"

import type { ChatState } from "../chat/chat-state"
import { conversationName } from "../conversations/roster-conversations"
import type { Conversation } from "../conversations/store-contract"

export type NotifiedBot = {
	id: string
	name: string
}

type NotificationRequestsOptions = Pick<
	NotificationSourceOptions,
	"chat" | "runtimes" | "roster"
>

const forgetBeyond = <Held>(seen: Map<string, Held>, ids: string[]) => {
	if (seen.size <= ids.length) {
		return
	}
	for (const id of seen.keys()) {
		if (!ids.includes(id)) {
			seen.delete(id)
		}
	}
}

export const createNotificationRequests = ({
	chat,
	runtimes,
	roster,
}: NotificationRequestsOptions) => {
	const seen = new Map<string, ChatState>()
	const seenRounds = new Map<string, ConversationRound>()

	const rosteredBots = (): NotifiedBot[] => {
		const held = new Map<string, NotifiedBot>()
		for (const bots of Object.values(roster.getState().rosters)) {
			for (const bot of bots) {
				held.set(bot.id, bot)
			}
		}
		return [...held.values()]
	}

	const botNotifications = ({
		switches,
		hasFocus,
	}: Reading): NotificationRequest[] => {
		const bots = rosteredBots()
		const requests: NotificationRequest[] = []

		for (const bot of bots) {
			const after = chat.stateFor(bot.id)
			const before = seen.get(bot.id)
			seen.set(bot.id, after)

			if (!before) {
				continue
			}

			const changes = notificationsFor({
				botId: bot.id,
				before,
				after,
				switches,
				hasFocus,
			})

			for (const change of changes) {
				requests.push({
					target: { kind: "bot", id: bot.id },
					...notificationWordsFor({ name: bot.name, event: change.event }),
				})
			}
		}

		forgetBeyond(
			seen,
			bots.map((bot) => bot.id),
		)
		return requests
	}

	const roundChangeOf = (conversationId: string) => {
		const held = runtimes.heldFor(conversationId)

		if (!held) {
			seenRounds.delete(conversationId)
			return null
		}

		const after = held.getState()
		const before = seenRounds.get(conversationId)
		seenRounds.set(conversationId, after)

		return before ? { before, after } : null
	}

	const conversationNotifications = (
		conversations: Conversation[],
		reading: Reading,
	): NotificationRequest[] =>
		conversations.flatMap((conversation) => {
			const change = roundChangeOf(conversation.id)

			if (!change || !notifiesFinishedRound({ ...change, ...reading })) {
				return []
			}

			return [
				{
					target: { kind: "conversation" as const, id: conversation.id },
					...notificationWordsFor({
						name: conversationName(conversation),
						event: "finishedTurn",
					}),
				},
			]
		})

	const botNameOf = (botId: string) =>
		rosteredBots().find(({ id }) => id === botId)?.name

	const requestsFor = (reading: Reading): NotificationRequest[] => {
		const { conversations } = roster.getState()
		const requests = [
			...botNotifications(reading),
			...conversationNotifications(conversations, reading),
		]

		forgetBeyond(
			seenRounds,
			conversations.map((conversation) => conversation.id),
		)

		return requests
	}

	return { requestsFor, botNameOf }
}
