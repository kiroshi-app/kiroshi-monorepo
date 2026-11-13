import { skipToken, useQuery } from "@tanstack/react-query"

import {
	type TabBot,
	type TabConversation,
	type TabFaceSources,
	tabFaceOf,
} from "./tab-faces"
import { isListPage, pageOf } from "./tab-pages"
import { tabQueryKeys } from "./tab-query-keys"

import {
	conversationName,
	toBotRows,
	toConversationLook,
} from "../conversations/roster-conversations"
import type { Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type GhostIconReader = Pick<TranscriptStore, "bots" | "conversations">

type GhostIconSource = {
	href: string
	spaceId: string | null
	reader: GhostIconReader
}

type GhostRow = {
	bot?: string
	conversation?: string
}

const NO_BOTS: TabBot[] = []

const NO_CONVERSATIONS: TabConversation[] = []

const INLINE_FAILURE = { rendersErrorInline: true } as const

const rowOf = (href: string): GhostRow => {
	const page = pageOf(href)
	if (!isListPage(page) || page.thread.mission !== undefined) {
		return {}
	}
	const { bot, conversation } = page.thread
	return bot === undefined ? { conversation } : { bot }
}

const toTabConversations = (conversations: Conversation[]) =>
	conversations.map(
		(conversation): TabConversation => ({
			id: conversation.id,
			name: conversationName(conversation),
			...toConversationLook(conversation),
		}),
	)

export const useGhostIcon = ({ href, spaceId, reader }: GhostIconSource) => {
	const row = rowOf(href)

	const { data: bots = NO_BOTS } = useQuery({
		queryKey: tabQueryKeys.ghostBots(spaceId),
		queryFn:
			spaceId === null || row.bot === undefined
				? skipToken
				: () => reader.bots(spaceId),
		select: toBotRows,
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const { data: conversations = NO_CONVERSATIONS } = useQuery({
		queryKey: tabQueryKeys.ghostConversations(spaceId),
		queryFn:
			spaceId === null || row.conversation === undefined
				? skipToken
				: () => reader.conversations(spaceId),
		select: toTabConversations,
		staleTime: 0,
		meta: INLINE_FAILURE,
	})

	const sources: TabFaceSources = { bots, conversations, missionTitles: {} }
	return tabFaceOf(href, sources).icon
}
