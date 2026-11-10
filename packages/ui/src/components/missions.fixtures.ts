import { listExhaustively } from "@workspace/storybook/story-utils"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type {
	MissionActivity,
	MissionBot,
	MissionCardModel,
	MissionEventModel,
	MissionPullRequest,
	MissionState,
	MissionStatus,
	MissionTicketLink,
} from "@workspace/ui/components/mission"
import type {
	MissionsPageAgent,
	MissionsPageMission,
} from "@workspace/ui/components/missions-page"
import type { MissionsPanelMission } from "@workspace/ui/components/missions-panel"
import type { ReportedRunRowModel } from "@workspace/ui/components/reported-run-row"
import type { RosterBot } from "@workspace/ui/components/roster"
import type { EarlierTodayRow } from "@workspace/ui/components/routines-panel"

export const MISSION_STATES = listExhaustively<MissionState>({
	working: true,
	waiting_bot: true,
	waiting_human: true,
	ready_to_merge: true,
	failed: true,
	done: true,
	closed: true,
})

export const MISSION_STATES_WITHOUT_A_PILL: MissionState[] = [
	"working",
	"waiting_bot",
]

export const MISSION_NOW = new Date("2026-03-04T09:30:00Z").getTime()

const minutesBefore = (minutes: number) => MISSION_NOW - minutes * 60_000

export const MISSION_BOT: MissionBot = {
	name: "Ada Martin",
	seed: "bot-ada-martin",
}

const STORAGE_BOT: MissionBot = {
	name: "Noor Beltran",
	seed: "bot-noor-beltran",
}

const SHELL_BOT: MissionBot = {
	name: "Iris Nakamura",
	seed: "bot-iris-nakamura",
}

const identityOf = ({ seed = "", name }: MissionBot): RosterBot => ({
	id: seed,
	name,
})

export const MISSION_LAST_ACTIVITY: MissionActivity = {
	tool: "Edit",
	target: "packages/changelog/src/parse-release-notes.ts",
}

export const WAITING_HUMAN_MISSION: MissionCardModel = {
	id: "mission-migration",
	objective: "Migrate the run history table",
	ticket: {
		platform: "linear",
		externalId: "OPE-51",
		title: "Move the run history off the shared database",
		url: "",
	},
	identity: identityOf(MISSION_BOT),
	tools: ["GitHub"],
	state: "waiting_human",
	isClosed: false,
	isWorking: false,
	timestamp: "2d",
	now: MISSION_NOW,
}

export const READY_MISSION: MissionCardModel = {
	id: "mission-badges",
	objective: "Draw the badge dots of the roster",
	ticket: {
		platform: "github",
		externalId: "OPE-29",
		title: "Badge dots on the roster rows",
		url: "",
	},
	identity: identityOf(STORAGE_BOT),
	tools: ["GitHub"],
	state: "ready_to_merge",
	isClosed: false,
	isWorking: false,
	timestamp: "5h",
	now: MISSION_NOW,
}

export const WORKING_MISSION: MissionCardModel = {
	id: "mission-parser",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		title: "Changelog parser",
		url: "",
	},
	identity: identityOf(MISSION_BOT),
	tools: ["Superset", "GitHub"],
	state: "working",
	isClosed: false,
	isWorking: true,
	timestamp: "1h",
	now: MISSION_NOW,
	lastActivity: MISSION_LAST_ACTIVITY,
}

export const WAITING_BOT_MISSION: MissionCardModel = {
	id: "mission-transcript",
	objective: "Store the transcript of a mission thread",
	ticket: {
		platform: "jira",
		externalId: "",
		title: "Mission transcripts kept next to the conversation",
		url: "",
	},
	identity: identityOf(SHELL_BOT),
	tools: [],
	state: "waiting_bot",
	isClosed: false,
	isWorking: false,
	timestamp: "12m",
	now: MISSION_NOW,
}

