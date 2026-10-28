import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest"

import { createFakeMissions, type FakeMissions } from "./fake-missions"
import type { Mission, MissionEvent, MissionState } from "./mission-contract"
import { aMission, missionEvents } from "./mission-fixtures"
import {
	MISSION_TRIGGER_SOURCE,
	RUN_DEADLINE_MS,
	startMissionRunDriver,
} from "./mission-run-driver"
import { FAILURE_BURST_MS } from "./mission-run-failure"

import type { AgentEvent, RuntimeScope, TurnEnded } from "../agent/contract"
import { createChatController } from "../chat/chat-controller"
import type { ChatState } from "../chat/chat-state"
import type { ConversationState } from "../conversations/conversation-controller"
import { createConversationRuntimes } from "../conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "../conversations/scripted-driver"
import type { Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { seatBots } from "../conversations/transcript-fixtures"
import { joinFakeHost, leaveFakeHost } from "../host/fake-joined-hosts"
import { hostOfflineOf } from "../host/host-offline"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

const SPACE = "personal"

const AGENT_ASKED = missionEvents([
	{ kind: "opened", source: "human" },
	{
		kind: "agent_asked",
		source: "agent-hook",
		payload: { event: "Notification", message: "Which branch should I cut?" },
	},
])

const settled = async () => {
	for (let round = 0; round < 60; round += 1) {
		await Promise.resolve()
	}
}

type Started = {
	scope: RuntimeScope
	outputSchema?: Record<string, unknown>
}

type Harness = {
	driver: ScriptedDriver
	store: TranscriptStore
	missions: FakeMissions
	starts: Started[]
	originStarts: () => Started[]
	agentCalls: string[]
	thread: Conversation
	origin: Conversation
	guestBot: { id: string; name: string }
	mission: Mission
	reportFailure: ReturnType<typeof vi.fn>
	stop: () => void
	hold: (state: MissionState, events?: MissionEvent[]) => void
	announce: (state: MissionState) => Promise<void>
	standingSeq: () => number
	enter: (state: MissionState, events?: MissionEvent[]) => Promise<void>
	emitAtRun: (event: AgentEvent) => Promise<void>
	emitAtThread: (event: AgentEvent) => Promise<void>
	endTurn: (ended: Partial<TurnEnded>) => Promise<void>
	tail: () => ConversationState
	originTail: () => ConversationState
	soloTail: () => ChatState
	openSolo: () => Promise<void>
	speakInThread: (text: string) => Promise<void>
}

type HarnessSeed = {
	store?: Partial<TranscriptStore>
	open?: MissionState
	openEvents?: MissionEvent[]
	stalled?: boolean
	unreportedStalled?: boolean
	boardFails?: boolean
	unreportedFails?: boolean
	reportedFails?: boolean
	reports?: [missionId: string, turnId: string | null][]
	soloOrigin?: boolean
	firstStartFails?: boolean
	claimedElsewhere?: boolean
}

const CLOSING_INSTANT = 9

const STANDING_SEQ = 4

const closingInstantOf = (events: MissionEvent[]) =>
	events.some(({ kind }) => kind === "closed") ? CLOSING_INSTANT : null

const createHarness = async ({
	store: overrides = {},
	open,
	openEvents = AGENT_ASKED,
	stalled = false,
	unreportedStalled = false,
	boardFails = false,
	unreportedFails = false,
	reportedFails = false,
	reports = [],
	soloOrigin = false,
	firstStartFails = false,
	claimedElsewhere = false,
}: HarnessSeed = {}): Promise<Harness> => {
	const scripted = createScriptedDriver()
	const starts: Started[] = []
	const agentCalls: string[] = []
	const driver: ScriptedDriver = {
		...scripted,
		startOrResumeSession: (scope, resume, cwd, outputSchema) => {
			starts.push({ scope, outputSchema })
			return scripted.startOrResumeSession(scope, resume, cwd, outputSchema)
		},
		cancelTurn: (scope) => {
			agentCalls.push("cancelTurn")
			return scripted.cancelTurn(scope)
		},
		shutdown: (scope) => {
			agentCalls.push("shutdown")
			return scripted.shutdown(scope)
		},
	}
	const base = createFakeTranscriptStore()
	let isFirstStartRefused = firstStartFails
	const openRuntimeSession: TranscriptStore["openRuntimeSession"] = (
		...opening
	) => {
		if (!isFirstStartRefused) {
			return base.openRuntimeSession(...opening)
		}
		isFirstStartRefused = false
		return Promise.reject(new Error("no runtime"))
	}
	const store = { ...base, openRuntimeSession, ...overrides }
	const [bot, guestBot] = await seatBots(store, SPACE, ["Ada", "Bob"])
	const thread = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Ship the walls",
		botIds: [bot.id],
	})
	const origin = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "The war room",
		botIds: [bot.id, guestBot.id],
	})
	const runtimes = createConversationRuntimes(driver, store)
	const chat = createChatController(driver, store)
	const soloChat = await base.mainChat(bot.id)
	const missions = createFakeMissions()
	vi.spyOn(missions, "board")
	vi.spyOn(missions, "unreported")
	const reportFailure = vi.fn()
	const mission = aMission({
		botId: bot.id,
		threadConversationId: thread.id,
		originConversationId: soloOrigin ? soloChat.id : origin.id,
	})

	let standingSeq = STANDING_SEQ

	const missionAt = (state: MissionState, events: MissionEvent[]): Mission => ({
		...mission,
		state,
		stateSeq: standingSeq,
		closedAt: closingInstantOf(events),
	})

	if (open) {
		missions.hold({ mission: missionAt(open, openEvents), events: openEvents })
		missions.place([missionAt(open, openEvents)])
	}

	if (stalled) {
		missions.stall()
	}

	if (unreportedStalled) {
		missions.stallUnreported()
	}

	if (boardFails) {
		missions.refuseBoard()
	}

	if (unreportedFails) {
		missions.refuseUnreported()
	}

	for (const [missionId, turnId] of reports) {
		await missions.reported(missionId, turnId)
	}

	if (reportedFails) {
		missions.refuseReported()
	}

	if (claimedElsewhere) {
		missions.claimElsewhere(mission.id)
	}

	const stop = startMissionRunDriver({
		driver,
		store,
		runtimes,
		chat,
		missions,
		reportFailure,
		now: () => 7,
	})
	await settled()

	const hold = (state: MissionState, events = AGENT_ASKED) => {
		missions.hold({ mission: missionAt(state, events), events })
	}

	const announce = async (state: MissionState) => {
		missions.change({
			missionId: mission.id,
			spaceId: null,
			state,
			stateSeq: standingSeq,
			isAgentRunning: false,
			lastActivityAt: null,
		})
		await settled()
	}

	const enter = async (state: MissionState, events = AGENT_ASKED) => {
		standingSeq += 1
		hold(state, events)
		await announce(state)
	}

	const originStarts = () =>
		starts.filter((start) => start.scope.conversationId !== thread.id)

	const threadStarts = () =>
		starts.filter((start) => start.scope.conversationId === thread.id)

	const emitAt = async (opened: Started[], event: AgentEvent) => {
		const start = opened.at(-1)
		if (!start) {
			throw new Error("no mission session was opened")
		}
		driver.emit(start.scope, event)
		await settled()
	}

	const emitAtRun = (event: AgentEvent) => emitAt(originStarts(), event)

	const emitAtThread = (event: AgentEvent) => emitAt(threadStarts(), event)

	const endTurn = (ended: Partial<TurnEnded>) =>
		emitAtRun({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed", ...ended },
		})

	const reader = runtimes.runtimeFor(thread.id)
	await reader.open(thread)
	const originReader = runtimes.runtimeFor(origin.id)
	await originReader.open(origin)
	await settled()

	const openSolo = async () => {
		await chat.open(bot.id, null)
		await settled()
	}

	const speakInThread = async (text: string) => {
		await reader.send(text)
		await settled()
	}

	const tail = () => reader.getState()

	const originTail = () => originReader.getState()

	const soloTail = () => chat.stateFor(bot.id)

	return {
		driver,
		store,
		missions,
		starts,
		originStarts,
		agentCalls,
		thread,
		origin,
		guestBot,
		mission,
		reportFailure,
		stop,
		hold,
		announce,
		standingSeq: () => standingSeq,
		enter,
		emitAtRun,
		emitAtThread,
		endTurn,
		tail,
		originTail,
		soloTail,
		openSolo,
		speakInThread,
	}
}

