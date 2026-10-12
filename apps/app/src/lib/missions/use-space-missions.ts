import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { coalescedRead } from "./coalesced-read"
import type { MissionChanged, MissionInSpace } from "./mission-contract"
import {
	type SpaceMissionGroups,
	startOfLocalDay,
	toSpaceMissionGroups,
	withMissionMove,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { isHostRefused } from "@/lib/host/host-refused"
import { useHostReconnections } from "@/lib/host/use-host-reconnections"
import { useReachableHost } from "@/lib/host/use-reachable-host"

type FailedRead = {
	spaceId: string
	isRaised: boolean
}

type HeldSpaceMissions = {
	spaceId: string
	closedSince: number
	entries: MissionInSpace[]
}

const NO_GROUPS: SpaceMissionGroups = {
	waitingOnYou: [],
	inProgress: [],
	earlierToday: [],
}

const withChangeApplied =
	(changed: MissionChanged) =>
	(held: HeldSpaceMissions | null): HeldSpaceMissions | null =>
		held?.entries.some(({ mission }) => mission.id === changed.missionId)
			? {
					...held,
					entries: held.entries.map((entry) =>
						entry.mission.id === changed.missionId
							? { ...entry, mission: withMissionMove(entry.mission, changed) }
							: entry,
					),
				}
			: held

export type SpaceMissionsView = SpaceMissionGroups & {
	waitingCount: number
	hasLoaded: boolean
	hasFailed: boolean
	isFailureRaised: boolean
	reload: () => void
}

export const useSpaceMissions = (spaceId: string | null): SpaceMissionsView => {
	const [held, setHeld] = useState<HeldSpaceMissions | null>(null)
	const [failed, setFailed] = useState<FailedRead | null>(null)
	const reads = useRef(0)
	const host = useReachableHost()

	const reload = useCallback(() => {
		reads.current += 1
		setFailed(null)
		if (!spaceId || !host) {
			return
		}

		const ticket = reads.current
		const closedSince = startOfLocalDay(Date.now())

		missionsTransport.spaceFeed(spaceId, closedSince).then(
			(entries) => {
				if (ticket !== reads.current) {
					return
				}

				setHeld({ spaceId, closedSince, entries })
				setFailed(null)
			},
			(reason) => {
				if (ticket === reads.current) {
					setFailed({ spaceId, isRaised: isHostRefused(reason) })
				}
			},
		)
	}, [spaceId, host])

	useEffect(reload, [reload])

	useHostReconnections(reload)

	useEffect(() => {
		const rereading = coalescedRead(reload)
		const applyChange = (changed: MissionChanged) => {
			setHeld(withChangeApplied(changed))
			rereading.request()
		}
		const listening = missionsTransport
			.onChanged(applyChange)
			.catch((reason) => {
				console.error(
					"missions tab: mission changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			rereading.cancel()
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [reload])

	const hasLoaded = spaceId !== null && held?.spaceId === spaceId
	const groups = useMemo(
		() => (hasLoaded && held ? toSpaceMissionGroups(held) : NO_GROUPS),
		[hasLoaded, held],
	)
	const hasFailed = spaceId !== null && failed?.spaceId === spaceId
	const isFailureRaised = hasFailed && failed?.isRaised === true

	return useMemo(
		() => ({
			...groups,
			waitingCount: groups.waitingOnYou.length,
			hasLoaded,
			hasFailed,
			isFailureRaised,
			reload,
		}),
		[groups, hasLoaded, hasFailed, isFailureRaised, reload],
	)
}
