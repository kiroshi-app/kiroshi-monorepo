import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import { activateLanguage } from "@workspace/ui/lib/i18n"

import type {
	Mission,
	MissionEvent,
	MissionInSpace,
	MissionLiveness,
	MissionOnBoard,
	MissionState,
} from "./mission-contract"
import { aMission } from "./mission-fixtures"
import {
	type ActivityMissionsRead,
	AGENT_SILENCE_MS,
	badgeOfMissionState,
	liveMissionsIn,
	type MissionLivenessRead,
	missionRingBadges,
	missionsByRow,
	missionsBySpaceId,
	missionsIn,
	toActivityMissions,
	toMissionCard,
	toMissionEventModels,
	toMissionHeaderActivity,
	toSpaceMissionGroups,
	withMissions,
} from "./missions-model"

import type { ThreadFace } from "@/lib/chat/thread-contract"
import type { Bot } from "@/lib/conversations/store-contract"
import type { ReportedRunRead } from "@/lib/routines/routines-model"

const missionIn = (state: MissionState): Mission => ({
	id: `m-${state}`,
	stateSeq: 1,
	isAgentRunning: false,
	originConversationId: "c-1",
	spaceId: null,
	botId: "b-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read", "Write"],
	state,
	openedAt: 1_700_000_000_000,
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
})

const READ_AT = Date.parse("2026-03-04T14:20:00")

const FACE: ThreadFace = {
	id: "b-1",
	name: "Ada Martin",
}

const faceOf = (botId: string): ThreadFace | undefined =>
	botId === FACE.id ? FACE : undefined

const closedAt = (at: number): Mission => ({
	...missionIn("done"),
	closedAt: at,
})

const reportedRun = (over: Partial<ReportedRunRead>): ReportedRunRead => ({
	id: "run-1",
	routineTitle: "Nightly report",
	triggerSourceTitle: "Every day at 08:00",
	botId: "b-1",
	at: READ_AT - 7_200_000,
	...over,
})

const rowsOf = (read: Partial<ActivityMissionsRead>) =>
	toActivityMissions({
		open: [],
		closed: [],
		reportedRuns: [],
		faceOf,
		liveMissionIds: new Set<string>(),
		now: READ_AT,
		...read,
	})

type FormatterGetters = Omit<Intl.DateTimeFormat, "format"> & {
	format: unknown
}

afterEach(() => {
	activateLanguage("en")
	vi.restoreAllMocks()
})

const RUNNING_MISSION: Mission = {
	...missionIn("working"),
	isAgentRunning: true,
}

const CLOSED_RUNNING_MISSION: Mission = {
	...RUNNING_MISSION,
	closedAt: READ_AT - 86_400_000,
}

const liveIn = (read: Partial<MissionLivenessRead>) => [
	...liveMissionsIn({
		missions: [RUNNING_MISSION],
		speakingBotIds: {},
		now: READ_AT,
		...read,
	}),
]

describe("liveMissionsIn", () => {
	it("reads a mission whose companion speaks on its thread as live", () => {
		expect(
			liveIn({
				missions: [missionIn("working")],
				speakingBotIds: { "c-mission-1": ["b-1"] },
			}),
		).toEqual(["m-working"])
	})

	it("reads a mission whose agent acted within the silence window as live", () => {
		expect(
			liveIn({
				missions: [
					{ ...missionIn("working"), lastActivityAt: READ_AT - 60_000 },
				],
			}),
		).toEqual(["m-working"])
	})

	it("names a mission once when its companion speaks and its agent acts", () => {
		expect(
			liveIn({
				missions: [{ ...RUNNING_MISSION, lastActivityAt: READ_AT }],
				speakingBotIds: { "c-mission-1": ["b-1"] },
			}),
		).toEqual(["m-working"])
	})

	it("reads a mission nobody speaks on and no agent runs as resting", () => {
		expect(liveIn({ missions: [missionIn("working")] })).toEqual([])
	})

	it("reads a running mission silent past the window as resting", () => {
		expect(
			liveIn({
				missions: [
					{ ...RUNNING_MISSION, lastActivityAt: READ_AT - AGENT_SILENCE_MS },
				],
			}),
		).toEqual([])
	})

	it("reads a silent mission its companion speaks on as live", () => {
		expect(
			liveIn({
				missions: [
					{ ...RUNNING_MISSION, lastActivityAt: READ_AT - AGENT_SILENCE_MS },
				],
				speakingBotIds: { "c-mission-1": ["b-1"] },
			}),
		).toEqual(["m-working"])
	})

	it("reads a mission with no activity from its running agent alone, whatever its age", () => {
		expect(liveIn({})).toEqual(["m-working"])
	})

	it("reads a closed mission whose agent still acts as resting", () => {
		expect(
			liveIn({
				missions: [{ ...CLOSED_RUNNING_MISSION, lastActivityAt: READ_AT }],
			}),
		).toEqual([])
	})

	it("reads a closed mission its companion speaks on as resting", () => {
		expect(
			liveIn({
				missions: [CLOSED_RUNNING_MISSION],
				speakingBotIds: { "c-mission-1": ["b-1"] },
			}),
		).toEqual([])
	})

	it("leaves out a thread another companion speaks on", () => {
		expect(
			liveIn({
				missions: [missionIn("working")],
				speakingBotIds: { "c-mission-1": ["b-2"] },
			}),
		).toEqual([])
	})

	it("leaves out a companion speaking on another conversation", () => {
		expect(
			liveIn({
				missions: [missionIn("working")],
				speakingBotIds: { "c-1": ["b-1"] },
			}),
		).toEqual([])
	})
})

