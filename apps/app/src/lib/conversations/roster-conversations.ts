import type { ActivityIndicatorKind } from "@workspace/ui/components/activity-indicator"
import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import type { ConversationSettingsValue } from "@workspace/ui/components/conversation-settings-dialog"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { MentionBot as PromptMentionBot } from "@workspace/ui/components/prompt-mention-menu"
import type { RosterBot } from "@workspace/ui/components/roster"
import { i18n } from "@workspace/ui/lib/i18n"

import { type MentionBot, toMentionNames } from "./mentions"
import type {
	Bot,
	Conversation,
	ConversationInPage,
	Participant,
} from "./store-contract"
import type { ConversationPreviews, LastWord } from "./transcript-state"

import { avatarSrc } from "../host"
import { rosterTimestamp } from "../bots/roster-timestamp"

type BotFace = Pick<Bot, "name" | "avatarBlot" | "avatarImagePath">

export type ConversationWorker = {
	botId: string
	kind: ActivityIndicatorKind
}

const NO_WORKERS: ConversationWorker[] = []

export type StoredConversation = Conversation &
	Partial<Pick<ConversationInPage, "activeTurn">>

export const storedSpeakerIdsOf = ({
	activeTurn,
}: StoredConversation): string[] | undefined =>
	activeTurn === undefined ? undefined : (activeTurn?.botIds ?? [])

const toBotRow = (id: string, face: BotFace): AppSidebarBot => ({
	id,
	name: face.name,
	blot: face.avatarBlot ?? undefined,
	image: avatarSrc(face.avatarImagePath),
})

const toParticipantRow = (participant: Participant): AppSidebarBot =>
	toBotRow(participant.botId, participant)

const toAuthor = (
	participant: Participant,
	title: string | undefined,
): MessageAuthor => ({
	...toParticipantRow(participant),
	title,
	isLead: participant.role === "lead",
	isDeleted: participant.isDeleted,
})

const titleOf = (bot: Bot): string | undefined => bot.title || undefined

export const toConversationBots = (
	participants: Participant[],
	bots: Bot[],
): RosterBot[] => {
	const titles = new Map(bots.map((bot) => [bot.id, titleOf(bot)]))

	return participants.map((participant) => ({
		...toParticipantRow(participant),
		title: titles.get(participant.botId),
	}))
}

export const toBotRows = (bots: Bot[]): RosterBot[] =>
	bots.map((bot) => toBotRow(bot.id, bot))

export const authorsOf = (
	conversation: Conversation,
	bots: Bot[],
): Map<string, MessageAuthor> => {
	const titles = new Map(bots.map((bot) => [bot.id, bot.title]))

	return new Map(
		conversation.participants.map((participant) => [
			participant.botId,
			toAuthor(participant, titles.get(participant.botId)),
		]),
	)
}

export const leadOf = (conversation: Conversation): string | undefined =>
	conversation.participants.find(
		(participant) => participant.role === "lead" && participant.leftAt === null,
	)?.botId

export const presentParticipants = (
	conversation: Conversation,
): Participant[] =>
	conversation.participants.filter(
		(participant) => participant.leftAt === null && !participant.isDeleted,
	)

export const unseatedBots = (
	bots: Bot[],
	conversation: Conversation,
): RosterBot[] => {
	const seated = new Set(
		presentParticipants(conversation).map((participant) => participant.botId),
	)
	return bots
		.filter((bot) => !seated.has(bot.id))
		.map((bot) => ({ ...toBotRow(bot.id, bot), title: titleOf(bot) }))
}

export const mentionableBots = (
	bots: Bot[],
	conversation: Conversation,
): PromptMentionBot[] => [
	...toConversationBots(presentParticipants(conversation), bots),
	...unseatedBots(bots, conversation).map((bot) => ({
		...bot,
		isOutside: true,
	})),
]

export const isNameless = (conversation: Conversation): boolean =>
	conversation.title.trim().length === 0

export const conversationName = (conversation: Conversation): string =>
	conversation.title.trim() ||
	presentParticipants(conversation)
		.map((participant) => participant.name)
		.join(i18n.t("chat:namelessConversation.separator")) ||
	i18n.t("chat:conversationSettings.untitled")

export const toConversationSettingsValue = (
	conversation: Conversation,
): ConversationSettingsValue => ({
	name: conversation.title,
	instructions: conversation.instructions,
})

export type ConversationRosterActivity = {
	working: Record<string, ConversationWorker[]>
	previews: ConversationPreviews
}

const lastSpokeAt = (
	conversation: Conversation,
	activity: ConversationRosterActivity,
): number => activity.previews[conversation.id]?.at ?? conversation.createdAt

const mostRecentFirst = (
	conversations: Conversation[],
	activity: ConversationRosterActivity,
): Conversation[] =>
	conversations.toSorted(
		(one, other) => lastSpokeAt(other, activity) - lastSpokeAt(one, activity),
	)

const speakerNameAmong = (
	seated: Participant[],
	preview: LastWord | undefined,
): string | undefined =>
	seated.find((participant) => participant.botId === preview?.authorBotId)?.name

const mentionBotsOf = (conversation: Conversation): MentionBot[] =>
	conversation.participants.map(({ botId, name }) => ({ id: botId, name }))

const previewText = (
	conversation: Conversation,
	preview: LastWord | undefined,
): string | undefined =>
	preview?.text && toMentionNames(preview.text, mentionBotsOf(conversation))

const toSeatedRows = (
	seated: Participant[],
	workers: ConversationWorker[],
): AppSidebarBot[] =>
	seated.map((participant) => {
		const worker = workers.find(({ botId }) => botId === participant.botId)
		return {
			...toParticipantRow(participant),
			status: worker ? "working" : "idle",
			pose: worker?.kind,
		}
	})

export const toRosterConversations = (
	conversations: Conversation[],
	activity: ConversationRosterActivity,
	now: number,
): AppSidebarConversation[] =>
	mostRecentFirst(conversations, activity).map((conversation) => {
		const preview = activity.previews[conversation.id]
		const workers = activity.working[conversation.id] ?? NO_WORKERS
		const seated = presentParticipants(conversation)
		return {
			id: conversation.id,
			name: conversationName(conversation),
			sectionId: conversation.sectionId,
			pinPosition: conversation.pinPosition,
			participants: toSeatedRows(seated, workers),
			lastMessage: previewText(conversation, preview),
			lastSpeaker: speakerNameAmong(seated, preview),
			timestamp: preview ? rosterTimestamp(preview.at, now) : undefined,
			lastActivityAt: lastSpokeAt(conversation, activity),
			status: workers.length > 0 ? "working" : "idle",
		}
	})
