import { skipToken, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import { useMissionChanges } from "./mission-changes"
import { missionQueryKeys } from "./mission-query-keys"
import {
	type SpaceMissionGroups,
	type SpaceMissionsRead,
	startOfLocalDay,
	toSpaceMissionGroups,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { isHostRefused } from "@/lib/host/host-refused"
import { useReachableHost } from "@/lib/host/use-reachable-host"
import { isFirstReadPending } from "@/lib/query/last-read"

const NO_GROUPS: SpaceMissionGroups = {
	waitingOnYou: [],
	inProgress: [],
	earlierToday: [],
}

const readSpaceFeed = async (spaceId: string): Promise<SpaceMissionsRead> => {
	const closedSince = startOfLocalDay(Date.now())
	const entries = await missionsTransport.spaceFeed(spaceId, closedSince)
	return { closedSince, entries }
}

export type SpaceMissionsView = SpaceMissionGroups & {
	waitingCount: number
	hasLoaded: boolean
	isPending: boolean
	hasFailed: boolean
	isFailureRaised: boolean
	reload: () => void
}

export const useSpaceMissions = (spaceId: string | null): SpaceMissionsView => {
	const host = useReachableHost()
	const canRead = spaceId !== null && host !== null
	const [isRetrying, setRetrying] = useState(false)
	useMissionChanges()

	const feed = useQuery({
		queryKey: missionQueryKeys.spaceFeed(spaceId, host),
		queryFn: canRead ? () => readSpaceFeed(spaceId) : skipToken,
		meta: { rendersErrorInline: true },
	})
	const { data, error, isError, isFetching, refetch } = feed

	const reload = useCallback(() => {
		if (!canRead) {
			return
		}
		setRetrying(true)
		void refetch().then(() => setRetrying(false))
	}, [canRead, refetch])

	const hasLoaded = data !== undefined
	const isPending = isFirstReadPending(feed)
	const groups = useMemo(
		() => (data ? toSpaceMissionGroups(data) : NO_GROUPS),
		[data],
	)
	const hasFailed = isError && !isFetching && !isRetrying
	const isFailureRaised = hasFailed && isHostRefused(error)

	return useMemo(
		() => ({
			...groups,
			waitingCount: groups.waitingOnYou.length,
			hasLoaded,
			isPending,
			hasFailed,
			isFailureRaised,
			reload,
		}),
		[groups, hasLoaded, isPending, hasFailed, isFailureRaised, reload],
	)
}
