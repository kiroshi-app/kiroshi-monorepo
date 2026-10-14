import {
	type InfiniteData,
	skipToken,
	useInfiniteQuery,
} from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

import { useMissionChanges } from "./mission-changes"
import type { MissionInSpace } from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import {
	type SpaceFeedPage,
	type SpaceMissionGroups,
	type SpaceMissionsRead,
	startOfLocalDay,
	toSpaceMissionGroups,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { isHostRefused } from "@/lib/host/host-refused"
import { useReachableHost } from "@/lib/host/use-reachable-host"
import { isFirstReadPending } from "@/lib/query/last-read"
import { useListEnd } from "@/lib/query/use-list-end"

const SPACE_FEED_PAGE_SIZE = 30

const MOST_SPACE_FEED_PAGES = 10

const NO_GROUPS: SpaceMissionGroups = {
	waitingOnYou: [],
	inProgress: [],
	earlierToday: [],
}

type FeedCursor = {
	closedSince: number
	cursor: string
}

const readSpaceFeedPage = async (
	spaceId: string,
	after: FeedCursor | null,
): Promise<SpaceFeedPage> => {
	const closedSince = after?.closedSince ?? startOfLocalDay(Date.now())
	const page = await missionsTransport.spacePage(
		spaceId,
		closedSince,
		after?.cursor ?? null,
		SPACE_FEED_PAGE_SIZE,
	)
	return { ...page, closedSince }
}

const cursorAfter = (
	{ nextCursor, closedSince }: SpaceFeedPage,
	pages: SpaceFeedPage[],
): FeedCursor | null =>
	nextCursor === null || pages.length >= MOST_SPACE_FEED_PAGES
		? null
		: { closedSince, cursor: nextCursor }

const isFirstSeen =
	(seenIds: Set<string>) =>
	({ mission }: MissionInSpace): boolean => {
		if (seenIds.has(mission.id)) {
			return false
		}
		seenIds.add(mission.id)
		return true
	}

const spaceMissionsReadOf = ({
	pages,
}: InfiniteData<SpaceFeedPage>): SpaceMissionsRead => ({
	closedSince: pages[0].closedSince,
	entries: pages
		.flatMap(({ missions }) => missions)
		.filter(isFirstSeen(new Set())),
})

export type SpaceMissionsView = SpaceMissionGroups & {
	waitingCount: number
	hasLoaded: boolean
	isPending: boolean
	hasFailed: boolean
	isFailureRaised: boolean
	listEnd: ListEnd
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
		meta: { rendersErrorInline: true },
	})
	const { data, error, isError, isFetching, refetch } = feed
	const listEnd = useListEnd(feed)

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
			listEnd,
			reload,
		}),
		[groups, hasLoaded, isPending, hasFailed, isFailureRaised, listEnd, reload],
	)
}
