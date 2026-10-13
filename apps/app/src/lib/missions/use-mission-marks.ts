import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { coalescedRead } from "./coalesced-read"
import { missionQueryKeys } from "./mission-query-keys"
import type { MissionEntry } from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { isHostOffline } from "@/lib/host/host-offline"
import { isHostRefused } from "@/lib/host/host-refused"
import { LOCAL_HOST, useReachableHost } from "@/lib/host/use-reachable-host"

type MarksRead = {
	source: string
	read: () => Promise<MissionEntry[]>
}

const NO_MARKS: MissionEntry[] = []

const REREAD_ON_EVERY_SWITCH = 0

const marksReadOf = (
	host: string | null,
	spaceId: string | null,
): MarksRead | null => {
	if (host === LOCAL_HOST) {
		return { source: LOCAL_HOST, read: missionsTransport.board }
	}
	if (!host || !spaceId) {
		return null
	}
	return {
		source: `${host}/${spaceId}`,
		read: () => missionsTransport.spaceFeed(spaceId, Date.now()),
	}
}

const isHostUnreachable = (error: unknown) =>
	isHostOffline(error) || isHostRefused(error)

const useRereadOnMissionChange = () => {
	const queryClient = useQueryClient()

	useEffect(() => {
		const rereading = coalescedRead(() => {
			queryClient.invalidateQueries({ queryKey: missionQueryKeys.marks() })
		})
		const listening = missionsTransport
			.onChanged(rereading.request)
			.catch((reason) => {
				console.error(
					"roster: mission changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			rereading.cancel()
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [queryClient])
}

export const useMissionMarks = (
	shownSpaceId: string | null,
): MissionEntry[] => {
	const marksRead = marksReadOf(useReachableHost(), shownSpaceId)
	const { data = NO_MARKS, isError } = useQuery({
		queryKey: missionQueryKeys.marksOf(marksRead?.source ?? null),
		queryFn: marksRead?.read ?? skipToken,
		staleTime: REREAD_ON_EVERY_SWITCH,
		meta: {
			failureNotice: () => ({
				title: i18n.t("bots:roster.mission.unavailable.title"),
				description: i18n.t("bots:roster.mission.unavailable.description"),
			}),
			raisedIn: "use-mission-marks",
			isSilentOn: isHostUnreachable,
			raisesOncePerOutage: true,
		},
	})

	useRereadOnMissionChange()

	return isError ? NO_MARKS : data
}
