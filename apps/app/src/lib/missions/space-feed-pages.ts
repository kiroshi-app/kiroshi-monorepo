import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query"

import type { MissionInSpace } from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import { type SpaceFeedPage, startOfLocalDay } from "./missions-model"
import { missionsTransport } from "./missions-transport"

const SPACE_FEED_PAGE_SIZE = 30

export type FeedCursor = {
	closedSince: number
	cursor: string
}

export type SpaceFeed = InfiniteData<SpaceFeedPage, FeedCursor | null>

export const readSpaceFeedPage = async (
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

export const cursorAfter = ({
	nextCursor,
	closedSince,
}: SpaceFeedPage): FeedCursor | null =>
	nextCursor === null ? null : { closedSince, cursor: nextCursor }

const pushedOutOf = (
	heldHead: SpaceFeedPage,
	head: SpaceFeedPage,
	isInHead: (entry: MissionInSpace) => boolean,
): MissionInSpace[] => {
	const lastStillInHead = heldHead.missions.findLastIndex(isInHead)
	return head.nextCursor === null || lastStillInHead === -1
		? []
		: heldHead.missions.slice(lastStillInHead + 1)
}

export const withFreshHead = (
	held: SpaceFeed,
	head: SpaceFeedPage,
): SpaceFeed => {
	const [heldHead, ...laterPages] = held.pages
	const headIds = new Set(head.missions.map(({ mission }) => mission.id))
	const isInHead = ({ mission }: MissionInSpace) => headIds.has(mission.id)
	const isOutOfHead = (entry: MissionInSpace) => !isInHead(entry)
	return {
		pageParams: held.pageParams,
		pages: [
			{
				...head,
				missions: [...head.missions, ...pushedOutOf(heldHead, head, isInHead)],
			},
			...laterPages.map((page) => ({
				...page,
				missions: page.missions.filter(isOutOfHead),
			})),
		],
	}
}

const spaceIdOfFeed = (queryKey: QueryKey): string | null => {
	const spaceId = queryKey[missionQueryKeys.spaceFeeds().length]
	return typeof spaceId === "string" ? spaceId : null
}

const rereadHeadOf = async (
	queryClient: QueryClient,
	queryKey: QueryKey,
	spaceId: string,
) => {
	const head = await readSpaceFeedPage(spaceId, null)
	await queryClient.cancelQueries({ queryKey, exact: true })
	queryClient.setQueryData<SpaceFeed>(
		queryKey,
		(held) => held && withFreshHead(held, head),
	)
}

const rereadInFull = (queryClient: QueryClient, queryKey: QueryKey) =>
	queryClient.invalidateQueries({ queryKey, exact: true })

const rereadShownFeed = (queryClient: QueryClient, queryKey: QueryKey) => {
	const spaceId = spaceIdOfFeed(queryKey)
	const isHeld = queryClient.getQueryData(queryKey) !== undefined
	if (spaceId === null || !isHeld) {
		return rereadInFull(queryClient, queryKey)
	}
	return rereadHeadOf(queryClient, queryKey, spaceId).catch(() =>
		rereadInFull(queryClient, queryKey),
	)
}

export const rereadSpaceFeeds = (queryClient: QueryClient) => {
	const feeds = queryClient
		.getQueryCache()
		.findAll({ queryKey: missionQueryKeys.spaceFeeds() })
	for (const feed of feeds) {
		if (feed.isActive()) {
			void rereadShownFeed(queryClient, feed.queryKey)
		} else {
			void queryClient.invalidateQueries({
				queryKey: feed.queryKey,
				exact: true,
				refetchType: "none",
			})
		}
	}
}