describe("toActivityMissions", () => {
	it("reads an open mission as the row of the activity panel", () => {
		const { open } = rowsOf({
			open: [{ ...missionIn("working"), openedAt: READ_AT - 3_600_000 }],
			liveMissionIds: new Set(["m-working"]),
		})

		expect(open).toEqual([
			{
				id: "m-working",
				objective: "Rewrite the changelog parser",
				identity: FACE,
				ticket: {
					platform: "linear",
					externalId: "OPE-42",
					url: "https://linear.app/ope-42",
					title: "Changelog parser",
				},
				tools: ["Read", "Write"],
				state: "working",
				isWorking: true,
				isClosed: false,
				timestamp: "1h",
				now: READ_AT,
			},
		])
	})

	it("gives the row the time of the last activity, the commits ahead, the last tool call and the pull request", () => {
		const { open } = rowsOf({
			open: [
				{
					...missionIn("working"),
					lastActivityAt: READ_AT - 120_000,
					commitsAhead: 3,
					lastActivity: { tool: "Edit", target: "parser.ts" },
					pullRequestUrl: "https://github.com/acme/app/pull/12",
					status: { text: "Running the tests", writtenAt: READ_AT },
				},
			],
		})

		expect(open[0]).toMatchObject({
			commitsAhead: 3,
			now: READ_AT,
			lastActivity: { tool: "Edit", target: "parser.ts" },
			pullRequest: { url: "https://github.com/acme/app/pull/12", number: 12 },
			status: { text: "Running the tests", writtenAt: READ_AT },
		})
	})

	it("stamps the row with the age of the last activity of its mission", () => {
		const { open } = rowsOf({
			open: [
				{
					...missionIn("working"),
					openedAt: READ_AT - 3_600_000,
					lastActivityAt: READ_AT - 120_000,
				},
			],
		})

		expect(open[0]?.timestamp).toBe("2m")
	})

	it("gives a mission closed earlier today no agent activity", () => {
		const { earlierToday } = rowsOf({
			closed: [
				{
					...closedAt(READ_AT - 7_200_000),
					lastActivity: { tool: "Edit", target: "parser.ts" },
					lastActivityAt: READ_AT - 7_300_000,
					commitsAhead: 3,
				},
			],
		})

		expect(earlierToday[0]).not.toHaveProperty("lastActivity")
		expect(earlierToday[0]).not.toHaveProperty("lastActivityAt")
		expect(earlierToday[0]).not.toHaveProperty("commitsAhead")
	})

	it("reads the start of the local day once per read of the rows", () => {
		const startOfDay = vi.spyOn(Date.prototype, "setHours")

		rowsOf({
			closed: [
				closedAt(READ_AT - 7_200_000),
				closedAt(READ_AT - 3_600_000),
				closedAt(READ_AT - 600_000),
			],
		})

		expect(startOfDay).toHaveBeenCalledTimes(1)
	})

	it("gives a closed mission row the now of the read", () => {
		const { earlierToday } = rowsOf({ closed: [closedAt(READ_AT - 7_200_000)] })

		expect(earlierToday[0]).toMatchObject({ now: READ_AT })
	})

	it("shows a mission the person closed in the closed group with the closed pill", () => {
		const { open, earlierToday } = rowsOf({
			closed: [{ ...missionIn("closed"), closedAt: READ_AT - 7_200_000 }],
		})

		expect(open).toEqual([])
		expect(earlierToday).toHaveLength(1)
		expect(earlierToday[0]).toMatchObject({ state: "closed", isClosed: true })
	})

	it("reads a mission no companion is live on as resting whatever its state", () => {
		const { open } = rowsOf({ open: [missionIn("working")] })

		expect(open[0]?.isWorking).toBe(false)
	})

	it("reads a mission closed earlier today as resting", () => {
		const { earlierToday } = rowsOf({
			closed: [closedAt(READ_AT - 7_200_000)],
			liveMissionIds: new Set(["m-done"]),
		})

		expect(earlierToday[0]).toMatchObject({ isWorking: false })
	})

	it("keeps only the missions closed since local midnight, at the time they closed", () => {
		const { earlierToday } = rowsOf({
			closed: [
				closedAt(READ_AT - 7_200_000),
				closedAt(READ_AT - 3 * 86_400_000),
			],
		})

		expect(earlierToday).toHaveLength(1)
		expect(earlierToday[0]).toMatchObject({
			kind: "mission",
			timestamp: "12:20",
		})
	})

	it("stamps a closed mission with a time of day read in fr", () => {
		activateLanguage("fr")
		const stamp = vi.spyOn(
			Intl.DateTimeFormat.prototype as FormatterGetters,
			"format",
			"get",
		)

		const { earlierToday } = rowsOf({
			closed: [closedAt(READ_AT - 7_200_000)],
		})

		const [formatter] = stamp.mock.contexts as Intl.DateTimeFormat[]
		expect(earlierToday[0]).toMatchObject({ timestamp: "12:20" })
		expect(formatter?.resolvedOptions().locale).toBe("fr")
	})

	it("still lists a mission whose companion the conversation does not name", () => {
		const { open } = rowsOf({
			open: [{ ...missionIn("working"), botId: "b-unknown" }],
		})

		expect(open.map(({ identity }) => identity)).toEqual([
			{ id: "b-unknown", name: "Unknown companion" },
		])
	})

	it("reads a run that reported today as a row of the group", () => {
		const { earlierToday } = rowsOf({ reportedRuns: [reportedRun({})] })

		expect(earlierToday).toEqual([
			{
				kind: "run",
				id: "run-1",
				routineTitle: "Nightly report",
				triggerSourceTitle: "Every day at 08:00",
				bot: { name: "Ada Martin", seed: "b-1" },
				timestamp: "12:20",
			},
		])
	})

	it("leaves out a run that reported before the current local day", () => {
		const { earlierToday } = rowsOf({
			reportedRuns: [reportedRun({ at: READ_AT - 86_400_000 })],
		})

		expect(earlierToday).toEqual([])
	})

	it("leaves out a run whose companion the conversation does not name", () => {
		const { earlierToday } = rowsOf({
			reportedRuns: [reportedRun({ botId: "b-unknown" })],
		})

		expect(earlierToday).toEqual([])
	})

	it("orders the closed missions and the reported runs most recent first", () => {
		const { earlierToday } = rowsOf({
			closed: [closedAt(READ_AT - 3_600_000)],
			reportedRuns: [
				reportedRun({ id: "run-early", at: READ_AT - 7_200_000 }),
				reportedRun({ id: "run-late", at: READ_AT - 600_000 }),
			],
		})

		expect(earlierToday.map((row) => row.id)).toEqual([
			"run-late",
			"m-done",
			"run-early",
		])
	})

	it("reads a mission the host reads needs_you as waiting whatever its stored state", () => {
		const { open } = rowsOf({
			open: [{ ...missionIn("working"), liveness: "needs_you" }],
		})

		expect(open[0].state).toBe("waiting_human")
	})

	it("reads a stored escalation the host no longer reads needs_you as working", () => {
		const { open } = rowsOf({
			open: [{ ...missionIn("waiting_human"), liveness: "working" }],
		})

		expect(open[0].state).toBe("working")
	})

	it("reads a mission the host reads idle from its stored state", () => {
		const { open } = rowsOf({
			open: [{ ...missionIn("waiting_bot"), liveness: "idle" }],
		})

		expect(open[0].state).toBe("waiting_bot")
	})

	it("draws a mission working exactly when the host reads it working", () => {
		const { open } = rowsOf({
			open: [
				{ ...missionIn("working"), liveness: "working" },
				{ ...missionIn("waiting_bot"), liveness: "idle" },
			],
			liveMissionIds: new Set(["m-waiting_bot"]),
		})

		expect(open.map(({ isWorking }) => isWorking)).toEqual([true, false])
	})

	it("reads a mission with no liveness from its stored state and what the front heard", () => {
		const { open } = rowsOf({
			open: [missionIn("working")],
			liveMissionIds: new Set(["m-working"]),
		})

		expect(open[0]).toMatchObject({ state: "working", isWorking: true })
	})
})

