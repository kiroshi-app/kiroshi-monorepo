import { skipToken, useInfiniteQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import { useMissionChanges } from "./mission-changes"
import type { MissionInSpace } from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import {
	type SpaceMissionGroups,
	type SpaceMissionsRead,
	toSpaceMissionGroups,
} from "./missions-model"
import {
	cursorAfter,
	type FeedCursor,
	readSpaceFeedPage,
	type SpaceFeed,
} from "./space-feed-pages"

import { isHostRefused } from "@/lib/host/host-refused"
import { useReachableHost } from "@/lib/host/use-reachable-host"
import { isFirstReadPending, isReadErrorShown } from "@/lib/query/last-read"

const NO_GROUPS: SpaceMissionGroups = {
	waitingOnYou: [],
	inProgress: [],
	earlierToday: [],
}

const withoutRepeats = (entries: MissionInSpace[]): MissionInSpace[] => {
	const seenIds = new Set<string>()
	return entries.filter(({ mission }) => {
		const isRepeat = seenIds.has(mission.id)
		seenIds.add(mission.id)
		return !isRepeat
	})
}

const spaceMissionsReadOf = ({ pages }: SpaceFeed): SpaceMissionsRead => ({
	closedSince: pages[0].closedSince,
	entries: withoutRepeats(pages.flatMap(({ missions }) => missions)),
})

export type SpaceMissionsView = SpaceMissionGroups & {
	openCount: number
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

	const feed = useInfiniteQuery({
		queryKey: missionQueryKeys.spaceFeed(spaceId, host),
		queryFn: canRead
			? ({ pageParam }) => readSpaceFeedPage(spaceId, pageParam)
			: skipToken,
		initialPageParam: null as FeedCursor | null,
		getNextPageParam: cursorAfter,
		select: spaceMissionsReadOf,
		meta: { rendersErrorInline: true, rereadsItselfOnReconnect: true },
	})
	const { data, error, isError, isFetching, refetch } = feed

	const reload = useCallback(() => {
		if (!canRead) {
			return
		}
		setRetrying(true)
		void refetch().then(() => setRetrying(false))
	}, [canRead, refetch])

	const isPending = isFirstReadPending(feed)
	const groups = useMemo(
		() => (data ? toSpaceMissionGroups(data) : NO_GROUPS),
		[data],
	)
	const hasFailed =
		isError && isReadErrorShown(error) && !isFetching && !isRetrying
	const isFailureRaised = hasFailed && isHostRefused(error)

	return useMemo(
		() => ({
			...groups,
			openCount: groups.waitingOnYou.length + groups.inProgress.length,
			isPending,
			hasFailed,
			isFailureRaised,
			reload,
		}),
		[groups, isPending, hasFailed, isFailureRaised, reload],
	)
}