export const FAILED_MISSION: MissionCardModel = {
	id: "mission-upgrade",
	objective: "Upgrade the desktop shell",
	ticket: {
		platform: "github",
		externalId: "OPE-17",
		title: "Desktop shell upgrade",
		url: "",
	},
	identity: identityOf(SHELL_BOT),
	tools: ["Terminal"],
	state: "failed",
	isClosed: false,
	isWorking: false,
	timestamp: "3d",
	now: MISSION_NOW,
}

export const CLOSED_MISSION: MissionCardModel = {
	id: "mission-tools",
	objective: "Let a bot manage its routines through MCP",
	ticket: {
		platform: "linear",
		externalId: "OPE-22",
		title: "Routines over MCP",
		url: "",
	},
	identity: identityOf(STORAGE_BOT),
	tools: ["Superset"],
	state: "done",
	isClosed: true,
	isWorking: false,
	timestamp: "09:12",
	now: MISSION_NOW,
}

export const UNTICKETED_MISSION: MissionCardModel = {
	id: "mission-unticketed",
	objective: "Read the shift log of the night",
	ticket: {
		platform: "",
		externalId: "",
		title: "",
		url: "",
	},
	identity: identityOf(MISSION_BOT),
	tools: [],
	state: "working",
	isClosed: false,
	isWorking: true,
	timestamp: "22m",
	now: MISSION_NOW,
}

export const MISSION_PULL_REQUEST: MissionPullRequest = {
	url: "https://github.example/kiroshi/kiroshi/pull/482",
	number: 482,
}

export const MISSION_TOOL_CALL_SLOTS = [
	"mission-activity-tool",
	"mission-activity-target",
	"mission-activity-age",
	"mission-silence",
]

export const COMMITS_AHEAD_MISSION: MissionCardModel = {
	...WORKING_MISSION,
	id: "mission-commits-ahead",
	commitsAhead: 3,
}

export const OPEN_MISSIONS: MissionCardModel[] = [
	WAITING_HUMAN_MISSION,
	READY_MISSION,
	WORKING_MISSION,
	WAITING_BOT_MISSION,
	FAILED_MISSION,
]

export const REPORTED_RUN: ReportedRunRowModel = {
	id: "run-morning-digest",
	routineTitle: "Morning digest",
	triggerSourceTitle: "On a schedule",
	bot: MISSION_BOT,
	timestamp: "08:04",
}

export const LATE_REPORTED_RUN: ReportedRunRowModel = {
	id: "run-release-watch",
	routineTitle: "Release watch",
	triggerSourceTitle: "Watching a file",
	bot: SHELL_BOT,
	timestamp: "10:04",
}

export const EARLIER_TODAY_ROWS: EarlierTodayRow[] = [
	{ kind: "run", ...LATE_REPORTED_RUN },
	{ kind: "mission", ...CLOSED_MISSION },
	{ kind: "run", ...REPORTED_RUN },
]

export const NO_EARLIER_TODAY: EarlierTodayRow[] = []

export const NO_MISSIONS: MissionCardModel[] = []

export const MISSION_STATUS: MissionStatus = {
	text: "Running the storybook suite before opening the pull request",
	writtenAt: minutesBefore(4),
}

export const LONG_MISSION_STATUS: MissionStatus = {
	...MISSION_STATUS,
	text: "Rebased the branch on main and resolved the conflict in the mission header. The storybook suite now passes on every story of the three mission surfaces, the type check is green and lint reports nothing. Waiting on the design review before opening the pull request against supercalifragilisticexpialidociousdesigntokensurface.",
}

export const MISSION_TICKET: MissionTicketLink = {
	externalId: "OPE-30",
	title: "Mission thread screen and mission card in the origin",
	platform: "linear",
	url: "https://linear.example/kiroshi/issue/OPE-30",
}

export const MISSION_OBJECTIVE =
	"Render the mission thread header and its event rows"

