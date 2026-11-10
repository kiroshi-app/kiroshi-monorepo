import { skipToken, useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { homeQueryKeys } from "./home-query-keys"

import { AGENT_ROOMS_CHANGED_EVENT } from "@/lib/bindings"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { useInvalidateOnHostEvent } from "@/lib/query/host-invalidations"

const NO_ROOM_IDS: string[] = []

const AGENT_ROOMS_INVALIDATED = [homeQueryKeys.agentRooms()]

export const useAgentRooms = (
	store: Pick<TranscriptStore, "agentRooms">,
	spaceId: string | null,
	botId: string,
): string[] => {
	const { data } = useQuery({
		queryKey: homeQueryKeys.agentRoomsIn(spaceId),
		queryFn: spaceId
			? ({ signal }) => store.agentRooms(spaceId, signal)
			: skipToken,
		meta: {
			failureNotice: () => ({
				title: i18n.t("chat:home.failure.rooms.title"),
				description: i18n.t("chat:home.failure.rooms.description"),
			}),
			raisedIn: "use-agent-rooms",
		},
	})
	useInvalidateOnHostEvent(AGENT_ROOMS_CHANGED_EVENT, AGENT_ROOMS_INVALIDATED)

	return (
		data?.find((rooms) => rooms.botId === botId)?.conversationIds ?? NO_ROOM_IDS
	)
}
