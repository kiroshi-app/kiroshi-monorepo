import type { ConversationState } from "./conversation-controller"
import { isTerminalCompletion } from "./transcript-state"

import type { BadgeRuleInput } from "../chat/badge-source"
import type { BotBadge } from "../chat/bot-badge"

export type ConversationAnswer = Pick<
	ConversationState,
	"speakers" | "waitingBotIds" | "messages"
>

const isAnswering = ({ speakers, waitingBotIds }: ConversationAnswer) =>
	speakers.length > 0 || waitingBotIds.length > 0

const hasStoppedAnswering = (
	before: ConversationAnswer,
	after: ConversationAnswer,
) => isAnswering(before) && !isAnswering(after)

const hasFailed = ({ messages }: ConversationAnswer) =>
	messages.findLast((message) => isTerminalCompletion(message.completion))
		?.completion === "failed"

export const conversationBadgeAfter = ({
	held,
	before,
	after,
	isSelected,
	hasFocus,
}: BadgeRuleInput<ConversationAnswer>): BotBadge => {
	if (isSelected && hasFocus) {
		return "none"
	}
	if (isAnswering(after)) {
		return "none"
	}
	if (before && hasStoppedAnswering(before, after)) {
		return hasFailed(after) ? "failed" : "done"
	}
	return held
}
