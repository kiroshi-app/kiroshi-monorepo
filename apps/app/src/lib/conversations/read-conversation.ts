import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"

import { activeJoinedSpaceId } from "../host"

export type ConversationReader = Pick<
	TranscriptStore,
	"spaces" | "conversations"
>

const idsOfSpacesIn = async (store: ConversationReader) => {
	const spaces = await store.spaces()
	return spaces.map(({ id }) => id)
}

const spaceIdsToRead = (store: ConversationReader) => {
	const joinedSpaceId = activeJoinedSpaceId()
	return joinedSpaceId ? [joinedSpaceId] : idsOfSpacesIn(store)
}

const findConversationIn = async (
	store: ConversationReader,
	spaceIds: string[],
	conversationId: string,
): Promise<Conversation | null> => {
	const seated = await Promise.all(
		spaceIds.map((spaceId) => store.conversations(spaceId)),
	)
	return seated.flat().find(({ id }) => id === conversationId) ?? null
}

export const readConversation = async (
	store: ConversationReader,
	conversationId: string,
): Promise<Conversation | null> =>
	findConversationIn(store, await spaceIdsToRead(store), conversationId)

export const readConversationInEverySpace = async (
	store: ConversationReader,
	conversationId: string,
): Promise<Conversation | null> =>
	findConversationIn(store, await idsOfSpacesIn(store), conversationId)
