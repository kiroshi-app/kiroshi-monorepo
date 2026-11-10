import type { HomeMissionState } from "@workspace/ui/components/home-lines"

import type {
	MissionInSpace,
	MissionState,
} from "@/lib/missions/mission-contract"
import { missionStateOf } from "@/lib/missions/missions-model"

export type HomeMissionLineModel = {
	missionId: string
	title: string
	state: HomeMissionState
	roomId: string
	roomTitle: string
	at: number
}

const HOME_STATE_OF: Partial<Record<MissionState, HomeMissionState>> = {
	done: "completed",
	ready_to_merge: "completed",
	waiting_human: "blocked",
	failed: "blocked",
}

const movedAtOf = ({ mission }: MissionInSpace) =>
	mission.closedAt ?? mission.lastActivityAt ?? mission.openedAt

export const homeMissionLinesOf = (
	entries: MissionInSpace[],
	botId: string,
	since: number,
): HomeMissionLineModel[] =>
	entries
		.filter(({ mission }) => mission.botId === botId)
		.flatMap((entry) => {
			const state = HOME_STATE_OF[missionStateOf(entry.mission)]
			return state
				? [
						{
							missionId: entry.mission.id,
							title: entry.mission.ticket.title,
							state,
							roomId: entry.conversationId,
							roomTitle: entry.conversationTitle,
							at: movedAtOf(entry),
						},
					]
				: []
		})
		.filter(({ at }) => at >= since)
		.sort((one, other) => one.at - other.at)
