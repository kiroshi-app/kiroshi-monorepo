import { type ReactNode, useMemo, useSyncExternalStore } from "react"

import type { MissionCardWrap } from "@workspace/ui/components/mission-card"
import {
	type RoutinesFailure,
	RoutinesPanel,
} from "@workspace/ui/components/routines-panel"

import { useRosterClock } from "@/lib/bots/use-roster-clock"
import type { ThreadNaming } from "@/lib/chat/use-thread-roster"
import type { OpenMission } from "@/lib/missions/mission-actions"
import {
	type LiveMissionIds,
	toActivityMissions,
} from "@/lib/missions/missions-model"
import type { ConversationMissionsRead } from "@/lib/missions/use-missions"
import {
	type MissionThreadRuntimes,
	useWaitingMissions,
} from "@/lib/missions/use-waiting-missions"
import type { OpenedRoutineController } from "@/lib/routines/opened-routine-controller"
import { useOpenedRoutine } from "@/lib/routines/use-opened-routine"
import { useRoutines } from "@/lib/routines/use-routines"

type ActivityPanel = {
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	openedRoutine: OpenedRoutineController
}

type ThreadRoutinesProps = {
	activityPanel: ActivityPanel
	conversationId: string | null
	spaceId: string | null
	leadBotId?: string
	liveMissionIds: LiveMissionIds
	missions: ConversationMissionsRead
	runtimes: MissionThreadRuntimes
	faceOf: ThreadNaming["faceOf"]
	onOpenMission: OpenMission
	wrapMissionCard: MissionCardWrap
	children: ReactNode
}

const activityFailure = (
	routines: RoutinesFailure | null,
	hasMissionsFailed: boolean,
): RoutinesFailure | null => {
	if (!hasMissionsFailed) {
		return routines
	}

	return routines === "routines" ? "activity" : "missions"
}

const ThreadRoutines = ({
	activityPanel,
	conversationId,
	spaceId,
	leadBotId,
	liveMissionIds,
	missions,
	runtimes,
	faceOf,
	onOpenMission,
	wrapMissionCard,
	children,
}: ThreadRoutinesProps) => {
	const now = useRosterClock()
	const {
		routines,
		isPending,
		reportedRuns,
		failure,
		reload,
		setEnabled,
		remove,
		form,
		detail,
	} = useRoutines(conversationId, spaceId, leadBotId)
	const opened = useSyncExternalStore(
		activityPanel.openedRoutine.subscribe,
		activityPanel.openedRoutine.getState,
	)
	useOpenedRoutine({
		opened,
		conversationId,
		routines,
		onOpen: detail.onOpen,
		onTaken: activityPanel.openedRoutine.leave,
	})
	const waitingMissionIds = useWaitingMissions(runtimes, missions.open)
	const rows = useMemo(
		() =>
			toActivityMissions({
				open: missions.open,
				closed: missions.closed,
				reportedRuns,
				faceOf,
				waitingMissionIds,
				liveMissionIds,
				now,
			}),
		[
			missions.open,
			missions.closed,
			reportedRuns,
			faceOf,
			waitingMissionIds,
			liveMissionIds,
			now,
		],
	)

	const reloadActivity = () => {
		reload()
		missions.reload()
	}

	return (
		<RoutinesPanel
			detail={detail}
			failure={activityFailure(failure, missions.hasFailed)}
			form={form}
			isOpen={activityPanel.isOpen}
			isMissionsPending={missions.isPending}
			isRoutinesPending={isPending}
			missions={{ ...rows, onOpen: onOpenMission, wrap: wrapMissionCard }}
			onDelete={remove}
			onEnabledChange={setEnabled}
			onOpenChange={activityPanel.onOpenChange}
			onRetry={reloadActivity}
			routines={routines}
		>
			{children}
		</RoutinesPanel>
	)
}

export { type ActivityPanel, ThreadRoutines }