const EVENT: MissionEvent = {
	id: "e-1",
	missionId: "m-1",
	kind: "note",
	source: "bot",
	payload: null,
	createdAt: 1_700_000_000_000,
}

it("lets an event speak through the payload key its writer emits", () => {
	const spoken = toMissionEventModels([
		{ ...EVENT, payload: { line: "The branch is pushed." } },
		{ ...EVENT, id: "e-2", payload: { message: "Which branch answers?" } },
		{ ...EVENT, id: "e-3", payload: { question: "Which branch answers?" } },
		{ ...EVENT, id: "e-4", payload: { summary: "The parser is rewritten." } },
	])

	expect(spoken.map(({ text }) => text)).toEqual([
		"The branch is pushed.",
		"Which branch answers?",
		"Which branch answers?",
		"The parser is rewritten.",
	])
})

it("drops the events whose kind no row of the catalogue names", () => {
	const shown = toMissionEventModels([
		{ ...EVENT, id: "e-1", kind: "agent_started" },
		{ ...EVENT, id: "e-2", kind: "note" },
		{ ...EVENT, id: "e-3", kind: "agent_stopped" },
		{ ...EVENT, id: "e-4", kind: "agent_asked" },
	])

	expect(shown.map(({ id }) => id)).toEqual(["e-2", "e-4"])
})

