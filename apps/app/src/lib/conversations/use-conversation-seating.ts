import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react"

import type { RosterBot } from "@workspace/ui/components/roster"
import { i18n } from "@workspace/ui/lib/i18n"

import { mentionedBotIdsIn } from "./mentions"
import {
	mentionableBots,
	toBotRows,
	unseatedBots,
} from "./roster-conversations"
import type { Bot, Conversation } from "./store-contract"

import { raiseReportedFailure } from "../failure-report"

export type ConversationSeating = {
	seat: (conversationId: string, botId: string) => Promise<Conversation | null>
	botsByPresence: (conversationId: string) => Promise<Bot[]>
}

export const ConversationSeatingContext =
	createContext<ConversationSeating | null>(null)

const NO_BOTS: RosterBot[] = []

const SUGGESTED_BOTS_SHOWN = 5

type OpenConversation = (conversation: Conversation) => Promise<void>

type MentionedSeating = {
	seating: ConversationSeating
	conversation: Conversation
	bots: Bot[]
	open: OpenConversation
	text: string
}

const seatMentionedIn = async ({
	seating,
	conversation,
	bots,
	open,
	text,
}: MentionedSeating): Promise<boolean> => {
	const absent = new Set(unseatedBots(bots, conversation).map((bot) => bot.id))
	const namedAbsentIds = mentionedBotIdsIn(
		text,
		mentionableBots(bots, conversation),
	).filter((botId) => absent.has(botId))
	let held = conversation

	for (const botId of namedAbsentIds) {
		const seated = await seating.seat(conversation.id, botId)
		if (!seated) {
			return false
		}
		held = seated
	}

	if (held !== conversation) {
		await open(held)
	}
	return true
}

export type MentionedSeats = {
	conversation: Conversation | null
	bots: Bot[]
	open: OpenConversation | null
}

export const useSeatMentioned = ({
	conversation,
	bots,
	open,
}: MentionedSeats) => {
	const seating = useContext(ConversationSeatingContext)

	return useCallback(
		(text: string) =>
			seating && conversation && open
				? seatMentionedIn({ seating, conversation, bots, open, text })
				: Promise.resolve(true),
		[seating, conversation, bots, open],
	)
}

export const useSuggestedBots = (conversationId: string | null) => {
	const seating = useContext(ConversationSeatingContext)
	const [read, setRead] = useState<{
		conversationId: string
		bots: RosterBot[]
	} | null>(null)

	useEffect(() => {
		if (!seating || !conversationId) {
			return
		}
		let isCurrent = true
		const land = (bots: RosterBot[]) => {
			if (isCurrent) {
				setRead({ conversationId, bots })
			}
		}
		seating.botsByPresence(conversationId).then(
			(bots) => land(toBotRows(bots).slice(0, SUGGESTED_BOTS_SHOWN)),
			() => {
				land(NO_BOTS)
				raiseReportedFailure(
					{
						title: i18n.t("chat:conversationSeating.unavailable"),
					},
					{
						raisedIn: "use-conversation-seating",
						conversation: conversationId,
					},
				)
			},
		)
		return () => {
			isCurrent = false
		}
	}, [seating, conversationId])

	return read?.conversationId === conversationId ? read.bots : NO_BOTS
}
