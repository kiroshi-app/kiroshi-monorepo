import type { MissionState } from "@/lib/bindings"

export type {
	ConversationMissions,
	Mission,
	MissionDetail,
	MissionEvent,
	MissionEventKind,
	MissionInSpace,
	MissionOnBoard,
	MissionSpacePage,
	MissionState,
} from "@/lib/bindings"

export type MissionChanged = {
	missionId: string
	state: MissionState
	stateSeq: number
	isAgentRunning: boolean
	lastActivityAt: number | null
}
