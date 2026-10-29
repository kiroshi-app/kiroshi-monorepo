import { skipToken, useQueries } from "@tanstack/react-query"

import { missionQueryKeys } from "./mission-query-keys"
import { readMission, useMissionHost } from "./use-mission-detail"

import { useSharedStructure } from "@/lib/use-shared-structure"

export const useMissionTitles = (missionIds: string[], spaceRowId: string) => {
	const host = useMissionHost(spaceRowId)
	const reads = useQueries({
		queries: missionIds.map((missionId) => ({
			queryKey: missionQueryKeys.detail(missionId, host),
			queryFn: host === null ? skipToken : () => readMission(host, missionId),
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