export const MISSION_OPENED_AT = MISSION_NOW - 5_400_000

export const MISSION_TOOLS = ["Superset", "GitHub", "Terminal"]

export const MISSION_TOOLS_WITHOUT_A_MARK = ["Terminal", "Web search"]

export const MISSION_EVENTS: MissionEventModel[] = [
	{
		id: "event-opened",
		kind: "opened",
		source: "bot",
		createdAt: minutesBefore(48),
	},
	{
		id: "event-note",
		kind: "note",
		source: "bot",
		createdAt: minutesBefore(41),
		text: "Read the Rust contract and mirrored every kind and every state before touching a pixel.",
	},
	{
		id: "event-agent-asked",
		kind: "agent_asked",
		source: "agent-hook",
		createdAt: minutesBefore(33),
		text: "Which field of the payload names the ticket this mission answers?",
	},
	{
		id: "event-answered",
		kind: "answered",
		source: "human",
		createdAt: minutesBefore(30),
	},
	{
		id: "event-escalated",
		kind: "escalated",
		source: "bot",
		createdAt: minutesBefore(12),
		text: "The payload carries no field this design can trust yet. Which one names the ticket?",
	},
	{
		id: "event-ready",
		kind: "ready",
		source: "github",
		createdAt: minutesBefore(6),
	},
	{
		id: "event-failed",
		kind: "failed",
		source: "github",
		createdAt: minutesBefore(4),
	},
	{
		id: "event-closed",
		kind: "closed",
		source: "bot",
		createdAt: minutesBefore(1),
	},
]

export const AUTHORED_MISSION_EVENTS: MissionEventModel[] = [
	{
		id: "event-authored-note",
		kind: "note",
		source: "bot",
		createdAt: minutesBefore(24),
		text: "Read the Rust contract and mirrored every kind and every state before touching a pixel.",
	},
	{
		id: "event-authored-agent-asked",
		kind: "agent_asked",
		source: "agent-hook",
		createdAt: minutesBefore(18),
		text: "Which field of the payload names the ticket this mission answers?",
	},
	{
		id: "event-authored-answered",
		kind: "answered",
		source: "human",
		createdAt: minutesBefore(11),
		text: "None of them yet. Read the ticket off the mission, not off the payload.",
	},
	{
		id: "event-authored-escalated",
		kind: "escalated",
		source: "bot",
		createdAt: minutesBefore(3),
		text: "The run needs a human to say whether the mirror file should be resolved here or on the other branch.",
	},
]

export const MISSION_CARD_TOOLS = ["Superset", "paper", "GitHub"]

export const MISSION_AUTHOR: MessageAuthor = {
	id: "bot-ada-martin",
	name: MISSION_BOT.name,
	title: "Design",
}

export const WORKING_MISSION_CARD: MissionCardModel = {
	id: "mission-ope-31",
	author: MISSION_AUTHOR,
	identity: MISSION_AUTHOR,
	objective:
		"Read every release of the packages this workspace depends on and report what changed.",
	ticket: {
		externalId: "PLAT-118",
		title: "Move the run history off the shared database",
		platform: "jira",
		url: "https://jira.example/browse/PLAT-118",
	},
	tools: MISSION_CARD_TOOLS,
	state: "working",
	isWorking: true,
	isClosed: false,
	timestamp: "4m",
	lastActivity: MISSION_LAST_ACTIVITY,
}

export const WAITING_MISSION_CARD: MissionCardModel = {
	id: "mission-ope-30",
	author: MISSION_AUTHOR,
	identity: MISSION_AUTHOR,
	objective:
		"Ship the mission thread and the card that summarises it in the conversation it came from.",
	ticket: {
		...MISSION_TICKET,
		platform: "linear",
		url: "https://linear.example/kiroshi/issue/OPE-30",
	},
	tools: MISSION_CARD_TOOLS,
	state: "waiting_human",
	isWorking: false,
	isClosed: false,
	timestamp: "2d",
}

