import type {
	AppSidebarBot,
	AppSidebarConversation,
	Space,
	UserChipIdentity,
} from "@workspace/ui/components/app-sidebar"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import type {
	MissionCardModel,
	MissionState,
} from "@workspace/ui/components/mission"
import type { RosterBot } from "@workspace/ui/components/roster"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import { SCENE_COPY, TICKET_PLATFORM } from "./copy"

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

type ConversationInput = {
	id: string
	copy: ConversationCopy
	participants: RosterBot[]
}

const castConversation = ({
	id,
	copy,
	participants,
}: ConversationInput): AppSidebarConversation => ({
	id,
	name: copy.name,
	participants,
	lastSpeaker: copy.speaker,
	lastMessage: copy.preview,
	timestamp: copy.timestamp,
})

type SceneMissionInput = {
	bot: RosterBot
	objective: string
	timestamp: string
	externalId?: string
}

const sceneMission = ({
	bot,
	objective,
	timestamp,
	externalId = "",
}: SceneMissionInput): MissionCardModel => ({
	id: `mission-${bot.id}`,
	identity: bot,
	objective,
	ticket: {
		platform: externalId ? TICKET_PLATFORM : "",
		externalId,
		title: "",
		url: "",
	},
	tools: [],
	state: "working",
	isWorking: true,
	isClosed: false,
	timestamp,
})

type ActivityMissionInput = SceneMissionInput & {
	state: MissionState
}

const missionRow = ({
	state,
	...mission
}: ActivityMissionInput): MissionCardModel => ({
	...sceneMission(mission),
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
	bots: RosterBot[]
	rows: AppSidebarBot[]
	conversations: AppSidebarConversation[]
	defaultConversation: AppSidebarConversation
	missions: MissionCardModel[]
	routines: RoutineRowModel[]
	loop: SceneLoop
}

const LISBON = castConversation({
	id: "lisbon-in-may",
	copy: SCENE_COPY.conversations.lisbon,
	participants: [TOMO, ASH, OLIVE],
})

const MOVE = castConversation({
	id: "the-move",
	copy: SCENE_COPY.conversations.move,
	participants: [MOCHI, TOMO],
})

const RELEASE = castConversation({
	id: "release-4-2",
	copy: SCENE_COPY.conversations.release,
	participants: [IVY, SABLE, WREN],
})

const TRIAGE = castConversation({
	id: "support-triage",
	copy: SCENE_COPY.conversations.triage,
	participants: [JUNO, IVY],
})

const PERSONAL: SceneSpace = {
	id: "personal",
	name: SCENE_COPY.spaces.personal,
	avatarSeed: "personal",
	colour: "blue",
	bots: [MOCHI, OLIVE, PIP, TOMO, ASH],
	rows: [
		rosterRow(MOCHI, SCENE_COPY.bots.mochi),
		rosterRow(OLIVE, SCENE_COPY.bots.olive),
		rosterRow(PIP, SCENE_COPY.bots.pip),
		rosterRow(TOMO, SCENE_COPY.bots.tomo),
		rosterRow(ASH, SCENE_COPY.bots.ash),
	],
	conversations: [LISBON, MOVE],
	defaultConversation: LISBON,
	missions: [
		missionRow({
			bot: ASH,
			state: "working",
			...SCENE_COPY.missions.personal.flat,
		}),
		missionRow({
			bot: TOMO,
			state: "waiting_human",
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
			timestamp: SCENE_COPY.loops.personal.missionTimestamp,
		}),
	},
}

const WORK: SceneSpace = {
	id: "work",
	name: SCENE_COPY.spaces.work,
	avatarSeed: "work",
	bots: [WREN, IVY, SABLE, JUNO],
	rows: [
		rosterRow(WREN, SCENE_COPY.bots.wren),
		rosterRow(IVY, SCENE_COPY.bots.ivy),
		rosterRow(SABLE, SCENE_COPY.bots.sable),
		rosterRow(JUNO, SCENE_COPY.bots.juno),
	],
	conversations: [RELEASE, TRIAGE],
	defaultConversation: RELEASE,
	missions: [
		missionRow({
			bot: SABLE,
			state: "working",
			...SCENE_COPY.missions.work.emptyStates,
		}),
		missionRow({
			bot: IVY,
			state: "waiting_human",
			...SCENE_COPY.missions.work.settings,
		}),
		missionRow({
			bot: WREN,
			state: "ready_to_merge",
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
			timestamp: SCENE_COPY.loops.work.missionTimestamp,
		}),
	},
}

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

const READER: UserChipIdentity = { name: SCENE_COPY.reader }

export {
	ASH,
	CONVERSATIONS_BY_SPACE,
	IVY,
	JUNO,
	MOCHI,
	MOVE,
	OLIVE,
	PIP,
	READER,
	ROSTER_BY_SPACE,
	SABLE,
	type SceneLoop,
	type SceneSpace,
	SPACES,
	sceneMission,
	spaceOf,
	TOMO,
	TRIAGE,
	WORK,
	WREN,
}
