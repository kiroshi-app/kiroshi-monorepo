import type {
	ConversationMissions,
	Mission,
	MissionChanged,
	MissionDetail,
	MissionInSpace,
	MissionOnBoard,
	MissionSpacePage,
} from "./mission-contract"
import { createMissionEventRead } from "./mission-event-read"

import {
	activeJoinedSpaceId,
	invoke,
	invokeOn,
	invokeOnThisComputer,
	listen,
	listenOnThisComputer,
} from "../host"
import type { Bot, Chat } from "../conversations/store-contract"

export const MISSION_CHANGED_EVENT = "mission://changed"

const NOT_ON_A_JOINED_SPACE: MissionOnBoard[] = []

type MissionHost = {
	invoke: typeof invoke
	listen: typeof listenOnThisComputer
}

const missionCallsOn = ({ invoke, listen }: MissionHost) => ({
	board: () => invoke<MissionOnBoard[]>("mission_board"),
	unreported: () => invoke<MissionOnBoard[]>("mission_unreported"),
	reported: (missionId: string, turnId: string | null) =>
		invoke<Mission>("mission_reported", { missionId, turnId }),
	answered: (missionId: string, seq: number) =>
		invoke<Mission>("mission_answered", { missionId, seq }),
	detail: (missionId: string) =>
		invoke<MissionDetail>("mission_detail", { missionId }),
	rosterBlock: (conversationId: string, botId: string) =>
		invoke<string | null>("conversation_roster_block", {
			conversationId,
			botId,
		}),
	onChanged: (
		listener: (changed: MissionChanged, hostId?: string | null) => void,
	) =>
		listen<MissionChanged>(
			MISSION_CHANGED_EVENT,
			({ payload }, hostId?: string | null) => listener(payload, hostId),
		),
})

const missionCallsOfTheActiveHost = missionCallsOn({ invoke, listen })

const readMissionOfEvent = createMissionEventRead({
	detailOn: (hostId, missionId) =>
		invokeOn(hostId)<MissionDetail>("mission_detail", { missionId }),
})

const readBoardOfThisMac = () =>
	activeJoinedSpaceId() === null
		? missionCallsOfTheActiveHost.board()
		: Promise.resolve(NOT_ON_A_JOINED_SPACE)

export const missionsTransport = {
	...missionCallsOfTheActiveHost,
	board: readBoardOfThisMac,
	read: readMissionOfEvent,
	spaceFeed: (spaceId: string, closedSince: number) =>
		invoke<MissionInSpace[]>("mission_space_feed", { spaceId, closedSince }),
	spacePage: (
		spaceId: string,
		closedSince: number,
		cursor: string | null,
		limit: number,
	) =>
		invoke<MissionSpacePage>("mission_space_page", {
			spaceId,
			closedSince,
			cursor,
			limit,
		}),
	close: (missionId: string) => invoke<Mission>("mission_close", { missionId }),
	reopen: (missionId: string) =>
		invoke<Mission>("mission_reopen", { missionId }),
	list: (conversationId: string) =>
		invoke<ConversationMissions>("mission_list", { conversationId }),
}

export const missionRunTransport = {
	...missionCallsOn({
		invoke: invokeOnThisComputer,
		listen: listenOnThisComputer,
	}),
	read: readMissionOfEvent,
	bots: () =>
		invokeOnThisComputer<Bot[]>("conversation_bots", { spaceId: null }),
	mainChat: (botId: string) =>
		invokeOnThisComputer<Chat>("conversation_main_chat", {
			botId,
			spaceId: null,
		}),
}
