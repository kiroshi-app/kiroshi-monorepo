import { useCallback, useMemo } from "react"

import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import type { RosterBot } from "@workspace/ui/components/roster"
import { toPlainText } from "@workspace/ui/lib/plain-text"

import type { ReplyTarget } from "./screen-model"
import type { PersonOf } from "./thread-authorship"
import {
	faceOfBot,
	type ThreadAuthors,
	type ThreadFace,
} from "./thread-contract"

import { toMentionNames } from "../conversations/mentions"
import {
	authorsOf,
	presentParticipants,
	toConversationBots,
} from "../conversations/roster-conversations"
import type { Bot, Conversation } from "../conversations/store-contract"

const NO_BOTS: RosterBot[] = []

const NO_AUTHORS: ThreadAuthors = new Map()

export type ThreadRoster = {
	bots: RosterBot[]
	present: RosterBot[]
	authors: ThreadAuthors
	botFace: ThreadFace | null
}

type ThreadSeats = {
	bot: Bot | null
	bots: Bot[]
	conversation: Conversation | null
}

export function useThreadRoster({
	bot,
	bots: records,
	conversation,
}: ThreadSeats): ThreadRoster {
	const bots = useMemo(
		() =>
			conversation
				? toConversationBots(conversation.participants, records)
				: NO_BOTS,
		[conversation, records],
	)
	const present = useMemo(
		() =>
			conversation
				? toConversationBots(presentParticipants(conversation), records)
				: NO_BOTS,
		[conversation, records],
	)
	const authors = useMemo<ThreadAuthors>(
		() => (conversation ? authorsOf(conversation, records) : NO_AUTHORS),
		[conversation, records],
	)
	const botFace = useMemo<ThreadFace | null>(
		() => (bot ? faceOfBot(bot) : null),
		[bot],
	)

	return { bots, present, authors, botFace }
}

export type ThreadNaming = {
	faceOf: (authorBotId: string | null) => ThreadFace | undefined
	toExcerpt: (text: string) => string
	toQuote: (target: ReplyTarget) => QuotedMessage
}

type ThreadNamingInput = ThreadRoster & {
	reader: string
	unnamed: string
	personOf: PersonOf
	isConversation: boolean
	onJump: (messageId: string) => void
}

export function useThreadNaming({
	bots,
	authors,
	botFace,
	reader,
	unnamed,
	personOf,
	isConversation,
	onJump,
}: ThreadNamingInput): ThreadNaming {
	const faceOf = useCallback(
		(authorBotId: string | null) =>
			botFace ?? (authorBotId ? authors.get(authorBotId) : undefined),
		[botFace, authors],
	)

	const toExcerpt = useCallback(
		(text: string) => {
			const plain = toPlainText(text)
			return isConversation ? toMentionNames(plain, bots) : plain
		},
		[isConversation, bots],
	)

	const nameOf = useCallback(
		(authorBotId: string | null) => faceOf(authorBotId)?.name ?? unnamed,
		[faceOf, unnamed],
	)

	const toQuote = useCallback(
		(target: ReplyTarget): QuotedMessage => ({
			author:
				target.role === "user"
					? (personOf(target) ?? reader)
					: nameOf(target.authorBotId),
			excerpt: toExcerpt(target.excerpt),
			isExcerpt: target.isExcerpt,
			from: target.role,
			onJump: () => onJump(target.messageId),
		}),
		[reader, personOf, nameOf, toExcerpt, onJump],
	)

	return { faceOf, toExcerpt, toQuote }
}
