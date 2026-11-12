import { skipToken, useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { localDayAt } from "./today-conversations"

import { conversationQueryKeys } from "../conversations/conversation-query-keys"
import type { ConversationInPage } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

type TodayStore = Pick<TranscriptStore, "conversationTodayOfAgent">

type TodayOfAgent = {
	spaceRowId: string | null
	spaceId: string | null
	agentId: string
	now: number
}

type TodayConversations = {
	conversations: ConversationInPage[]
	hasFailedToLoad: boolean
}

const NO_CONVERSATIONS: ConversationInPage[] = []

const TODAY_READS = [conversationQueryKeys.todays()]

const NOTICED_FAILURE = {
	failureNotice: () => ({
		title: i18n.t("chat:home.failure.rooms.title"),
		description: i18n.t("chat:home.failure.rooms.description"),
	}),
	raisedIn: "use-today-conversations",
}

export const useTodayConversations = (
	store: TodayStore,
	{ spaceRowId, spaceId, agentId, now }: TodayOfAgent,
): TodayConversations => {
	const day = localDayAt(now)

	const { data = NO_CONVERSATIONS, isError } = useQuery({
		queryKey: conversationQueryKeys.todayOfAgent(
			spaceRowId,
			spaceId,
			agentId,
			day.start,
			day.end,
		),
		queryFn:
			spaceRowId === null || spaceId === null
				? skipToken
				: ({ signal }) =>
						store.conversationTodayOfAgent(
							spaceId,
							agentId,
							day.start,
							day.end,
							signal,
						),
		meta: NOTICED_FAILURE,
	})

	useInvalidateOnHostEvent("conversation://created", TODAY_READS)
	useInvalidateOnHostEvent("conversation://updated", TODAY_READS)
	useInvalidateOnHostEvent("conversation://state-changed", TODAY_READS)
	useInvalidateOnHostEvent("conversation://deleted", TODAY_READS)

	return { conversations: data, hasFailedToLoad: isError }
}
