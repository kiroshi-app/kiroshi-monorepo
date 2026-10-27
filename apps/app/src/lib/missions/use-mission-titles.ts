import { skipToken, useQueries } from "@tanstack/react-query"

import { missionQueryKeys } from "./mission-query-keys"
import { readMission } from "./use-mission-detail"

import { useReachableHost } from "@/lib/host/use-reachable-host"
import { useSharedStructure } from "@/lib/use-shared-structure"

export const useMissionTitles = (missionIds: string[]) => {
	const host = useReachableHost()
	const reads = useQueries({
		queries: missionIds.map((missionId) => ({
			queryKey: missionQueryKeys.detail(missionId, host),
			queryFn: host === null ? skipToken : () => readMission(missionId),
			meta: { rendersErrorInline: true },
		})),
	})
	return useSharedStructure(
		Object.fromEntries(
			reads.flatMap(({ data }) =>
				data ? [[data.mission.id, data.mission.ticket.title]] : [],
			),
		),
	)
}
