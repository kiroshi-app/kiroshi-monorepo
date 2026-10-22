import { skipToken, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import { useMissionChanges } from "./mission-changes"
import type { Mission } from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import { missionsTransport } from "./missions-transport"

import { useReachableHost } from "@/lib/host/use-reachable-host"
import { hasLastReadFailed, isFirstReadPending } from "@/lib/query/last-read"

const NO_MISSIONS: Mission[] = []

export type ConversationMissionsRead = {
	open: Mission[]
	closed: Mission[]
	missions: Mission[]
	isPending: boolean
	hasFailed: boolean
	reload: () => void
}

export const useMissions = (
	conversationId: string | null,
): ConversationMissionsRead => {
	const host = useReachableHost()
	const canRead = conversationId !== null && host !== null
	useMissionChanges()

	const read = useQuery({
		queryKey: missionQueryKeys.conversation(conversationId, host),
		queryFn: canRead ? () => missionsTransport.list(conversationId) : skipToken,
		meta: { rendersErrorInline: true },
	})
	const { data, refetch } = read
	const open = data?.open ?? NO_MISSIONS
	const closed = data?.done ?? NO_MISSIONS
	const isPending = isFirstReadPending(read)
	const hasFailed = hasLastReadFailed(read)

	const reload = useCallback(() => {
		if (canRead) {
			void refetch()
		}
	}, [canRead, refetch])

	const missions = useMemo(() => [...open, ...closed], [open, closed])

	return useMemo(
		() => ({ open, closed, missions, isPending, hasFailed, reload }),
		[open, closed, missions, isPending, hasFailed, reload],
	)
}