const failuresRaisedBy = async ({ reportFailure }: Harness) => {
	await vi.advanceTimersByTimeAsync(FAILURE_BURST_MS)
	return reportFailure
}

const spoken = ({ messages }: ConversationState) =>
	messages.map(({ authorBotId, content }) => [authorBotId, content] as const)

const reported = (report: string): Partial<TurnEnded> => ({
	structuredOutput: { outcome: "report", report },
})

const closedBy = (source: string) =>
	missionEvents([
		{ kind: "opened", source: "human" },
		{ kind: "closed", source, payload: { summary: "The walls stand." } },
	])

const closedAfterAsking = missionEvents([
	{ kind: "opened", source: "human" },
	{
		kind: "agent_asked",
		source: "agent-hook",
		payload: { event: "Notification", message: "Which branch should I cut?" },
	},
	{
		kind: "closed",
		source: "poller",
		payload: { summary: "The walls stand." },
	},
])

const failedBy = (source: string) =>
	missionEvents([
		{ kind: "opened", source: "human" },
		{
			kind: "failed",
			source,
			payload: { summary: "The build will not pass." },
		},
	])

describe("startMissionRunDriver", () => {
	let harness: Harness

	const restart = async (seed: HarnessSeed) => {
		harness.stop()
		harness = await createHarness(seed)
	}

	const endThreadTurn = (ended: Partial<TurnEnded> = {}) =>
		harness.emitAtThread({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed", ...ended },
		})

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("summons the mission companion in its thread when the mission enters working", async () => {
		await harness.enter("working")

		expect(spoken(harness.tail())).toEqual([[null, "Carry out this mission."]])
		expect(harness.tail().speakers.map(({ botId }) => botId)).toEqual([
			harness.mission.botId,
		])
		expect(harness.originStarts()).toEqual([])
	})

	it("summons the mission companion in its thread when the mission enters waiting_bot", async () => {
		await harness.enter("waiting_bot")

		expect(spoken(harness.tail())).toEqual([
			[
				null,
				"The coding session of this mission is blocked and waiting on you.",
			],
		])
		expect(harness.tail().speakers.map(({ botId }) => botId)).toEqual([
			harness.mission.botId,
		])
		expect(harness.originStarts()).toEqual([])
	})

	it("records the answer with the seq the waiting_bot summon was taken on", async () => {
		await harness.enter("waiting_bot")

		expect(harness.missions.answers).toEqual([
			[harness.mission.id, harness.standingSeq()],
		])
	})

	it("records no answer when the summon cannot read the companion", async () => {
		await restart({
			store: { bots: () => Promise.reject(new Error("no companion")) },
		})

		await harness.enter("waiting_bot")

		expect(harness.missions.answers).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("records no answer for a summon taken on working", async () => {
		await harness.enter("working")

		expect(harness.missions.answers).toEqual([])
	})

	it("raises a failure notice when the answer cannot be recorded", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		harness.missions.refuseAnswered()

		await harness.enter("waiting_bot")

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("summons nobody when the thread of a mission entering working carries a message", async () => {
		await harness.enter("working")
		await harness.enter("waiting_human")
		await harness.enter("working")

		expect(spoken(harness.tail())).toEqual([[null, "Carry out this mission."]])
	})

	it("keeps the turn of a companion asking a question in its mission thread", async () => {
		await harness.enter("waiting_bot")

		await harness.emitAtThread({
			type: "questionRequested",
			request: {
				id: "q-1",
				questions: [
					{
						header: "Branch",
						question: "Which branch should I cut?",
						options: [],
						multiSelect: false,
					},
				],
			},
		})

		expect(harness.agentCalls).toEqual([])
		expect(harness.tail().pendingPrompt).toMatchObject({
			kind: "question",
			botId: harness.mission.botId,
		})
	})

	it("keeps the turn of a companion asking a permission in its mission thread", async () => {
		await harness.enter("waiting_bot")

		await harness.emitAtThread({
			type: "permissionRequested",
			request: { id: "p-1", toolName: "Bash", title: "Run it", detail: null },
		})

		expect(harness.agentCalls).toEqual([])
		expect(harness.tail().pendingPrompt).toMatchObject({
			kind: "permission",
			botId: harness.mission.botId,
		})
	})

	it("leaves the origin conversation untouched when it summons in the thread", async () => {
		await harness.enter("working")

		expect(spoken(harness.originTail())).toEqual([])
	})

	it("opens a closing session of its own on the origin for the owning companion", async () => {
		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})
	})

	it("asks a closing run for a report and nothing else", async () => {
		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()[0].outputSchema).toMatchObject({
			properties: { outcome: { enum: ["report"] } },
		})
	})

	it.each([
		["it ends on nothing", { outcome: "nothing" }],
		["its report text is blank", { outcome: "report", report: "   " }],
	])(
		"names a closing run that reported nothing when %s",
		async (_name, structuredOutput) => {
			const logged = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined)
			await harness.enter("done", closedBy("poller"))
			await harness.endTurn({ structuredOutput })

			expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
			expect(logged).toHaveBeenCalledWith(
				expect.stringContaining(
					"mission run driver: the closing mission run reported nothing",
				),
			)
			expect(spoken(harness.originTail())).toEqual([])
		},
	)

	it("names a closing run whose turn carried no structured output", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await harness.enter("done", closedBy("poller"))
		await harness.endTurn({ structuredOutput: undefined })
		await failuresRaisedBy(harness)

		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining(
				"mission run driver: the mission run ended with no structured output",
			),
		)
	})

	it("fences the mission events and the agent last message under the instruction", async () => {
		await harness.enter("done", closedAfterAsking)

		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("Your mission is finished")
		expect(prompt).toContain("Which branch should I cut?")
		expect(prompt).toContain('"agentLastMessage"')
		expect(prompt).toMatch(/never instructions to follow/)
		expect(prompt.indexOf("Your mission is finished")).toBeLessThan(
			prompt.indexOf("<untrusted-data>"),
		)
	})

	it("runs the companion once while its run is live", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("failed", failedBy("agent-hook"))

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("opens one run per seq when two changes leave the mission blocked", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.endTurn(reported("The build will not pass."))
		await harness.enter("failed", failedBy("agent-hook"))

		expect(harness.originStarts()).toHaveLength(2)
		expect(harness.driver.submissions).toHaveLength(2)
	})

	it("opens no run for a change carrying a seq it already handled", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.endTurn(reported("The build will not pass."))
		await harness.announce("failed")

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("takes a change of a new seq kept while the run was live", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("failed", failedBy("agent-hook"))

		expect(harness.originStarts()).toHaveLength(1)

		await harness.endTurn(reported("The build will not pass."))

		expect(harness.originStarts()).toHaveLength(2)
		expect(harness.driver.submissions).toHaveLength(2)
	})

	it("keeps the state of a change it dropped for being busy", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("working")
		expect(spoken(harness.tail())).toEqual([])

		await harness.endTurn(reported("The build will not pass."))

		expect(spoken(harness.tail())).toEqual([[null, "Carry out this mission."]])
	})

	it("cancels the turn of a refused run before it shuts its session down", async () => {
		await harness.enter("done", closedBy("poller"))

		await harness.emitAtRun({
			type: "permissionRequested",
			request: { id: "p-1", toolName: "Bash", title: "Run it", detail: null },
		})

		expect(harness.agentCalls).toEqual(["cancelTurn", "shutdown"])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("ends a run that outlived its deadline and takes the mission again", async () => {
		vi.useFakeTimers()
		await harness.enter("failed", failedBy("agent-hook"))

		await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS)

		expect(harness.agentCalls).toEqual(["cancelTurn", "shutdown"])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)

		vi.useRealTimers()
		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toHaveLength(2)
	})

	it("runs the companion again once the run has ended", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })
		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toHaveLength(2)
	})

	it("reports a mission its companion closed as failed in the origin conversation", async () => {
		await harness.enter("failed", failedBy("claude-code"))

		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})

		await harness.endTurn(reported("The build will not pass, I am blocked."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The build will not pass, I am blocked."],
		])
		expect(spoken(harness.tail())).toEqual([])
	})

	it("reports a closing written by the poller in the origin conversation", async () => {
		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
		expect(spoken(harness.tail())).toEqual([])
	})

	it("shows the report in the open solo thread when the origin is the main chat", async () => {
		await restart({ soloOrigin: true })
		await harness.openSolo()
		await harness.enter("done", closedBy("poller"))
		await harness.endTurn(reported("The walls stand, handing over."))

		expect(harness.soloTail().messages).toEqual([
			expect.objectContaining({
				role: "assistant",
				authorBotId: harness.mission.botId,
				content: "The walls stand, handing over.",
				completion: "complete",
			}),
		])
		expect(spoken(harness.originTail())).toEqual([])
	})

	it("reports in the origin conversation when the main chat cannot be read", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await restart({
			store: { mainChat: () => Promise.reject(new Error("refused")) },
		})
		await harness.enter("done", closedBy("poller"))
		await harness.endTurn(reported("The walls stand, handing over."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(logged).toHaveBeenCalledWith(
			"mission run driver: conversation_main_chat failed",
			expect.any(Error),
		)
	})

	it("tells a closed mission to close itself, report and hand over", async () => {
		await harness.enter("done", closedBy("poller"))

		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("Your mission is finished")
		expect(prompt).toContain("Close it if it is still open")
		expect(prompt).toContain("mention whoever takes it from here")
	})

	it("tells a failed mission it is blocked and cannot go further", async () => {
		await harness.enter("failed", failedBy("claude-code"))

		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("blocked and cannot go further")
		expect(prompt).toContain("mention whoever takes it from here")
	})

	it("carries the roster block of the origin conversation on a closing run", async () => {
		harness.missions.holdRosterBlock("The room holds @ada and @grace.")
		await harness.enter("done", closedBy("poller"))

		expect(harness.missions.rosterCalls).toEqual([
			[harness.origin.id, harness.mission.botId],
		])
		const [{ prompt }] = harness.driver.submissions
		expect(prompt).toContain("The room holds @ada and @grace.")
		expect(prompt.indexOf("The room holds @ada and @grace.")).toBeLessThan(
			prompt.indexOf("<untrusted-data>"),
		)
	})

	it("runs with no roster block when the roster block is absent", async () => {
		harness.missions.holdRosterBlock(null)
		await harness.enter("failed", failedBy("claude-code"))

		expect(harness.driver.submissions).toHaveLength(1)
		expect(harness.driver.submissions[0].prompt).toContain(
			"blocked and cannot go further",
		)
	})

	it("runs with no roster block when its call rejects", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		harness.missions.holdRosterBlock("The room holds @ada.")
		harness.missions.refuseRosterBlock()
		await harness.enter("done", closedBy("poller"))

		expect(harness.driver.submissions).toHaveLength(1)
		expect(harness.driver.submissions[0].prompt).not.toContain(
			"The room holds @ada.",
		)
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("starts no second run when its companion writes the state of the seq it runs on", async () => {
		await harness.enter("failed", failedBy("claude-code"))
		await harness.announce("failed")
		await harness.endTurn(reported("The build will not pass."))

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.driver.submissions).toHaveLength(1)
	})

	it("opens one closing run whatever state its companion writes while it runs", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("done", closedBy("claude-code"))

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(harness.originStarts()).toHaveLength(1)
		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
		expect(harness.missions.detailCalls).toHaveLength(2)
	})

	it("holds a state announced while the mission of an ended run is read", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		harness.hold("done", closedBy("claude-code"))
		harness.missions.stallDetail()

		await harness.endTurn(reported("The walls stand, handing over."))
		await harness.announce("done")
		harness.missions.releaseDetail()
		await settled()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("takes the state its companion wrote when the reading at the end fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("done", closedBy("claude-code"))
		harness.missions.refuseOnce(harness.mission.id)

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(harness.originStarts()).toHaveLength(2)
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("takes a closing that landed while a summoned companion was speaking", async () => {
		await harness.enter("waiting_bot")
		await harness.enter("done", closedBy("claude-code"))

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
	})

	it("opens a status run on the origin when a turn ends in the mission thread", async () => {
		await harness.enter("working")

		await endThreadTurn()

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})
	})

	it("tells a status run where the mission stands and who picks it up", async () => {
		await harness.enter("working")

		await endThreadTurn()

		expect(harness.driver.submissions.at(-1)?.prompt).toContain(
			"Report in a few lines where your mission stands right now and mention whoever picks the work up next. Name no step, no tool, no merge, no ticket and no pull request.",
		)
	})

	it("opens a status run whatever outcome the ended turn carries", async () => {
		await harness.enter("working")

		await endThreadTurn({ outcome: "failed" })

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("writes the status of a room origin in that conversation", async () => {
		await harness.enter("working")
		await endThreadTurn()

		await harness.endTurn(reported("The walls are half up."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls are half up."],
		])
	})

	it("summons the companion a status report names in a room origin", async () => {
		await harness.enter("working")
		await endThreadTurn()

		await harness.endTurn(
			reported(`The walls are half up, @${harness.guestBot.name} paints them.`),
		)

		expect(
			harness.starts.map(({ scope }) => [scope.conversationId, scope.botId]),
		).toContainEqual([harness.origin.id, harness.guestBot.id])
	})

	it("reads the mission once for a status run, at its opening", async () => {
		await harness.enter("working")

		expect(harness.missions.detailCalls).toHaveLength(1)

		await endThreadTurn()
		await harness.endTurn(reported("The walls are half up."))

		expect(harness.missions.detailCalls).toHaveLength(2)
	})

	it("raises no failure notice when the mission cannot be read back", async () => {
		await harness.enter("working")
		await endThreadTurn()
		harness.missions.refuse(harness.mission.id)

		await harness.endTurn(reported("The walls are half up."))

		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls are half up."],
		])
	})

	it("writes the status of a solo origin in the main chat", async () => {
		await restart({ soloOrigin: true })
		await harness.openSolo()
		await harness.enter("working")
		await endThreadTurn()

		await harness.endTurn(reported("The walls are half up."))

		expect(harness.soloTail().messages).toEqual([
			expect.objectContaining({
				role: "assistant",
				authorBotId: harness.mission.botId,
				content: "The walls are half up.",
			}),
		])
	})

	it("takes the thread of an open mission whatever its state at start", async () => {
		await restart({ open: "waiting_human" })
		await harness.speakInThread("Where does it stand?")

		await endThreadTurn()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("opens no status run when the mission is closed as the turn ends", async () => {
		await harness.enter("working")
		harness.hold("done", closedBy("poller"))

		await endThreadTurn()

		expect(harness.originStarts()).toEqual([])
	})

	it("opens no status run while a run is already live for the mission", async () => {
		await harness.enter("working")
		await harness.enter("failed", failedBy("agent-hook"))

		await endThreadTurn()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("holds a state announced while a status run is being decided", async () => {
		await harness.enter("working")
		harness.missions.stallDetail()
		await endThreadTurn()
		await harness.enter("failed", failedBy("agent-hook"))

		expect(harness.originStarts()).toEqual([])

		harness.missions.releaseDetail()
		await settled()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("takes the closing announced while a status run was live", async () => {
		await harness.enter("working")
		await endThreadTurn()
		await harness.enter("done", closedBy("poller"))

		await harness.endTurn(reported("The walls are half up."))

		expect(harness.originStarts()).toHaveLength(2)
		expect(harness.driver.submissions.at(-1)?.prompt).toContain(
			"Your mission is finished.",
		)
	})

	it("raises a failure notice when a status run reports nothing", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await harness.enter("working")
		await endThreadTurn()

		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(harness.missions.reports).toEqual([])
	})

	it("opens no run when a turn ends outside any mission thread", async () => {
		await harness.enter("working")

		harness.driver.emit(
			{
				conversationId: harness.origin.id,
				botId: harness.mission.botId,
				runtimeSessionId: "runtime-session",
				epoch: 1,
			},
			{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
		)
		await settled()

		expect(harness.originStarts()).toEqual([])
	})

	it("keeps none but the last change dropped while a run was live", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("working")
		await harness.enter("waiting_bot")
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(harness.originStarts()).toHaveLength(1)
		expect(spoken(harness.tail())).toEqual([
			[
				null,
				"The coding session of this mission is blocked and waiting on you.",
			],
		])
	})

	it("runs once when a change lands while the read already carries its state", async () => {
		harness.hold("done", closedBy("poller"))
		harness.missions.stallDetail()
		await harness.announce("waiting_bot")
		await harness.announce("done")
		harness.missions.releaseDetail()
		await settled()

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(harness.originStarts()).toHaveLength(1)
		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
	})

	it("takes a change kept while a read that failed was in flight", async () => {
		harness.hold("done", closedBy("poller"))
		harness.missions.stallDetail()
		harness.missions.refuseOnce(harness.mission.id)
		await harness.announce("waiting_bot")
		await harness.announce("done")
		harness.missions.releaseDetail()
		await settled()

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
			botId: harness.mission.botId,
		})
	})

	it("takes no dropped change once it is stopped", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.enter("done", closedBy("poller"))

		harness.stop()
		await settled()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("lights no working row in the mission thread while a closing run is live", async () => {
		await harness.enter("done", closedBy("poller"))

		expect(harness.tail().speakers).toEqual([])
		expect(harness.tail().waitingBotIds).toEqual([])
		expect(spoken(harness.tail())).toEqual([])
	})

	it("carries the cause of the mission run on the report turn", async () => {
		await harness.enter("done", closedBy("poller"))
		await harness.endTurn(reported("The walls stand."))

		expect([...harness.originTail().reportedCauses.values()]).toEqual([
			{
				turnId: expect.any(String),
				routineTitle: harness.mission.ticket.externalId,
				triggerSourceId: MISSION_TRIGGER_SOURCE,
			},
		])
	})

	it("raises a failure notice and writes nothing when the session cannot open", async () => {
		await restart({
			store: {
				openRuntimeSession: () => Promise.reject(new Error("no runtime")),
			},
		})

		await harness.enter("done", closedBy("poller"))

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(spoken(harness.originTail())).toEqual([])
	})

	it("takes the seq again once a start that failed is announced anew", async () => {
		await restart({ firstStartFails: true })

		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)

		await harness.announce("done")

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.driver.submissions).toHaveLength(1)
	})

	it("takes the seq again once a read that failed is announced anew", async () => {
		harness.missions.refuseOnce(harness.mission.id)

		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)

		await harness.announce("done")

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("raises a failure notice when the run's turn ends without a report", async () => {
		await harness.enter("done", closedBy("poller"))
		await harness.endTurn({ outcome: "failed" })

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(spoken(harness.originTail())).toEqual([])
	})

	it("summons in the thread of an open mission that waits on the companion at start", async () => {
		await restart({ open: "waiting_bot" })

		expect(spoken(harness.tail())).toEqual([
			[
				null,
				"The coding session of this mission is blocked and waiting on you.",
			],
		])
		expect(harness.originStarts()).toEqual([])
	})

	it("takes a mission closed before the start that still owes a report", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.originStarts()[0].scope).toMatchObject({
			conversationId: harness.origin.id,
		})
	})

	it("takes a mission the hook failed before the start while it stayed open", async () => {
		await restart({ open: "failed", openEvents: failedBy("agent-hook") })

		await harness.endTurn(reported("The build will not pass."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The build will not pass."],
		])
	})

	it("records no report and raises no notice for a run on a mission still open", async () => {
		await restart({ open: "failed", openEvents: failedBy("agent-hook") })
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(harness.missions.reports).toEqual([])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("names a run that reported nothing on a mission closed while it ran", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await restart({ open: "failed", openEvents: failedBy("agent-hook") })
		harness.hold("done", closedBy("claude-code"))

		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })
		await failuresRaisedBy(harness)

		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining(
				"mission run driver: the closing mission run reported nothing",
			),
		)
		expect(harness.missions.reports).toEqual([[harness.mission.id, null]])
	})

	it("records the report of a closing run with the turn it was written on", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })
		await harness.endTurn(reported("The walls stand."))

		const [turnId] = [...harness.originTail().reportedCauses.keys()]
		expect(harness.missions.reports).toEqual([[harness.mission.id, turnId]])
	})

	it("records the report of a closing run that had nothing to write", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await restart({ open: "done", openEvents: closedBy("poller") })
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		expect(harness.missions.reports).toEqual([[harness.mission.id, null]])
	})

	it("records nothing when the turn of a closing run does not complete", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })
		await harness.endTurn({ outcome: "failed" })

		expect(harness.missions.reports).toEqual([])
	})

	it("records nothing for a run on a mission still open", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		await harness.endTurn(reported("The build will not pass."))

		expect(harness.missions.reports).toEqual([])
	})

	it("records the report of a run on a mission its own companion closed", async () => {
		await harness.enter("failed", failedBy("agent-hook"))
		harness.hold("done", closedBy("claude-code"))

		await harness.endTurn(reported("The walls stand."))

		const [turnId] = [...harness.originTail().reportedCauses.keys()]
		expect(harness.missions.reports).toEqual([[harness.mission.id, turnId]])
	})

	it("raises a failure notice when the mission cannot be read at the end", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		await restart({ open: "done", openEvents: closedBy("poller") })
		harness.missions.refuseOnce(harness.mission.id)

		await harness.endTurn(reported("The walls stand."))

		expect(harness.missions.reports).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("raises a failure notice when the report cannot be recorded", async () => {
		await restart({
			open: "done",
			openEvents: closedBy("poller"),
			reportedFails: true,
		})
		await harness.endTurn(reported("The walls stand."))

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("raises no failure notice when another window recorded the report first", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
		await restart({ open: "done", openEvents: closedBy("poller") })
		await harness.missions.reported(harness.mission.id, null)

		await harness.endTurn(reported("The walls stand."))

		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(harness.missions.reports).toEqual([[harness.mission.id, null]])
		expect(info).toHaveBeenCalledTimes(1)
	})

	it("starts no run for a mission whose report was recorded", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })
		await harness.endTurn(reported("The walls stand."))
		const reports = [...harness.missions.reports]

		await restart({ open: "done", openEvents: closedBy("poller"), reports })

		expect(harness.originStarts()).toEqual([])
	})

	it("takes the open missions when the unreported missions cannot be read", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)

		await restart({
			open: "failed",
			openEvents: failedBy("agent-hook"),
			unreportedFails: true,
		})

		expect(harness.originStarts()).toHaveLength(1)
		expect(logged).toHaveBeenCalledWith(
			"mission run driver: mission_unreported failed",
			expect.any(Error),
		)
	})

	it("starts no run when it is stopped before the unreported read resolves", async () => {
		await restart({
			open: "done",
			openEvents: closedBy("poller"),
			unreportedStalled: true,
		})

		harness.stop()
		harness.missions.releaseUnreported()
		await settled()

		expect(harness.originStarts()).toEqual([])
	})

	it("summons in the thread of an open mission already working at start", async () => {
		await restart({ open: "working" })

		expect(spoken(harness.tail())).toEqual([[null, "Carry out this mission."]])
		expect(harness.originStarts()).toEqual([])
	})

	it("runs once when a change arrives while the start read is in flight", async () => {
		await restart({
			open: "failed",
			openEvents: failedBy("agent-hook"),
			stalled: true,
		})

		await harness.enter("failed", failedBy("agent-hook"))
		harness.missions.release()
		await settled()

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("runs no second time on a change carrying the seq read at start", async () => {
		await restart({ open: "failed", openEvents: failedBy("agent-hook") })
		await harness.endTurn({ structuredOutput: { outcome: "nothing" } })

		await harness.announce("failed")

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("keeps listening to mission changes when the open missions cannot be read", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		await restart({ boardFails: true })

		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toHaveLength(1)
		expect(logged).toHaveBeenCalledWith(
			"mission run driver: the open missions could not be read",
			expect.any(Error),
		)
	})

	it("starts no run when it is stopped before the start read resolves", async () => {
		await restart({
			open: "failed",
			openEvents: failedBy("agent-hook"),
			stalled: true,
		})

		harness.stop()
		harness.missions.release()
		await settled()

		expect(harness.originStarts()).toEqual([])
	})

	it("raises a failure notice when the mission cannot be read", async () => {
		harness.missions.refuse(harness.mission.id)
		await harness.enter("waiting_bot")

		expect(spoken(harness.tail())).toEqual([])
		expect(harness.originStarts()).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})

	it("raises a failure notice and summons nobody when the companion cannot be read", async () => {
		await restart({
			store: { bots: () => Promise.reject(new Error("no companion")) },
		})

		await harness.enter("working")

		expect(spoken(harness.tail())).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
	})
})

describe("startMissionRunDriver while a joined space is active", () => {
	const JOINED_SPACE = "garage"
	let harness: Harness

	const sentToTheMissions = () => ({
		boards: vi.mocked(harness.missions.board).mock.calls.length,
		unreported: vi.mocked(harness.missions.unreported).mock.calls.length,
		details: harness.missions.detailCalls.length,
		reports: harness.missions.reports.length,
		answers: harness.missions.answers.length,
	})

	const endTurnInThreadOf = async (conversationId: string) => {
		harness.driver.emit(
			{
				conversationId,
				botId: harness.mission.botId,
				runtimeSessionId: "a-host-session",
				epoch: 1,
			},
			{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
		)
		await settled()
	}

	const joinTheSpace = async () => {
		await joinFakeHost(JOINED_SPACE)
		await settled()
	}

	const leaveForALocalSpace = async () => {
		await leaveFakeHost(JOINED_SPACE)
		await settled()
	}

	const startOn = async (spaceId: string | null, open?: MissionState) => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		if (spaceId) {
			await joinFakeHost(spaceId)
		}
		harness = await createHarness({
			open,
			openEvents: open === "done" ? closedBy("poller") : AGENT_ASKED,
		})
	}

	afterEach(async () => {
		harness.stop()
		await leaveFakeHost(JOINED_SPACE)
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("keeps a live local run open and its turn running when a joined space becomes active", async () => {
		await startOn(null, "done")

		await joinTheSpace()

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.agentCalls).toEqual([])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("writes the report and the reported mark of a run started on a local space whose whole turn runs on a joined space", async () => {
		await startOn(null, "done")
		await joinTheSpace()

		await harness.endTurn(reported("The walls stand, handing over."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls stand, handing over."],
		])
		expect(harness.missions.reports).toEqual([
			[harness.mission.id, expect.any(String)],
		])
		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.agentCalls).toEqual(["shutdown"])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("writes the status of a local mission whose thread turn ends while a joined space is active", async () => {
		await startOn(null)
		await harness.enter("working")
		await joinTheSpace()

		await endTurnInThreadOf(harness.thread.id)
		await harness.endTurn(reported("The walls are half up."))

		expect(spoken(harness.originTail())).toEqual([
			[harness.mission.botId, "The walls are half up."],
		])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("catches up on the open and unreported missions of this computer on a joined space", async () => {
		await startOn(JOINED_SPACE, "done")

		expect(sentToTheMissions()).toMatchObject({ boards: 1, unreported: 1 })
		expect(harness.originStarts()).toHaveLength(1)
	})

	it("takes the mission changes of this computer on a joined space", async () => {
		await startOn(JOINED_SPACE)

		await harness.enter("done", closedBy("poller"))

		expect(harness.originStarts()).toHaveLength(1)
	})

	it("starts a mission once when back on a local space after its run ended on a joined space", async () => {
		await startOn(null, "done")
		await joinTheSpace()
		await harness.endTurn(reported("The walls stand, handing over."))

		await leaveForALocalSpace()
		await harness.announce("done")

		expect(harness.originStarts()).toHaveLength(1)
		expect(harness.missions.reports).toHaveLength(1)
	})

	it("opens no run when a turn ends in a thread of the joined space", async () => {
		await startOn(JOINED_SPACE)
		const before = sentToTheMissions()

		await endTurnInThreadOf("a-thread-of-the-joined-space")

		expect(sentToTheMissions()).toEqual(before)
		expect(harness.starts).toEqual([])
	})
})

describe("startMissionRunDriver beside a joined host", () => {
	const JOINED_HOST = "host-1"
	let harness: Harness

	const threadScope = () => {
		const opened = harness.starts.find(
			({ scope }) => scope.conversationId === harness.thread.id,
		)
		if (!opened) {
			throw new Error("no thread session was opened")
		}
		return opened.scope
	}

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("reads no mission and starts no run when a joined host announces a mission change", async () => {
		harness.hold("working")

		harness.missions.change(
			{
				missionId: harness.mission.id,
				spaceId: null,
				state: "working",
				stateSeq: harness.standingSeq() + 1,
				isAgentRunning: false,
				lastActivityAt: null,
			},
			JOINED_HOST,
		)
		await settled()

		expect(harness.missions.detailCalls).toEqual([])
		expect(harness.starts).toEqual([])
		expect(spoken(harness.tail())).toEqual([])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
	})

	it("opens no status run when a joined host ends a turn in a mission thread", async () => {
		await harness.enter("working")
		const readsBefore = harness.missions.detailCalls.length

		harness.driver.emit(
			threadScope(),
			{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
			JOINED_HOST,
		)
		await settled()

		expect(harness.originStarts()).toEqual([])
		expect(harness.missions.detailCalls).toHaveLength(readsBefore)
	})
})

describe("startMissionRunDriver raising a failure", () => {
	const UNKNOWN_MISSION = { kind: "unknownMission", id: "m-gone" }
	const LOCKED_STORAGE = { kind: "storage", failure: { reason: "locked" } }
	const UNEXPECTED = { kind: "unexpected", detail: "the store went silent" }
	let harness: Harness
	let logged: MockInstance<typeof console.error>
	let informed: MockInstance<typeof console.info>

	const linesNaming = (reason: string) =>
		logged.mock.calls
			.map(([line]) => String(line))
			.filter((line) => line.startsWith(`mission run driver: ${reason}`))

	const announceIn = async (spaceId: string | null) => {
		harness.missions.change({
			missionId: harness.mission.id,
			spaceId,
			state: "working",
			stateSeq: harness.standingSeq() + 1,
			isAgentRunning: false,
			lastActivityAt: null,
		})
		await settled()
	}

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
		informed = vi.spyOn(console, "info").mockImplementation(() => undefined)
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("logs one line naming the reason, the serialized error, the mission and the side", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await harness.enter("waiting_bot")
		await failuresRaisedBy(harness)

		expect(linesNaming("the mission could not be read")).toEqual([
			`mission run driver: the mission could not be read | error: {"kind":"storage","failure":{"reason":"locked"}} | mission: ${harness.mission.id} | side: local | count: 1`,
		])
	})

	it("reads a change heard on this computer on this computer and writes that side on the failure line, whatever Space id a joined host shares", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await announceIn("personal")
		await failuresRaisedBy(harness)

		expect(harness.missions.readSides).toEqual([[harness.mission.id, null]])
		expect(linesNaming("the mission could not be read")).toEqual([
			expect.stringContaining(
				`| mission: ${harness.mission.id} | space: personal | side: local |`,
			),
		])
	})

	it("logs one line naming the mission, the Space and the side and raises no card when the host is offline", async () => {
		const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		vi.spyOn(harness.missions, "detail").mockRejectedValue(
			hostOfflineOf("joined host garage: unreachable"),
		)
		await announceIn("personal")

		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(linesNaming("the mission could not be read")).toEqual([])
		expect(warned.mock.calls).toEqual([
			[
				expect.stringContaining(
					`| mission: ${harness.mission.id} | space: personal | side: local |`,
				),
			],
		])
	})

	it("skips a change of a mission this computer cannot read with one info line and no card", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(UNKNOWN_MISSION)
		await announceIn("s1")

		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(linesNaming("the mission could not be read")).toEqual([])
		expect(informed.mock.calls).toEqual([
			[
				`missions: skipped the change of a mission its side cannot read | mission: ${harness.mission.id} | space: s1 | side: local`,
			],
		])
		expect(harness.originStarts()).toEqual([])
	})

	it("never logs nor reports [object Object] for a thrown plain object", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await harness.enter("waiting_bot")
		const raised = await failuresRaisedBy(harness)

		expect(JSON.stringify(logged.mock.calls)).not.toContain("[object Object]")
		expect(JSON.stringify(raised.mock.calls)).not.toContain("[object Object]")
	})

	it("hands the card the mission, the side and the cause it was raised for", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await harness.enter("waiting_bot")

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledWith(
			expect.objectContaining({ cause: expect.any(String) }),
			{ side: "local", mission: harness.mission.id, count: 1 },
		)
	})

	it("raises one card and one line carrying the count when a cause fails in a burst", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await harness.enter("waiting_bot")
		await harness.enter("working")
		await harness.enter("waiting_bot")

		const raised = await failuresRaisedBy(harness)

		expect(raised).toHaveBeenCalledTimes(1)
		expect(raised).toHaveBeenCalledWith(expect.anything(), {
			side: "local",
			mission: harness.mission.id,
			count: 3,
		})
		expect(linesNaming("the mission could not be read")).toEqual([
			expect.stringContaining("| count: 3"),
		])
	})

	it("raises one card per cause even when every card carries the same title", async () => {
		vi.spyOn(harness.missions, "detail")
			.mockRejectedValueOnce(LOCKED_STORAGE)
			.mockRejectedValueOnce(UNEXPECTED)
		await harness.enter("waiting_bot")
		await harness.enter("working")

		const raised = await failuresRaisedBy(harness)

		const [first, second] = raised.mock.calls.map(([notice]) => notice)
		expect(raised).toHaveBeenCalledTimes(2)
		expect(first.title).toBe(second.title)
		expect(first.cause).not.toBe(second.cause)
	})

	it("raises the failures still counting when it stops", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await harness.enter("waiting_bot")

		harness.stop()

		expect(harness.reportFailure).toHaveBeenCalledTimes(1)
		expect(linesNaming("the mission could not be read")).toHaveLength(1)
	})

	it("logs nothing, raises nothing and leaves no timer for a failure raised after it stopped", async () => {
		harness.missions.refuse(harness.mission.id)
		harness.missions.stallDetail()
		await harness.enter("waiting_bot")

		harness.stop()
		harness.missions.releaseDetail()
		await settled()

		expect(vi.getTimerCount()).toBe(0)
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(linesNaming("the mission could not be read")).toEqual([])
	})

	it("names the Space a mission change carried on the line and the card of a failed read", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await announceIn("s1")
		const raised = await failuresRaisedBy(harness)

		expect(linesNaming("the mission could not be read")).toEqual([
			expect.stringContaining(
				`| mission: ${harness.mission.id} | space: s1 | side: local |`,
			),
		])
		expect(raised).toHaveBeenCalledWith(expect.anything(), {
			side: "local",
			mission: harness.mission.id,
			space: "s1",
			count: 1,
		})
	})

	it("leaves the Space out of the line and the card of a mission whose Space it never heard", async () => {
		vi.spyOn(harness.missions, "detail").mockRejectedValue(LOCKED_STORAGE)
		await announceIn(null)
		const raised = await failuresRaisedBy(harness)

		expect(linesNaming("the mission could not be read")).toEqual([
			expect.not.stringContaining("space:"),
		])
		expect(raised.mock.calls[0][1]).not.toHaveProperty("space")
	})

	it("names the Space it remembered for the thread when a status run cannot read its mission", async () => {
		harness.missions.hold({
			mission: {
				...harness.mission,
				spaceId: "s1",
				stateSeq: harness.standingSeq() + 1,
			},
			events: AGENT_ASKED,
		})
		await announceIn("s1")
		await settled()
		harness.missions.refuse(harness.mission.id)

		await harness.emitAtThread({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed" },
		})

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledWith(
			expect.anything(),
			{ side: "local", mission: harness.mission.id, space: "s1", count: 1 },
		)
	})
})