it("keeps an event silent when its payload holds no spoken key", () => {
	const models = toMissionEventModels([
		EVENT,
		{ ...EVENT, id: "e-2", payload: {} },
		{ ...EVENT, id: "e-3", payload: { line: 42 } },
		{ ...EVENT, id: "e-4", payload: "The branch is pushed." },
		{ ...EVENT, id: "e-5", payload: { outcome: "done" } },
	])

	expect(models.map(({ text }) => text)).toEqual([
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
	])
})

it("keeps the close of the person as dismissed beside the close of the companion", () => {
	const models = toMissionEventModels([
		{ ...EVENT, id: "e-1", kind: "dismissed", source: "person" },
		{ ...EVENT, id: "e-2", kind: "closed", source: "bot" },
	])

	expect(models.map(({ kind, source }) => ({ kind, source }))).toEqual([
		{ kind: "dismissed", source: "person" },
		{ kind: "closed", source: "bot" },
	])
})

it("links an event to the url of its payload with the pull request it names", () => {
	const models = toMissionEventModels([
		{
			...EVENT,
			payload: { pullRequest: 7, url: "https://github.test/pull/7" },
		},
		{ ...EVENT, id: "e-2", payload: { url: "https://github.test/pull/8" } },
		{ ...EVENT, id: "e-3", payload: { pullRequest: 7 } },
		{ ...EVENT, id: "e-4", payload: { url: 42 } },
	])

	expect(models.map(({ link }) => link)).toEqual([
		{ url: "https://github.test/pull/7", pullRequest: 7 },
		{ url: "https://github.test/pull/8" },
		undefined,
		undefined,
	])
})

describe("toMissionCard", () => {
	it("gives the card its time, its status, its commits ahead, its last tool call and its pull request", () => {
		const card = toMissionCard({
			mission: {
				...missionIn("working"),
				lastActivityAt: READ_AT - 120_000,
				commitsAhead: 2,
				lastActivity: { tool: "Bash", target: "bun test" },
				pullRequestUrl: "https://github.com/acme/app/pull/7",
				status: { text: "Running the tests", writtenAt: READ_AT },
			},
			identity: FACE,
			state: "working",
			isWorking: true,
			now: READ_AT,
		})

		expect(card).toMatchObject({
			timestamp: "2m",
			now: READ_AT,
			status: { text: "Running the tests", writtenAt: READ_AT },
			commitsAhead: 2,
			lastActivity: { tool: "Bash", target: "bun test" },
			pullRequest: { url: "https://github.com/acme/app/pull/7", number: 7 },
		})
	})
})