const CLOSED_MISSION_BOT: MessageAuthor = {
	id: "bot-noor-beltran",
	name: "Noor Beltran",
	title: "Storage",
}

export const CLOSED_MISSION_CARD: MissionCardModel = {
	id: "mission-ope-25",
	author: CLOSED_MISSION_BOT,
	identity: CLOSED_MISSION_BOT,
	objective:
		"Store a mission, its thread, its events and the commands over them.",
	ticket: {
		externalId: "OPE-25",
		title: "Mission storage and its command surface",
		platform: "linear",
		url: "https://linear.example/kiroshi/issue/OPE-25",
	},
	tools: ["Superset"],
	state: "done",
	isWorking: false,
	isClosed: true,
	timestamp: "09:12",
}

export const LONG_TITLE_MISSION: MissionCardModel = {
	...WAITING_HUMAN_MISSION,
	id: "mission-long-title",
	objective:
		"Move every run history table off the shared database and into the per space store without losing a single reported run",
}

const inConversation =
	(conversationId: string) =>
	(mission: MissionCardModel): MissionsPanelMission => ({
		...mission,
		conversationId,
	})

export const SPACE_OPEN_MISSIONS: MissionsPanelMission[] = [
	inConversation("conversation-storage")(WAITING_HUMAN_MISSION),
	inConversation("conversation-roster")(READY_MISSION),
	inConversation("conversation-changelog")(WORKING_MISSION),
	inConversation("conversation-storage")(WAITING_BOT_MISSION),
	inConversation("conversation-shell")(FAILED_MISSION),
]

export const SPACE_WAITING_MISSIONS: MissionsPanelMission[] =
	SPACE_OPEN_MISSIONS.slice(0, 2)

export const SPACE_LONG_TITLE_MISSIONS: MissionsPanelMission[] = [
	inConversation("conversation-storage")(LONG_TITLE_MISSION),
]

export const SPACE_EARLIER_TODAY_MISSIONS: MissionsPanelMission[] = [
	CLOSED_MISSION,
	{
		...CLOSED_MISSION,
		id: "mission-digest",
		objective: "Send the morning digest",
		timestamp: "08:40",
	},
	{
		...CLOSED_MISSION,
		id: "mission-rail",
		objective: "Draw the icon rail of the shell",
		timestamp: "08:05",
		identity: identityOf(MISSION_BOT),
	},
	{
		...CLOSED_MISSION,
		id: "mission-release",
		objective: "Watch the release notes file",
		timestamp: "07:32",
		identity: identityOf(SHELL_BOT),
	},
].map(inConversation("conversation-roster"))

export const NO_SPACE_MISSIONS: MissionsPanelMission[] = []

const ATLAS: MissionsPageAgent = { id: "bot-atlas", name: "Atlas", hue: 257 }
const JUNO: MissionsPageAgent = { id: "bot-juno", name: "Juno", hue: 296 }
const PIKE: MissionsPageAgent = { id: "bot-pike", name: "Pike", hue: 132 }

const pullRequestNumbered = (number: number): MissionPullRequest => ({
	url: `https://github.com/kiroshi/kiroshi-monorepo/pull/${number}`,
	number,
})

const PAGE_BLOCKED_ON_YOU_MISSION: MissionsPageMission = {
	id: "mission-ope-2124",
	identifier: "OPE-2124",
	title: "Pick the model of a new agent from the offered catalogue",
	state: "waiting_human",
	conversation: { title: "Agent setup", icon: "Sparkles" },
	agent: ATLAS,
	updatedAt: minutesBefore(4),
	pullRequest: pullRequestNumbered(2296),
}

const PAGE_READY_TO_MERGE_MISSION: MissionsPageMission = {
	id: "mission-ope-2121",
	identifier: "OPE-2121",
	title: "Latch one outcome per connect flow",
	state: "ready_to_merge",
	conversation: { title: "Plugins", icon: "ShieldKey" },
	agent: JUNO,
	updatedAt: minutesBefore(18),
	pullRequest: pullRequestNumbered(2304),
}