describe("startMissionRunDriver claiming a run", () => {
	const FIRST_TOKEN = "token-1"
	let harness: Harness
	let logged: MockInstance<typeof console.error>
	let informed: MockInstance<typeof console.info>

	const restart = async (seed: HarnessSeed) => {
		harness.stop()
		harness = await createHarness(seed)
	}

	const consoleLines = () =>
		[...logged.mock.calls, ...informed.mock.calls].map(([line]) => String(line))

	const runAClosingMission = () => harness.enter("done", closedBy("poller"))

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
		informed = vi.spyOn(console, "info").mockImplementation(() => undefined)
		harness = await createHarness()
	})

	afterEach(() => {
		harness.stop()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("claims the mission before it opens a session for it", async () => {
		const claim = vi.spyOn(harness.missions, "claimRun")
		const open = vi.spyOn(harness.store, "openRuntimeSession")

		await runAClosingMission()

		expect(harness.missions.claims).toEqual([harness.mission.id])
		expect(claim.mock.invocationCallOrder[0]).toBeLessThan(
			open.mock.invocationCallOrder[0],
		)
	})

	it("claims a status run before it opens its session", async () => {
		await harness.enter("working")
		await harness.emitAtThread({
			type: "turnEnded",
			ended: { sessionId: null, outcome: "completed" },
		})

		expect(harness.missions.claims).toEqual([harness.mission.id])
		expect(harness.originStarts()).toHaveLength(1)
	})

	it("opens nothing, writes nothing and raises nothing when another window runs the mission", async () => {
		await restart({ claimedElsewhere: true })

		await runAClosingMission()

		expect(harness.originStarts()).toEqual([])
		expect(harness.driver.submissions).toEqual([])
		expect(spoken(harness.originTail())).toEqual([])
		expect(harness.missions.reports).toEqual([])
		expect(harness.missions.releases).toEqual([])
		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(consoleLines()).toEqual([
			`mission run driver: another window runs the mission | mission: ${harness.mission.id}`,
		])
	})

	it("starts no run and raises the failure when the claim cannot be made", async () => {
		harness.missions.refuseClaim()

		await runAClosingMission()

		expect(harness.originStarts()).toEqual([])
		expect(harness.missions.releases).toEqual([])
		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(consoleLines()).toEqual([
			expect.stringMatching(
				/^mission run driver: the mission run could not be claimed \| error: /,
			),
		])
	})

	it("releases the claim only once the report is written and recorded", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })
		const recording = Promise.withResolvers<void>()
		const record = harness.missions.reported
		vi.spyOn(harness.missions, "reported").mockImplementation(
			async (missionId, turnId) => {
				await recording.promise
				await record(missionId, turnId)
			},
		)

		await harness.endTurn(reported("The walls stand."))

		expect(spoken(harness.originTail())).not.toEqual([])
		expect(harness.missions.releases).toEqual([])

		recording.resolve()
		await settled()

		expect(harness.missions.reports).toHaveLength(1)
		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the report cannot be recorded", async () => {
		await restart({
			open: "done",
			openEvents: closedBy("poller"),
			reportedFails: true,
		})

		await harness.endTurn(reported("The walls stand."))

		expect(await failuresRaisedBy(harness)).toHaveBeenCalledTimes(1)
		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the turn does not complete", async () => {
		await runAClosingMission()

		await harness.endTurn({ outcome: "failed" })

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the run is refused", async () => {
		await runAClosingMission()

		await harness.emitAtRun({
			type: "permissionRequested",
			request: { id: "p-1", toolName: "Bash", title: "Run it", detail: null },
		})
		harness.stop()
		await settled()

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the session of the run fails", async () => {
		await runAClosingMission()

		await harness.emitAtRun({
			type: "failed",
			error: { kind: "crashed", code: 1, detail: null },
		})

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the run outlives its deadline", async () => {
		await runAClosingMission()

		await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS)

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the session cannot open", async () => {
		await restart({ firstStartFails: true })

		await runAClosingMission()

		expect(harness.originStarts()).toEqual([])
		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim once when the prompt cannot be submitted", async () => {
		vi.spyOn(harness.driver, "submitPrompt").mockRejectedValue(
			new Error("the agent went away"),
		)

		await runAClosingMission()

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases the claim of a live run once when it stops", async () => {
		await runAClosingMission()

		harness.stop()
		harness.stop()
		await settled()

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("releases a claim whose session opens after it stopped and submits nothing", async () => {
		const opening = Promise.withResolvers<void>()
		const open = harness.store.openRuntimeSession
		vi.spyOn(harness.store, "openRuntimeSession").mockImplementation(
			async (...opened) => {
				await opening.promise
				return open(...opened)
			},
		)
		await runAClosingMission()

		harness.stop()
		opening.resolve()
		await settled()

		expect(harness.driver.submissions).toEqual([])
		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})

	it("claims the mission again once the run that held it has settled", async () => {
		await runAClosingMission()
		await harness.endTurn(reported("The walls stand."))

		await harness.enter("failed", failedBy("agent-hook"))

		expect(harness.missions.claims).toEqual([
			harness.mission.id,
			harness.mission.id,
		])
		expect(harness.originStarts()).toHaveLength(2)
	})

	it("claims every unreported mission it catches up on before running it", async () => {
		await restart({ open: "done", openEvents: closedBy("poller") })

		expect(harness.missions.claims).toEqual([harness.mission.id])
		expect(harness.originStarts()).toHaveLength(1)
	})

	it("runs no unreported mission it catches up on while another window runs it", async () => {
		await restart({
			open: "done",
			openEvents: closedBy("poller"),
			claimedElsewhere: true,
		})

		expect(harness.originStarts()).toEqual([])
		expect(harness.missions.reports).toEqual([])
	})

	it("logs a release that fails and raises nothing", async () => {
		harness.missions.refuseRelease()
		await runAClosingMission()

		await harness.endTurn(reported("The walls stand."))

		expect(await failuresRaisedBy(harness)).not.toHaveBeenCalled()
		expect(consoleLines()).toEqual([
			"mission run driver: mission_run_release failed",
		])
		expect(spoken(harness.originTail())).not.toEqual([])
	})

	const claimsOfTheMission = () => harness.missions.claims.length

	it("claims a change kept during the run again only once the host answered its release", async () => {
		await runAClosingMission()
		await harness.enter("failed", failedBy("agent-hook"))
		harness.missions.stallRelease()

		await harness.endTurn(reported("The walls stand."))

		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
		expect(claimsOfTheMission()).toBe(1)

		harness.missions.answerRelease()
		await settled()

		expect(claimsOfTheMission()).toBe(2)
		expect(harness.originStarts()).toHaveLength(2)
	})

	it("claims a change kept during a refused run again only once the host answered its release", async () => {
		await runAClosingMission()
		await harness.enter("failed", failedBy("agent-hook"))
		harness.missions.stallRelease()

		await harness.emitAtRun({
			type: "permissionRequested",
			request: { id: "p-1", toolName: "Bash", title: "Run it", detail: null },
		})

		expect(claimsOfTheMission()).toBe(1)

		harness.missions.answerRelease()
		await settled()

		expect(claimsOfTheMission()).toBe(2)
		expect(harness.originStarts()).toHaveLength(2)
	})

	it("holds a change announced while its release is in flight until the host answers", async () => {
		await runAClosingMission()
		harness.missions.stallRelease()
		await harness.endTurn(reported("The walls stand."))

		await harness.enter("failed", failedBy("agent-hook"))

		expect(claimsOfTheMission()).toBe(1)

		harness.missions.answerRelease()
		await settled()

		expect(claimsOfTheMission()).toBe(2)
		expect(harness.originStarts()).toHaveLength(2)
	})

	it("holds a change announced while the release of a start that failed is in flight", async () => {
		await restart({ firstStartFails: true })
		harness.missions.stallRelease()
		await runAClosingMission()

		await harness.announce("done")

		expect(claimsOfTheMission()).toBe(1)

		harness.missions.answerRelease()
		await settled()

		expect(claimsOfTheMission()).toBe(2)
		expect(harness.originStarts()).toHaveLength(1)
	})

	it("takes a change kept during the run again when its release fails", async () => {
		harness.missions.refuseRelease()
		await runAClosingMission()
		await harness.enter("failed", failedBy("agent-hook"))

		await harness.endTurn(reported("The walls stand."))

		expect(claimsOfTheMission()).toBe(2)
		expect(harness.missions.releases).toEqual([FIRST_TOKEN])
	})
})