describe("toMissionCard shared by the Activity panel and the thread", () => {
	const cardOf = (mission: Mission, state: MissionState = mission.state) =>
		toMissionCard({
			mission,
			identity: FACE,
			author: { ...FACE, isLead: true },
			state,
			isWorking: false,
			now: READ_AT,
		})

	it("shows the state it is given rather than the stored one", () => {
		expect(cardOf(missionIn("working"), "waiting_human").state).toBe(
			"waiting_human",
		)
	})

	it("carries the author of the thread card", () => {
		expect(cardOf(missionIn("working")).author).toEqual({
			...FACE,
			isLead: true,
		})
	})

	it("stamps a closed mission with the age of its close", () => {
		const card = cardOf({
			...closedAt(READ_AT - 600_000),
			lastActivityAt: READ_AT - 7_200_000,
		})

		expect(card).toMatchObject({ isClosed: true, timestamp: "10m" })
	})

	it("builds the open row of the Activity panel", () => {
		const mission = { ...missionIn("working"), commitsAhead: 2 }
		const { open } = rowsOf({ open: [mission] })

		expect(open[0]).toEqual({ ...cardOf(mission), author: undefined })
	})
})

describe("toMissionHeaderActivity", () => {
	it("gives the header the time of the last activity and the commits ahead, never the last tool call", () => {
		const working = {
			...missionIn("working"),
			lastActivityAt: READ_AT,
			commitsAhead: 2,
		}
		const header = toMissionHeaderActivity({
			...working,
			lastActivity: { tool: "Bash", target: "bun test" },
		})

		expect(header).toStrictEqual({
			lastActivityAt: READ_AT,
			commitsAhead: 2,
			pullRequest: undefined,
		})
		expect(header).toStrictEqual(
			toMissionHeaderActivity({ ...working, lastActivity: null }),
		)
	})

	it("reads the pull request number from the last segment of its url", () => {
		const url = "https://github.com/vocca/kiroshi/pull/4172"

		expect(
			toMissionHeaderActivity({ ...missionIn("working"), pullRequestUrl: url })
				.pullRequest,
		).toEqual({ url, number: 4172 })
	})

	it.each([
		null,
		"https://github.com/vocca/kiroshi/pull/new",
		"https://github.com/vocca/kiroshi/pull/",
	])("gives the header no pull request for %s", (pullRequestUrl) => {
		expect(
			toMissionHeaderActivity({ ...missionIn("working"), pullRequestUrl })
				.pullRequest,
		).toBeUndefined()
	})
})

it("carries the kind, the source and the time of every event", () => {
	expect(toMissionEventModels([EVENT])).toEqual([
		{
			id: "e-1",
			kind: "note",
			source: "bot",
			createdAt: 1_700_000_000_000,
			text: undefined,
		},
	])
})

const mission = (over: Partial<Mission>): Mission => ({
	id: "m-1",
	originConversationId: "c-1",
	spaceId: null,
	botId: "b-1",
	threadConversationId: "t-1",
	objective: "Drive every roster line from its mission.",
	ticket: {
		platform: "linear",
		externalId: "OPE-29",
		url: "https://linear.app/ope-29",
		title: "Roster line driven by mission state",
	},
	tools: [],
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
	...over,
})

const bot = (id: string): Bot => ({
	id,
	name: "Atlas",
	title: "",
	model: "sonnet",
	avatarBlot: "blue",
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	effort: null,
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
})

const onBoard = (over: Partial<Mission>): MissionOnBoard => {
	const held = mission(over)
	return { mission: held, bot: bot(held.botId) }
}

const row = (over: Partial<AppSidebarBot>): AppSidebarBot => ({
	id: "b-1",
	name: "Atlas",
	title: "Research",
	lastMessage: "Pulled the three papers.",
	timestamp: "3m",
	...over,
})

const NO_LISTED_CONVERSATIONS: { id: string }[] = []

const OTHER_TICKET = { ...mission({}).ticket, externalId: "OPE-99" }

const TICKET = {
	platform: "linear",
	externalId: "OPE-29",
	title: "Roster line driven by mission state",
}

const shownMission = (id: string, state: BotMissionState, ticket = TICKET) => ({
	id,
	state,
	ticket,
})

const stripsFor = (...states: MissionState[]) =>
	missionsByRow(
		states.map((state, index) =>
			onBoard({ id: `m-${index + 1}`, openedAt: index + 1, state }),
		),
		NO_LISTED_CONVERSATIONS,
	)["b-1"]

