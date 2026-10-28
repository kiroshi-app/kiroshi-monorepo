import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarRowMission,
	AppSidebarSection,
	Space,
	UserChipIdentity,
} from "@workspace/ui/components/app-sidebar"
import {
	BLOT_HUES,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"
import type { ConversationIconName } from "@workspace/ui/components/icons"
import type {
	MissionCardModel,
	MissionState,
} from "@workspace/ui/components/mission"
import type { MissionsPanelProps } from "@workspace/ui/components/missions-panel"
import type { RosterBot } from "@workspace/ui/components/roster"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import { SCENE_COPY, TICKET_PLATFORM } from "./copy"

import { CHIP_STATE_OF } from "../../app/src/lib/missions/mission-chip-states"

type BotCopy = {
	name: string
	title: string
	preview: string
	timestamp: string
}

type BotLook = {
	id: string
	blot: BotAvatarBlot
}

const castBot = (look: BotLook, copy: BotCopy): RosterBot => ({
	...look,
	blot: BLOT_HUES[look.blot],
	name: copy.name,
	title: copy.title,
})

const MOCHI = castBot({ id: "mochi", blot: "pink" }, SCENE_COPY.bots.mochi)

const OLIVE = castBot({ id: "olive", blot: "green" }, SCENE_COPY.bots.olive)

const PIP = castBot({ id: "pip", blot: "yellow" }, SCENE_COPY.bots.pip)

const TOMO = castBot({ id: "tomo", blot: "cyan" }, SCENE_COPY.bots.tomo)

const ASH = castBot({ id: "ash", blot: "purple" }, SCENE_COPY.bots.ash)

const WREN = castBot({ id: "wren", blot: "orange" }, SCENE_COPY.bots.wren)

const IVY = castBot({ id: "ivy", blot: "blue" }, SCENE_COPY.bots.ivy)

const SABLE = castBot({ id: "sable", blot: "purple" }, SCENE_COPY.bots.sable)

const JUNO = castBot({ id: "juno", blot: "red" }, SCENE_COPY.bots.juno)

const rosterRow = (bot: RosterBot, copy: BotCopy): AppSidebarBot => ({
	...bot,
	lastMessage: copy.preview,
	timestamp: copy.timestamp,
})

type ConversationCopy = {
	name: string
	speaker: string
	preview: string
	timestamp: string
}

type ConversationLook = {
	icon: ConversationIconName
	color: number
}

type ConversationInput = {
	id: string
	copy: ConversationCopy
	look: ConversationLook
	participants: RosterBot[]
}

const castConversation = ({
	id,
	copy,
	look,
	participants,
}: ConversationInput): AppSidebarConversation => ({
	id,
	name: copy.name,
	participants,
	lastSpeaker: copy.speaker,
	lastMessage: copy.preview,
	timestamp: copy.timestamp,
	...look,
})

type RosterPlace = {
	pinPosition: number
	sectionId?: string
}

const placed = <Row extends AppSidebarBot | AppSidebarConversation>(
	row: Row,
	place: RosterPlace,
): Row => ({ ...row, ...place })

type SceneMissionInput = {
	bot: RosterBot
	objective: string
	timestamp: string
	externalId: string
	ticketTitle: string
	tools: string[]
}

const sceneMission = ({
	bot,
	objective,
	timestamp,
	externalId,
	ticketTitle,
	tools,
}: SceneMissionInput): MissionCardModel => ({
	id: `mission-${bot.id}`,
	identity: bot,
	objective,
	ticket: {
		platform: TICKET_PLATFORM,
		externalId,
		title: ticketTitle,
		url: "",
	},
	tools,
	state: "working",
	isWorking: true,
	isClosed: false,
	timestamp,
})

type ActivityMissionInput = SceneMissionInput & {
	state: MissionState
}

type SceneMission = MissionCardModel & {
	botId: string
}

const missionRow = ({
	state,
	...mission
}: ActivityMissionInput): SceneMission => ({
	...sceneMission(mission),
	botId: mission.bot.id,
	state,
	isWorking: state === "working",
})

type RoutineCopy = {
	title: string
	trigger: string
}

const routineRow = (id: string, copy: RoutineCopy): RoutineRowModel => ({
	id,
	title: copy.title,
	triggerSourceTitle: copy.trigger,
	isEnabled: true,
	hasStoppedItself: false,
})

type SceneLoop = {
	request: string
	speakers: readonly [RosterBot, RosterBot]
	answers: readonly [string, string]
	mission: MissionCardModel
}

type SceneSpace = Space & {
	colour: number
	bots: RosterBot[]
	rows: AppSidebarBot[]
	conversations: AppSidebarConversation[]
	sections: AppSidebarSection[]
	defaultConversation: AppSidebarConversation
	openTabIds: string[]
	missions: SceneMission[]
	routines: RoutineRowModel[]
	loop: SceneLoop
}

const rowMissionsOf = (mission: SceneMission): AppSidebarRowMission[] => {
	const state = CHIP_STATE_OF[mission.state]
	if (!state) return []

	const { platform, externalId, title } = mission.ticket
	return [{ id: mission.id, state, ticket: { platform, externalId, title } }]
}

const withRowMissions = (space: SceneSpace): SceneSpace => ({
	...space,
	rows: space.rows.map((row) => {
		const missions = space.missions
			.filter((mission) => mission.botId === row.id)
			.flatMap(rowMissionsOf)
		return missions.length > 0 ? { ...row, missions } : row
	}),
})

const LISBON = castConversation({
	id: "lisbon-in-may",
	copy: SCENE_COPY.conversations.lisbon,
	look: { icon: "Globe", color: BLOT_HUES.cyan },
	participants: [TOMO, ASH, OLIVE],
})

const MOVE = castConversation({
	id: "the-move",
	copy: SCENE_COPY.conversations.move,
	look: { icon: "Calendar", color: BLOT_HUES.orange },
	participants: [MOCHI, TOMO],
})

const RELEASE = castConversation({
	id: "release-4-2",
	copy: SCENE_COPY.conversations.release,
	look: { icon: "Rocket", color: BLOT_HUES.purple },
	participants: [IVY, SABLE, WREN],
})

const TRIAGE = castConversation({
	id: "support-triage",
	copy: SCENE_COPY.conversations.triage,
	look: { icon: "Bug", color: BLOT_HUES.red },
	participants: [JUNO, IVY],
})

const FLAT_TOOLS = ["Paper"]

const EMPTY_STATES_TOOLS = ["Paper", "GitHub"]

const HOME: AppSidebarSection = {
	id: "section-home",
	name: SCENE_COPY.sections.home,
	position: 2,
}

const SUPPORT: AppSidebarSection = {
	id: "section-support",
	name: SCENE_COPY.sections.support,
	position: 2,
}

const PERSONAL: SceneSpace = withRowMissions({
	id: "personal",
	name: SCENE_COPY.spaces.personal,
	avatarSeed: "personal",
	colour: BLOT_HUES.blue,
	bots: [MOCHI, OLIVE, PIP, TOMO, ASH],
	rows: [
		placed(rosterRow(MOCHI, SCENE_COPY.bots.mochi), { pinPosition: 1 }),
		rosterRow(OLIVE, SCENE_COPY.bots.olive),
		placed(rosterRow(PIP, SCENE_COPY.bots.pip), {
			pinPosition: 3,
			sectionId: HOME.id,
		}),
		rosterRow(TOMO, SCENE_COPY.bots.tomo),
		rosterRow(ASH, SCENE_COPY.bots.ash),
	],
	conversations: [
		placed(LISBON, { pinPosition: 0 }),
		placed(MOVE, { pinPosition: 2, sectionId: HOME.id }),
	],
	sections: [HOME],
	defaultConversation: LISBON,
	openTabIds: [LISBON.id, MOCHI.id, MOVE.id],
	missions: [
		missionRow({
			bot: ASH,
			state: "working",
			tools: FLAT_TOOLS,
			...SCENE_COPY.missions.personal.flat,
		}),
		missionRow({
			bot: TOMO,
			state: "waiting_human",
			tools: ["Superset"],
			...SCENE_COPY.missions.personal.flights,
		}),
	],
	routines: [
		routineRow("routine-fare", SCENE_COPY.routines.fare),
		routineRow("routine-booking", SCENE_COPY.routines.booking),
	],
	loop: {
		request: SCENE_COPY.loops.personal.request,
		speakers: [TOMO, ASH],
		answers: [
			SCENE_COPY.loops.personal.firstAnswer,
			SCENE_COPY.loops.personal.secondAnswer,
		],
		mission: sceneMission({
			bot: ASH,
			objective: SCENE_COPY.loops.personal.missionObjective,
			externalId: SCENE_COPY.missions.personal.flat.externalId,
			ticketTitle: SCENE_COPY.missions.personal.flat.ticketTitle,
			tools: FLAT_TOOLS,
			timestamp: SCENE_COPY.loops.personal.missionTimestamp,
		}),
	},
})

const WORK: SceneSpace = withRowMissions({
	id: "work",
	name: SCENE_COPY.spaces.work,
	avatarSeed: "work",
	colour: BLOT_HUES.green,
	bots: [WREN, IVY, SABLE, JUNO],
	rows: [
		rosterRow(WREN, SCENE_COPY.bots.wren),
		placed(rosterRow(IVY, SCENE_COPY.bots.ivy), { pinPosition: 1 }),
		rosterRow(SABLE, SCENE_COPY.bots.sable),
		placed(rosterRow(JUNO, SCENE_COPY.bots.juno), {
			pinPosition: 3,
			sectionId: SUPPORT.id,
		}),
	],
	conversations: [
		placed(RELEASE, { pinPosition: 0 }),
		placed(TRIAGE, { pinPosition: 2, sectionId: SUPPORT.id }),
	],
	sections: [SUPPORT],
	defaultConversation: RELEASE,
	openTabIds: [RELEASE.id, IVY.id, TRIAGE.id],
	missions: [
		missionRow({
			bot: SABLE,
			state: "working",
			tools: EMPTY_STATES_TOOLS,
			...SCENE_COPY.missions.work.emptyStates,
		}),
		missionRow({
			bot: IVY,
			state: "waiting_human",
			tools: ["GitHub"],
			...SCENE_COPY.missions.work.settings,
		}),
		missionRow({
			bot: WREN,
			state: "ready_to_merge",
			tools: ["Superset", "GitHub"],
			...SCENE_COPY.missions.work.exportQueue,
		}),
	],
	routines: [
		routineRow("routine-merged", SCENE_COPY.routines.merged),
		routineRow("routine-build", SCENE_COPY.routines.build),
	],
	loop: {
		request: SCENE_COPY.loops.work.request,
		speakers: [IVY, SABLE],
		answers: [
			SCENE_COPY.loops.work.firstAnswer,
			SCENE_COPY.loops.work.secondAnswer,
		],
		mission: sceneMission({
			bot: SABLE,
			objective: SCENE_COPY.loops.work.missionObjective,
			externalId: SCENE_COPY.missions.work.emptyStates.externalId,
			ticketTitle: SCENE_COPY.missions.work.emptyStates.ticketTitle,
			tools: EMPTY_STATES_TOOLS,
			timestamp: SCENE_COPY.loops.work.missionTimestamp,
		}),
	},
})

const SCENE_SPACES: SceneSpace[] = [WORK, PERSONAL]

const SPACES: Space[] = SCENE_SPACES.map(
	({ id, name, colour, avatarSeed }) => ({
		id,
		name,
		colour,
		avatarSeed,
	}),
)

const spaceOf = (id: string): SceneSpace =>
	SCENE_SPACES.find((space) => space.id === id) ?? WORK

const ROSTER_BY_SPACE: Record<string, AppSidebarBot[]> = Object.fromEntries(
	SCENE_SPACES.map((space) => [space.id, space.rows]),
)

const CONVERSATIONS_BY_SPACE: Record<string, AppSidebarConversation[]> =
	Object.fromEntries(
		SCENE_SPACES.map((space) => [space.id, space.conversations]),
	)

const SECTIONS_BY_SPACE: Record<string, AppSidebarSection[]> =
	Object.fromEntries(SCENE_SPACES.map((space) => [space.id, space.sections]))

const missionsPanelOf = (space: SceneSpace): MissionsPanelProps => ({
	open: space.missions.map((mission) => ({
		...mission,
		conversationId: mission.id,
	})),
	earlierToday: [],
	onOpen: () => {},
})

const MISSIONS_BY_SPACE: Record<string, MissionsPanelProps> =
	Object.fromEntries(
		SCENE_SPACES.map((space) => [space.id, missionsPanelOf(space)]),
	)

const READER: UserChipIdentity = { name: SCENE_COPY.reader }

export {
	ASH,
	CONVERSATIONS_BY_SPACE,
	IVY,
	JUNO,
	MISSIONS_BY_SPACE,
	MOCHI,
	MOVE,
	OLIVE,
	PIP,
	READER,
	ROSTER_BY_SPACE,
	SABLE,
	SCENE_SPACES,
	type SceneLoop,
	type SceneSpace,
	SECTIONS_BY_SPACE,
	SPACES,
	sceneMission,
	spaceOf,
	TOMO,
	TRIAGE,
	WORK,
	WREN,
}
