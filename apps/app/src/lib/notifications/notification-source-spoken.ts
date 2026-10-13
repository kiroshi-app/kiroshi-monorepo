import { notifiesSpokenWord } from "./notification-policy"
import type { NotificationSourceOptions } from "./notification-source"
import type { Deliver, Reading } from "./notification-source-delivery"
import { spokenWordsFor } from "./notification-words"

import { conversationName } from "../conversations/roster-conversations"
import type { SpokenWord } from "../conversations/spoken-words"
import type { Conversation } from "../conversations/store-contract"

type SpokenWordNotifierOptions = Pick<
	NotificationSourceOptions,
	"roster" | "switches"
> & {
	hasHostFocus: () => boolean
	deliver: Deliver
}

const speakerNameIn = (conversation: Conversation, botId: string) =>
	conversation.participants.find(({ botId: seated }) => seated === botId)?.name

export const createSpokenWordNotifier = ({
	roster,
	switches,
	hasHostFocus,
	deliver,
}: SpokenWordNotifierOptions) => {
	const rosteredConversation = (conversationId: string) =>
		Object.values(roster.getState().conversationRosters)
			.flat()
			.find(({ id }) => id === conversationId)

	return ({ conversationId, authorBotId }: SpokenWord) => {
		const reading: Reading = {
			switches: switches(),
			hasFocus: hasHostFocus(),
		}
		const conversation = rosteredConversation(conversationId)
		const name = conversation && speakerNameIn(conversation, authorBotId)

		if (!conversation || !name || !notifiesSpokenWord(reading)) {
			return
		}

		deliver(
			[
				{
					target: { kind: "conversation", id: conversationId },
					...spokenWordsFor({ title: conversationName(conversation), name }),
				},
			],
			reading,
		)
	}
}