const livenessStripsFor = (...livenesses: MissionLiveness[]) =>
	missionsByRow(
		livenesses.map((liveness, index) =>
			onBoard({
				id: `m-${index + 1}`,
				openedAt: index + 1,
				state: "working",
				liveness,
			}),
		),
		NO_LISTED_CONVERSATIONS,
	)["b-1"]

describe("missionsByRow", () => {
	it("gives a row with one mission its id, its state and its ticket", () => {
		expect(stripsFor("working")).toEqual([shownMission("m-1", "working")])
	})

	it("shows a mission the host reads needs_you as waiting", () => {
		expect(livenessStripsFor("needs_you")).toEqual([
			shownMission("m-1", "waiting"),
		])
	})

	it("orders a mission the host reads needs_you ahead of the ones that only work", () => {
		expect(
			livenessStripsFor("working", "needs_you", "idle")?.map(({ id }) => id),
		).toEqual(["m-2", "m-3", "m-1"])
	})

	it("shows a stored escalation the host reads working as working", () => {
		expect(
			missionsByRow(
				[onBoard({ id: "m-1", state: "waiting_human", liveness: "working" })],
				NO_LISTED_CONVERSATIONS,
			)["b-1"],
		).toEqual([shownMission("m-1", "working")])
	})

	it("lists every open mission of the row, most urgent first", () => {
		expect(stripsFor("working", "working", "ready_to_merge")).toEqual([
			shownMission("m-3", "ready"),
			shownMission("m-2", "working"),
			shownMission("m-1", "working"),
		])
	})

	it("opens the list on the most urgent state of the companion", () => {
		expect(stripsFor("working", "failed", "waiting_human")?.[0].state).toBe(
			"waiting",
		)
		expect(stripsFor("working", "ready_to_merge", "failed")?.[0].state).toBe(
			"failed",
		)
		expect(stripsFor("working", "ready_to_merge")?.[0].state).toBe("ready")
	})

	it("reads waiting for its companion as working", () => {
		expect(stripsFor("waiting_bot")).toEqual([shownMission("m-1", "working")])
	})

	it("opens on the mission opened most recently when two hold the most urgent state", () => {
		expect(
			missionsByRow(
				[
					onBoard({
						id: "m-late",
						openedAt: 5,
						state: "waiting_human",
						ticket: OTHER_TICKET,
					}),
					onBoard({ id: "m-early", openedAt: 2, state: "waiting_human" }),
					onBoard({ id: "m-running", openedAt: 1, state: "working" }),
				],
				NO_LISTED_CONVERSATIONS,
			)["b-1"],
		).toEqual([
			shownMission("m-late", "waiting", {
				platform: OTHER_TICKET.platform,
				externalId: OTHER_TICKET.externalId,
				title: OTHER_TICKET.title,
			}),
			shownMission("m-early", "waiting"),
			shownMission("m-running", "working"),
		])
	})

	it("leaves a closed mission out of the row whatever its state", () => {
		expect(
			missionsByRow(
				[
					onBoard({ id: "m-closed", state: "waiting_human", closedAt: 9 }),
					onBoard({ id: "m-open", state: "working" }),
				],
				NO_LISTED_CONVERSATIONS,
			)["b-1"],
		).toEqual([shownMission("m-open", "working")])
	})

	it("gives a row no list when every mission it holds is closed", () => {
		expect(
			missionsByRow(
				[onBoard({ id: "m-closed", state: "failed", closedAt: 9 })],
				NO_LISTED_CONVERSATIONS,
			),
		).toEqual({})
	})

	it("gives a mission the person closed no chip and no badge", () => {
		const rows = missionsByRow(
			[onBoard({ id: "m-closed", state: "closed", closedAt: 9 })],
			NO_LISTED_CONVERSATIONS,
		)

		expect(rows).toEqual({})
		expect(badgeOfMissionState("closed")).toBeNull()
	})

	it("breaks a tie on the mission id so two reads of one board agree", () => {
		const board = [
			onBoard({
				id: "m-b",
				openedAt: 3,
				state: "failed",
				ticket: OTHER_TICKET,
			}),
			onBoard({ id: "m-a", openedAt: 3, state: "failed" }),
		]
		const ordered = ["m-a", "m-b"]

		expect(
			missionsByRow(board, NO_LISTED_CONVERSATIONS)["b-1"]?.map(({ id }) => id),
		).toEqual(ordered)
		expect(
			missionsByRow([...board].reverse(), NO_LISTED_CONVERSATIONS)["b-1"]?.map(
				({ id }) => id,
			),
		).toEqual(ordered)
	})

	it("passes the ticket platform, identifier and title through untouched", () => {
		expect(
			missionsByRow(
				[
					onBoard({
						ticket: {
							platform: "  GitHub  ",
							externalId: "#4172",
							url: "https://github.com/vocca/kiroshi/pull/4172",
							title: "  Resume the second turn  ",
						},
					}),
				],
				NO_LISTED_CONVERSATIONS,
			)["b-1"],
		).toEqual([
			{
				id: "m-1",
				state: "working",
				ticket: {
					platform: "  GitHub  ",
					externalId: "#4172",
					title: "  Resume the second turn  ",
				},
			},
		])
	})

	it("gives every companion its own chip", () => {
		expect(
			missionsByRow(
				[
					onBoard({ botId: "b-1", state: "failed" }),
					onBoard({ botId: "b-2", state: "working" }),
					onBoard({ botId: "b-2", state: "working" }),
				],
				NO_LISTED_CONVERSATIONS,
			),
		).toEqual({
			"b-1": [shownMission("m-1", "failed")],
			"b-2": [shownMission("m-1", "working"), shownMission("m-1", "working")],
		})
	})

	it("gives the chip to the conversation the mission was opened from", () => {
		expect(
			missionsByRow(
				[onBoard({ originConversationId: "c-1", state: "failed" })],
				[{ id: "c-1" }],
			),
		).toEqual({ "c-1": [shownMission("m-1", "failed")] })
	})

	it("gathers on one conversation row what its companions carry there", () => {
		expect(
			missionsByRow(
				[
					onBoard({
						originConversationId: "c-1",
						botId: "b-1",
						state: "working",
					}),
					onBoard({
						originConversationId: "c-1",
						botId: "b-2",
						state: "waiting_human",
					}),
				],
				[{ id: "c-1" }],
			),
		).toEqual({
			"c-1": [shownMission("m-1", "waiting"), shownMission("m-1", "working")],
		})
	})

	it("gives the chip to the companion when no listed conversation carries the mission", () => {
		expect(
			missionsByRow(
				[onBoard({ originConversationId: "c-solo", state: "working" })],
				[{ id: "c-1" }],
			),
		).toEqual({ "b-1": [shownMission("m-1", "working")] })
	})
})

