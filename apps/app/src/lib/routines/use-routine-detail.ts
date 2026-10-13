import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"

import type { RoutineRunModel } from "@workspace/ui/components/routine-detail"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import type { RoutinesPanelDetail } from "@workspace/ui/components/routines-panel"

import { routineQueryKeys } from "./routine-query-keys"
import { toRunModels } from "./routines-model"
import { DEFAULT_RUN_PAGE, routinesTransport } from "./routines-transport"

import { useReachableHost } from "@/lib/host/use-reachable-host"
import { hasLastReadFailed } from "@/lib/query/last-read"

type RunsRead = {
	runs: RoutineRunModel[]
	readAt: number
	hasReadFullPage: boolean
}

export type RoutineDetailWiring = {
	routines: RoutineRowModel[]
	onWriteFailure: () => void
}

const readRuns = async (routineId: string): Promise<RunsRead> => {
	const carried = await routinesTransport.runs(routineId)
	return {
		runs: toRunModels(carried),
		readAt: Date.now(),
		hasReadFullPage: carried.length >= DEFAULT_RUN_PAGE,
	}
}

export const useRoutineDetail = ({
	routines,
	onWriteFailure,
}: RoutineDetailWiring): RoutinesPanelDetail => {
	const [openedId, setOpenedId] = useState<string | null>(null)
	const host = useReachableHost()
	const canRead = openedId !== null && host !== null

	const runsRead = useQuery({
		queryKey: routineQueryKeys.runsOf(openedId, host),
		queryFn: canRead ? () => readRuns(openedId) : skipToken,
		gcTime: 0,
		meta: { rendersErrorInline: true },
	})
	const { data: read, isFetching, refetch } = runsRead
	const hasFailedToReadRuns = hasLastReadFailed(runsRead)

	const running = useMutation({
		mutationFn: (routineId: string) => routinesTransport.runNow(routineId),
		onError: onWriteFailure,
		meta: { rendersErrorInline: true },
	})
	const { mutate: runNow, reset: forgetRun } = running
	const isRunningOpened = running.isPending && running.variables === openedId
	const decision = running.variables === openedId ? running.data : undefined

	const onOpen = useCallback(
		(routineId: string) => {
			forgetRun()
			setOpenedId(routineId)
		},
		[forgetRun],
	)

	const onClose = useCallback(() => {
		forgetRun()
		setOpenedId(null)
	}, [forgetRun])

	const onRetryRuns = useCallback(() => {
		if (canRead) {
			void refetch({ cancelRefetch: false })
		}
	}, [canRead, refetch])

	const onRunNow = useCallback(() => {
		if (openedId && !isRunningOpened) {
			runNow(openedId)
		}
	}, [openedId, isRunningOpened, runNow])

	const open = useMemo(() => {
		const row = routines.find(({ id }) => id === openedId)
		if (!row) {
			return null
		}

		return {
			id: row.id,
			title: row.title,
			triggerSourceTitle: row.triggerSourceTitle,
			hasStoppedItself: row.hasStoppedItself,
			runs: read?.runs ?? [],
			isReadingRuns: isFetching,
			hasFailedToReadRuns,
			hasReadFullPage: read?.hasReadFullPage ?? false,
			isRunning: isRunningOpened,
			refusal: decision?.kind === "refused" ? decision.by : undefined,
			now: read?.readAt ?? 0,
		}
	}, [
		routines,
		openedId,
		read,
		isFetching,
		hasFailedToReadRuns,
		isRunningOpened,
		decision,
	])

	return useMemo(
		() => ({ open, onOpen, onClose, onRetryRuns, onRunNow }),
		[open, onOpen, onClose, onRetryRuns, onRunNow],
	)
}
