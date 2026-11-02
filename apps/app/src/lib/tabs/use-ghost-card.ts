import { skipToken, useQuery } from "@tanstack/react-query"

import type { TabDragThumbnailMessage } from "@workspace/ui/components/tab-drag-thumbnail"

import type { TabFaceSources } from "./tab-faces"
import { isListPage, pageOf } from "./tab-pages"
import { tabQueryKeys } from "./tab-query-keys"

import type { TranscriptMessage, TranscriptPage } from "../bindings"
import { readConversationInEverySpace } from "../conversations/read-conversation"
import {
	conversationName,
	presentParticipants,
	toBotRows,
	toConversationLook,
} from "../conversations/roster-conversations"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { isTerminalCompletion } from "../conversations/transcript-state"

export type GhostCardReader = Pick<
	TranscriptStore,
	"bots" | "spaces" | "conversations" | "conversationSoloStates" | "loadPage"
>

export type GhostCardSource = {
	href: string
	spaceId: string | null
	reader: GhostCardReader
}

type GhostCard = {
	companionName: string
	faces: TabFaceSources
	messages: TabDragThumbnailMessage[]
}

const SHOWN_MESSAGES = 2

const NO_BOTS: Bot[] = []

const NO_MESSAGES: TabDragThumbnailMessage[] = []

const INLINE_FAILURE = { rendersErrorInline: true } as const

const threadOf = (href: string) => {
	const page = pageOf(href)
	return isListPage(page) ? page.thread : {}
}

const isShownMessage = ({ completion, content }: TranscriptMessage) =>
	isTerminalCompletion(completion) && content.trim() !== ""

const thumbnailMessageOf = ({
	id,
	role,
	content,
}: TranscriptMessage): TabDragThumbnailMessage => ({
	id,
	author: role === "assistant" ? "companion" : "user",
	text: content.trim(),
})

const lastMessagesOf = ({
	messages,
}: TranscriptPage): TabDragThumbnailMessage[] =>
	messages.filter(isShownMessage).slice(-SHOWN_MESSAGES).map(thumbnailMessageOf)

const conversationFaceOf = (conversation: Conversation) => ({
	id: conversation.id,
	name: conversationName(conversation),
	icon: toConversationLook(conversation).icon,
})

const companionNameOf = (
	bot: Bot | undefined,
	conversation: Conversation | null | undefined,
) =>
	bot?.name ??
	(conversation && presentParticipants(conversation)[0]?.name) ??
	""

const readSoloConversationId = async (
	reader: GhostCardReader,
	spaceId: string,
	botId: string,
) => {
	const states = await reader.conversationSoloStates(spaceId)
	return states.find((state) => state.botId === botId)?.conversationId ?? null
}

export const useGhostCard = ({
	href,
	spaceId,
	reader,
}: GhostCardSource): GhostCard => {
	const { bot, conversation, mission } = threadOf(href)
	const soloSpaceId =
		mission === undefined && conversation === undefined ? spaceId : null

	const { data: bots = NO_BOTS } = useQuery({
		queryKey: tabQueryKeys.ghostBots(spaceId),
		queryFn: bot === undefined ? skipToken : () => reader.bots(spaceId),
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const { data: heldConversation } = useQuery({
		queryKey: tabQueryKeys.ghostConversation(conversation),
		queryFn:
			conversation === undefined
				? skipToken
				: () => readConversationInEverySpace(reader, conversation),
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const { data: soloConversationId } = useQuery({
		queryKey: tabQueryKeys.ghostSoloThread(soloSpaceId, bot),
		queryFn:
			soloSpaceId === null || bot === undefined
				? skipToken
				: () => readSoloConversationId(reader, soloSpaceId, bot),
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const threadConversationId =
		mission === undefined
			? (conversation ?? soloConversationId ?? undefined)
			: undefined

	const { data: messages = NO_MESSAGES } = useQuery({
		queryKey: tabQueryKeys.ghostMessages(threadConversationId),
		queryFn:
			threadConversationId === undefined
				? skipToken
				: () => reader.loadPage(threadConversationId, null),
		select: lastMessagesOf,
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const shownBots = bots.filter((held) => held.id === bot)
	return {
		companionName: companionNameOf(shownBots[0], heldConversation),
		faces: {
			bots: toBotRows(shownBots),
			conversations: heldConversation
				? [conversationFaceOf(heldConversation)]
				: [],
			missionTitles: {},
		},
		messages,
	}
}
