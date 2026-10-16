import type {
	Mission,
	MissionEvent,
	MissionEventKind,
	MissionInSpace,
	MissionSpacePage,
} from "./mission-contract"

import type { Json } from "@/lib/bindings"

const A_MISSION: Mission = {
	id: "mission-1",
	originConversationId: "room-1",
	spaceId: null,
	botId: "bot-1",
	threadConversationId: "thread-1",
	objective: "Ship the walls",
	ticket: {
		platform: "github",
		externalId: "OPE-32",
		url: "https://example.test/OPE-32",
		title: "Wake the bot",
	},
	tools: ["claude-code"],
	state: "working",
	stateSeq: 1,
	isAgentRunning: false,
	openedAt: 1,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	status: null,
	lastActivityAt: null,
	lastActivity: null,
	commitsAhead: null,
	dirtyFiles: null,
	pullRequestUrl: null,
	branch: null,
	workspacePath: null,
}

export const aMission = (held: Partial<Mission> = {}): Mission => ({
	...A_MISSION,
	...held,
})

type MissionEventSeed = {
	kind: MissionEventKind
	source: string
	payload?: Json
}

const aMissionEvent = (
	{ kind, source, payload = {} }: MissionEventSeed,
	position = 0,
): MissionEvent => ({
	id: `event-${position + 1}`,
	missionId: A_MISSION.id,
	kind,
	source,
	payload,
	createdAt: position + 1,
})

export const missionEvents = (seeds: MissionEventSeed[]): MissionEvent[] =>
	seeds.map(aMissionEvent)

export const aSpacePage = (
	missions: MissionInSpace[],
	nextCursor: string | null = null,
): MissionSpacePage => ({ missions, nextCursor })
