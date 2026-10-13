import {
	type QueryClient,
	type QueryKey,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { coalescedRead } from "./coalesced-read"
import type {
	ConversationMissions,
	Mission,
	MissionChanged,
} from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import {
	type SpaceMissionsRead,
	withMissionChange,
	withMissionMove,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"
import type { MissionRead } from "./use-mission-detail"

type Following = {
	followers: number
	stop: () => void
}

const followings = new WeakMap<QueryClient, Following>()

const patchedMissions = (
	missions: Mission[],
	changed: MissionChanged,
	patch: (mission: Mission, changed: MissionChanged) => Mission,
): Mission[] =>
	missions.some(({ id }) => id === changed.missionId)
		? missions.map((mission) =>
				mission.id === changed.missionId ? patch(mission, changed) : mission,
			)
		: missions

const patchHeldReads = <Read>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	patch: (held: Read) => Read,
) => {
	const heldReads = queryClient.getQueryCache().findAll({
		queryKey,
		predicate: ({ state }) => state.status === "success",
	})
	for (const { queryKey: heldKey } of heldReads) {
		queryClient.setQueryData<Read>(heldKey, (held) => held && patch(held))
	}
}

const applyChange = (queryClient: QueryClient, changed: MissionChanged) => {
	patchHeldReads<ConversationMissions>(
		queryClient,
		missionQueryKeys.conversations(),
		({ open, done }) => ({
			open: patchedMissions(open, changed, withMissionChange),
			done: patchedMissions(done, changed, withMissionChange),
		}),
	)
	patchHeldReads<SpaceMissionsRead>(
		queryClient,
		missionQueryKeys.spaceFeeds(),
		(held) =>
			held.entries.some(({ mission }) => mission.id === changed.missionId)
				? {
						...held,
						entries: held.entries.map((entry) =>
							entry.mission.id === changed.missionId
								? { ...entry, mission: withMissionMove(entry.mission, changed) }
								: entry,
						),
					}
				: held,
	)
	patchHeldReads<MissionRead>(
		queryClient,
		missionQueryKeys.detailsOf(changed.missionId),
		(held) => ({ ...held, mission: withMissionChange(held.mission, changed) }),
	)
}

const startFollowing = (queryClient: QueryClient): Following => {
	const changedMissionIds = new Set<string>()
	const rereading = coalescedRead(() => {
		queryClient.invalidateQueries({
			queryKey: missionQueryKeys.conversations(),
		})
		queryClient.invalidateQueries({ queryKey: missionQueryKeys.spaceFeeds() })
		for (const missionId of changedMissionIds) {
			queryClient.invalidateQueries({
				queryKey: missionQueryKeys.detailsOf(missionId),
			})
		}
		changedMissionIds.clear()
	})
	const listening = missionsTransport
		.onChanged((changed) => {
			applyChange(queryClient, changed)
			changedMissionIds.add(changed.missionId)
			rereading.request()
		})
		.catch((reason) => {
			console.error(
				"missions: mission changes could not be listened to",
				reason,
			)
			return () => undefined
		})

	return {
		followers: 0,
		stop: () => {
			rereading.cancel()
			void listening.then((unsubscribe) => unsubscribe())
			queryClient.invalidateQueries({
				queryKey: missionQueryKeys.all,
				refetchType: "none",
			})
		},
	}
}

const followMissionChanges = (queryClient: QueryClient) => {
	const following = followings.get(queryClient) ?? startFollowing(queryClient)
	followings.set(queryClient, following)
	following.followers += 1

	return () => {
		following.followers -= 1
		if (following.followers === 0) {
			followings.delete(queryClient)
			following.stop()
		}
	}
}

export const useMissionChanges = () => {
	const queryClient = useQueryClient()

	useEffect(() => followMissionChanges(queryClient), [queryClient])
}