const HOME = "home"

const AWAY = "away"

const SOLO_THREADS = {
	"chat-home": { spaceId: HOME, botId: "b-1" },
	"chat-away": { spaceId: AWAY, botId: "b-1" },
}

describe("missionsBySpaceId", () => {
	it("strips a solo mission on the line of the space its origin thread sits in", () => {
		const missions = missionsBySpaceId({
			entries: [onBoard({ id: "m-1", originConversationId: "chat-away" })],
			conversationRosters: { [HOME]: [], [AWAY]: [] },
			soloThreads: SOLO_THREADS,
		})

		expect(missionsIn(missions, AWAY)["b-1"]).toEqual([
			shownMission("m-1", "working"),
		])
		expect(missionsIn(missions, HOME)["b-1"]).toBeUndefined()
	})

	it("strips a group mission on the conversation row of its own space", () => {
		const missions = missionsBySpaceId({
			entries: [onBoard({ id: "m-1", originConversationId: "room-1" })],
			conversationRosters: { [HOME]: [], [AWAY]: [{ id: "room-1" }] },
			soloThreads: SOLO_THREADS,
		})

		expect(missionsIn(missions, AWAY)["room-1"]).toEqual([
			shownMission("m-1", "working"),
		])
		expect(missionsIn(missions, AWAY)["b-1"]).toBeUndefined()
	})

	it("strips nothing when no space holds the origin conversation", () => {
		const missions = missionsBySpaceId({
			entries: [onBoard({ id: "m-1", originConversationId: "gone" })],
			conversationRosters: { [HOME]: [] },
			soloThreads: SOLO_THREADS,
		})

		expect(missionsIn(missions, HOME)).toEqual({})
	})

	it("answers no strips for a space nothing runs in", () => {
		expect(missionsIn({}, HOME)).toEqual({})
		expect(missionsIn({}, null)).toEqual({})
	})
})