const PAGE_WORKING_ATLAS_MISSION: MissionsPageMission = {
	id: "mission-ope-2118",
	identifier: "OPE-2118",
	title: "Carry the resolved model through the offered catalogue",
	state: "working",
	conversation: { title: "Sidecar", icon: "Server" },
	agent: ATLAS,
	updatedAt: minutesBefore(2),
	pullRequest: pullRequestNumbered(2298),
}

const PAGE_WORKING_JUNO_MISSION: MissionsPageMission = {
	id: "mission-ope-2130",
	identifier: "OPE-2130",
	title: "Give each person a main conversation with an agent",
	state: "working",
	conversation: { title: "Home", icon: "MessageSquare" },
	agent: JUNO,
	updatedAt: minutesBefore(35),
}

const PAGE_WORKING_PIKE_MISSION: MissionsPageMission = {
	id: "mission-ope-2127",
	identifier: "OPE-2127",
	title: "Serve the grant of the latest Connect to the agent",
	state: "working",
	conversation: { title: "Plugins", icon: "ShieldKey" },
	agent: PIKE,
	updatedAt: minutesBefore(150),
}

export const PAGE_MISSIONS_SHOWN: MissionsPageMission[] = [
	PAGE_BLOCKED_ON_YOU_MISSION,
	PAGE_READY_TO_MERGE_MISSION,
	PAGE_WORKING_ATLAS_MISSION,
	PAGE_WORKING_JUNO_MISSION,
	PAGE_WORKING_PIKE_MISSION,
]

const completedMission = (index: number): MissionsPageMission => ({
	id: `mission-completed-${index}`,
	identifier: `OPE-${2100 + index}`,
	title: `Completed mission ${index}`,
	state: index % 2 === 0 ? "done" : "closed",
	conversation: { title: "Release", icon: "Rocket" },
	agent: [ATLAS, JUNO, PIKE][index % 3] ?? ATLAS,
	updatedAt: minutesBefore(60 * (index + 3)),
})

export const PAGE_MISSIONS: MissionsPageMission[] = [
	...PAGE_MISSIONS_SHOWN,
	...Array.from({ length: 6 }, (_, index) => completedMission(index + 1)),
	{
		id: "mission-ope-2109",
		identifier: "OPE-2109",
		title: "Retry the relay handshake after a refused token",
		state: "failed",
		conversation: { title: "Relay", icon: "Globe" },
		agent: PIKE,
		updatedAt: minutesBefore(600),
	},
]

export const PAGE_MISSIONS_WAITING_ON_AN_AGENT: MissionsPageMission[] = [
	...PAGE_MISSIONS,
	{
		id: "mission-ope-2133",
		identifier: "OPE-2133",
		title: "Wait for the review agent to answer",
		state: "waiting_bot",
		conversation: { title: "Review", icon: "Code" },
		agent: JUNO,
		updatedAt: minutesBefore(9),
	},
]

export const PAGE_LONG_TEXT_MISSIONS: MissionsPageMission[] = [
	{
		...PAGE_BLOCKED_ON_YOU_MISSION,
		id: "mission-long-title",
		identifier: "OPE-12345",
		title:
			"Move every run history table off the shared database and into the per space store without losing a single reported run, then prove it on a space holding ten thousand runs",
		conversation: {
			title:
				"A conversation whose title runs far past the room its chip is given",
			icon: "BookOpen",
		},
		pullRequest: pullRequestNumbered(123456),
	},
	{
		...PAGE_READY_TO_MERGE_MISSION,
		title: "Supercalifragilisticexpialidocious".repeat(6),
	},
	PAGE_WORKING_ATLAS_MISSION,
]

export const NO_PAGE_MISSIONS: MissionsPageMission[] = []
