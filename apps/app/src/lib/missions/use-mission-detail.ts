import { skipToken, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import type { MissionEventModel } from "@workspace/ui/components/mission"

import { useMissionChanges } from "./mission-changes"
import type { Mission } from "./mission-contract"
import { missionQueryKeys } from "./mission-query-keys"
import { toMissionEventModels } from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { useReachableHost } from "@/lib/host/use-reachable-host"
import { hasLastReadFailed, isFirstReadPending } from "@/lib/query/last-read"

export type MissionRead = {
	mission: Mission
	events: MissionEventModel[]
	readAt: number
}

export type MissionDetailRead = {
	read: MissionRead | null
	isReading: boolean
	isPending: boolean
	hasFailedToRead: boolean
	onRetry: () => void
}

export const readMission = async (missionId: string): Promise<MissionRead> => {
	const detail = await missionsTransport.detail(missionId)
	return {
		mission: detail.mission,
		events: toMissionEventModels(detail.events),
		readAt: Date.now(),
	}
}

export const useMissionDetail = (missionId: string): MissionDetailRead => {
	const host = useReachableHost()
	const canRead = host !== null
	const [isRetrying, setRetrying] = useState(false)
	useMissionChanges()

	const detail = useQuery({
		queryKey: missionQueryKeys.detail(missionId, host),
		queryFn: canRead ? () => readMission(missionId) : skipToken,
		meta: { rendersErrorInline: true },
	})
	const { data, isPending, refetch } = detail
	const read = data ?? null
	const hasFailedToRead = hasLastReadFailed(detail)
	const isReading = isPending || isRetrying
	const isFirstPending = isFirstReadPending(detail)

	const onRetry = useCallback(() => {
		if (!canRead) {
			return
		}
		setRetrying(true)
		void refetch().then(() => setRetrying(false))
	}, [canRead, refetch])

	return useMemo(
		() => ({
			read,
			isReading,
			isPending: isFirstPending,
			hasFailedToRead,
			onRetry,
		}),
		[read, isReading, isFirstPending, hasFailedToRead, onRetry],
	)
}