describe("withMissions", () => {
	const held = row({ badge: "attention", status: "working", pose: "writing" })

	it("leaves the chat signals of the row untouched", () => {
		const carried = withMissions([held], {
			"b-1": [shownMission("m-1", "waiting")],
		})[0]

		expect(carried).toMatchObject({
			badge: "attention",
			title: "Research",
			lastMessage: "Pulled the three papers.",
			timestamp: "3m",
			status: "working",
			missions: [shownMission("m-1", "waiting")],
		})
	})

	it("leaves a row without a mission exactly as it reads", () => {
		expect(withMissions([held], {})).toEqual([held])
	})
})

describe("missionRingBadges", () => {
	const ringOf = (missions?: AppSidebarBot["missions"]) =>
		missionRingBadges({ work: [row({ missions })] }).work[0].badge

	it("lights the ring for a mission a person has to answer", () => {
		expect(ringOf([shownMission("m-1", "waiting")])).toBe("attention")
		expect(ringOf([shownMission("m-1", "failed")])).toBe("failed")
		expect(ringOf([shownMission("m-1", "ready")])).toBe("done")
	})

	it("leaves the ring dark for a mission that is still moving", () => {
		expect(ringOf([shownMission("m-1", "working")])).toBeUndefined()
		expect(ringOf(undefined)).toBeUndefined()
	})
})

describe("toSpaceMissionGroups", () => {
	const MIDNIGHT = Date.parse("2026-03-04T00:00:00")
	const AN_HOUR_MS = 60 * 60 * 1000
	const STATES: MissionState[] = [
		"waiting_human",
		"working",
		"waiting_bot",
		"ready_to_merge",
		"done",
		"failed",
		"closed",
	]
	const CONVERSATIONS = ["c-crashes", "c-billing"]

	const entryOf = (
		state: MissionState,
		conversationId: string,
		movedAt: number,
	): MissionInSpace => {
		const isClosed = ["done", "failed", "closed"].includes(state)
		return {
			mission: aMission({
				id: `${conversationId}-${state}`,
				originConversationId: conversationId,
				state,
				openedAt: MIDNIGHT - AN_HOUR_MS,
				lastActivityAt: isClosed ? null : movedAt,
				closedAt: isClosed ? movedAt : null,
			}),
			conversationId,
			conversationTitle: conversationId,
		}
	}

	const idsOf = (entries: MissionInSpace[]): string[] =>
		entries.map(({ mission }) => mission.id)

	it("sorts the missions of every conversation into their group, latest move first", () => {
		const entries = CONVERSATIONS.flatMap((conversationId, position) =>
			STATES.map((state) =>
				entryOf(state, conversationId, MIDNIGHT + (position + 1) * AN_HOUR_MS),
			),
		)
		const closedYesterday = entryOf("done", "c-yesterday", MIDNIGHT - 1)

		const groups = toSpaceMissionGroups({
			entries: [...entries, closedYesterday],
			closedSince: MIDNIGHT,
		})

		expect(idsOf(groups.waitingOnYou)).toEqual([
			"c-billing-waiting_human",
			"c-crashes-waiting_human",
		])
		expect(idsOf(groups.inProgress)).toEqual([
			"c-billing-working",
			"c-billing-waiting_bot",
			"c-billing-ready_to_merge",
			"c-crashes-working",
			"c-crashes-waiting_bot",
			"c-crashes-ready_to_merge",
		])
		expect(idsOf(groups.earlierToday)).toEqual([
			"c-billing-done",
			"c-billing-failed",
			"c-billing-closed",
			"c-crashes-done",
			"c-crashes-failed",
			"c-crashes-closed",
		])
	})

	it("groups a mission by its liveness over its stored state", () => {
		const withLiveness = (
			state: MissionState,
			liveness: MissionLiveness,
			conversationId: string,
		): MissionInSpace => {
			const entry = entryOf(state, conversationId, MIDNIGHT + AN_HOUR_MS)
			return { ...entry, mission: { ...entry.mission, liveness } }
		}

		const groups = toSpaceMissionGroups({
			entries: [
				withLiveness("working", "needs_you", "c-asking"),
				withLiveness("waiting_human", "working", "c-answered"),
				withLiveness("waiting_bot", "idle", "c-resting"),
			],
			closedSince: MIDNIGHT,
		})

		expect(idsOf(groups.waitingOnYou)).toEqual(["c-asking-working"])
		expect(idsOf(groups.inProgress).toSorted()).toEqual([
			"c-answered-waiting_human",
			"c-resting-waiting_bot",
		])
	})
})
