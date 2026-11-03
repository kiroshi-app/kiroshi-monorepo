import type { ChatContext } from "./chat-context"

import type { ReplyLink } from "../../bindings"

export type PromptRows = ReturnType<typeof createPromptRows>

export const createPromptRows = ({
	store,
	transcript,
	newId,
	now,
	senderAccountId,
}: ChatContext) => {
	const promptRow = (
		conversationId: string,
		content: string,
		replyLinks: ReplyLink[],
	) => ({
		id: newId(),
		turnId: newId(),
		conversationId,
		content,
		createdAt: now(),
		repliedToMessageId: replyLinks[0]?.messageId ?? null,
		replyLinks,
	})

	type PromptRow = ReturnType<typeof promptRow>

	const storePrompt = (said: PromptRow, summoned: string[]) =>
		store.sendUserMessage(
			{
				id: said.id,
				conversationId: said.conversationId,
				turnId: said.turnId,
				authorBotId: null,
				repliedToMessageId: said.repliedToMessageId,
				replyLinks: said.replyLinks,
				content: said.content,
				createdAt: said.createdAt,
			},
			summoned,
		)

	const showPrompt = (said: PromptRow) =>
		transcript.append({
			id: said.id,
			conversationId: said.conversationId,
			turnId: said.turnId,
			role: "user",
			content: said.content,
			completion: "complete",
			createdAt: said.createdAt,
			authorBotId: null,
			authorAccountId: senderAccountId(),
			authorName: null,
			repliedToMessageId: said.repliedToMessageId,
			replyLinks: said.replyLinks,
			runtimeSessionId: null,
		})

	return { promptRow, storePrompt, showPrompt }
}
