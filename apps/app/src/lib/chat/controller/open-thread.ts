import type { BotChat } from "./bot-chat"
import type { ChatContext } from "./chat-context"

import type { MessagePin } from "../../conversations/store-contract"

export const NO_PINS: MessagePin[] = []

export type OpenThread = ReturnType<typeof createOpenThread>

export const createOpenThread = ({
	store,
	transcript,
	bots,
	enqueue,
	now,
	reportRead,
}: ChatContext) => {
	const readBack = async (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		try {
			await enqueue(() => transcript.reopen(conversationId))
		} catch (reason) {
			reportRead(bot, reason)
		}
	}

	const reloadPage = async (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		if (!conversationId) {
			return
		}
		await enqueue(() => transcript.load(conversationId)).catch((reason) =>
			reportRead(bot, reason),
		)
	}

	const enterThread = (botId: string) => {
		const bot = bots.get(botId)
		if (bot) {
			void readBack(bot)
		}
	}

	const leaveThread = (botId: string) => {
		const conversationId = bots.get(botId)?.state.conversationId
		if (conversationId) {
			transcript.leave(conversationId)
		}
	}

	const referenceFor = (bot: BotChat, messageId: string) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.messageReference(conversationId, messageId))
			: Promise.resolve(null)
	}

	const pinFor = (bot: BotChat, messageId: string, blockIndex: number) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() =>
					store.pinMessage(conversationId, messageId, blockIndex, now()),
				)
			: Promise.resolve()
	}

	const unpinFor = (bot: BotChat, messageId: string, blockIndex: number) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.unpinMessage(conversationId, messageId, blockIndex))
			: Promise.resolve()
	}

	const pinsOf = (bot: BotChat) => {
		const conversationId = bot.state.conversationId
		return conversationId
			? enqueue(() => store.pinnedMessages(conversationId))
			: Promise.resolve(NO_PINS)
	}

	return {
		reloadPage,
		enterThread,
		leaveThread,
		referenceFor,
		pinFor,
		unpinFor,
		pinsOf,
	}
}
