import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MissionChanged, MissionDetail } from "./mission-contract"
import {
	MISSION_CHANGED_EVENT,
	missionRunTransport,
	missionsTransport,
} from "./missions-transport"

import { joinedHosts } from "../host"
import { agentTransport } from "../agent/transport"
import { conversationStore } from "../conversations/store-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

const DETAIL: MissionDetail = {
	mission: {
		id: "m-1",
		originConversationId: "c-1",
		spaceId: null,
		botId: "b-1",
		threadConversationId: "c-2",
		objective: "Ship the mission thread.",
		ticket: {
			platform: "linear",
			externalId: "OPE-30",
			url: "https://example.com/OPE-30",
			title: "Mission thread screen",
		},
		tools: ["Repository"],
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
	},
	events: [],
}

beforeEach(() => {
	hostInvoke.mockReset()
	hostListen.mockReset()
})

it("reads one mission and its events from the host", async () => {
	hostInvoke.mockResolvedValueOnce(DETAIL)

	await expect(missionsTransport.detail("m-1")).resolves.toEqual(DETAIL)

	expect(hostInvoke).toHaveBeenCalledWith("mission_detail", {
		missionId: "m-1",
	})
})

it("closes a mission as the person", async () => {
	hostInvoke.mockResolvedValueOnce(DETAIL.mission)

	await missionsTransport.close("m-1")

	expect(hostInvoke).toHaveBeenCalledWith("mission_close", {
		missionId: "m-1",
	})
})

it("answers a close with the mission the host wrote", async () => {
	const closed = { ...DETAIL.mission, state: "closed" as const, closedAt: 2 }
	hostInvoke.mockResolvedValueOnce(closed)

	await expect(missionsTransport.close("m-1")).resolves.toEqual(closed)
})

it("reopens a mission through the host", async () => {
	const reopened = { ...DETAIL.mission, closedAt: null }
	hostInvoke.mockResolvedValueOnce(reopened)

	await expect(missionsTransport.reopen("m-1")).resolves.toEqual(reopened)

	expect(hostInvoke).toHaveBeenCalledWith("mission_reopen", {
		missionId: "m-1",
	})
})

it("reads the open and the done missions of a conversation", async () => {
	hostInvoke.mockResolvedValueOnce({ open: [], done: [] })

	await missionsTransport.list("c-1")

	expect(hostInvoke).toHaveBeenCalledWith("mission_list", {
		conversationId: "c-1",
	})
})

it("reads the roster block of a conversation for a companion", async () => {
	hostInvoke.mockResolvedValueOnce("The room holds @ada.")

	await expect(missionsTransport.rosterBlock("c-1", "b-1")).resolves.toBe(
		"The room holds @ada.",
	)

	expect(hostInvoke).toHaveBeenCalledWith("conversation_roster_block", {
		conversationId: "c-1",
		botId: "b-1",
	})
})

it("hands every mission change to its listener with the local host id", async () => {
	const heard: [MissionChanged, string | null | undefined][] = []
	hostListen.mockResolvedValueOnce(() => undefined)

	await missionsTransport.onChanged((changed, hostId) =>
		heard.push([changed, hostId]),
	)

	const [event, handler] = hostListen.mock.calls[0] ?? []
	expect(event).toBe(MISSION_CHANGED_EVENT)

	handler?.({
		event: MISSION_CHANGED_EVENT,
		id: 1,
		payload: { missionId: "m-1", state: "waiting_human" },
	})

	expect(heard).toEqual([[{ missionId: "m-1", state: "waiting_human" }, null]])
})

describe("the mission calls of the run driver while a joined space is active", () => {
	const JOINED_SPACE = "garage"

	const joinedHost = vi.fn(
		async (_input: URL | string) =>
			new Response("null", { headers: { "content-type": "application/json" } }),
	)

	const unopenedSocket = class {
		onopen = null
		onmessage = null
		onclose = null
		close = () => undefined
	}

	const answerAsThisComputer = async (command: string) =>
		command === "joined_space_connect"
			? {
					id: JOINED_SPACE,
					hostUrl: "http://192.168.1.30:45367",
					token: "joined",
					remoteSpaceId: null,
					name: JOINED_SPACE,
				}
			: null

	const commandsSentToTheJoinedHost = () =>
		joinedHost.mock.calls.map(([input]) => String(input).split("/").at(-1))

	const commandsSentToThisComputer = () =>
		hostInvoke.mock.calls.map(([command]) => command)

	beforeEach(async () => {
		vi.stubGlobal("fetch", joinedHost)
		vi.stubGlobal("WebSocket", unopenedSocket)
		hostInvoke.mockImplementation(answerAsThisComputer as typeof invoke)
		await joinedHosts.activate(JOINED_SPACE)
		hostInvoke.mockClear()
	})

	afterEach(async () => {
		await joinedHosts.activate(null)
		joinedHosts.forget(JOINED_SPACE)
		joinedHost.mockClear()
		vi.unstubAllGlobals()
	})

	it("reads a mission of the screens from the joined host", async () => {
		await missionsTransport.detail("m-1")

		expect(commandsSentToTheJoinedHost()).toEqual(["mission_detail"])
	})

	it("reads a changed mission of a local Space on this computer", async () => {
		await missionsTransport.read({ missionId: "m-1", spaceId: "workshop" })

		expect(commandsSentToTheJoinedHost()).toEqual([])
		expect(hostInvoke).toHaveBeenCalledWith("mission_detail", {
			missionId: "m-1",
		})
	})

	it("reads a changed mission of the joined Space on its host", async () => {
		await missionsTransport.read({ missionId: "m-1", spaceId: JOINED_SPACE })

		expect(commandsSentToTheJoinedHost()).toEqual(["mission_detail"])
		expect(commandsSentToThisComputer()).toEqual([])
	})

	it("reads a changed mission of the joined Space on its host once a local Space is on screen", async () => {
		await joinedHosts.activate(null)

		await missionsTransport.read({ missionId: "m-1", spaceId: JOINED_SPACE })

		expect(commandsSentToTheJoinedHost()).toEqual(["mission_detail"])
		expect(commandsSentToThisComputer()).toEqual([])
	})

	it("sends every mission call of the run driver to this computer", async () => {
		await missionRunTransport.board()
		await missionRunTransport.unreported()
		await missionRunTransport.detail("m-1")
		await missionRunTransport.read({ missionId: "m-1", spaceId: "workshop" })
		await missionRunTransport.reported("m-1", "t-1")
		await missionRunTransport.answered("m-1", 2)
		await missionRunTransport.rosterBlock("c-1", "b-1")
		await missionRunTransport.bots()
		await missionRunTransport.mainChat("b-1")

		expect(commandsSentToTheJoinedHost()).toEqual([])
		expect(commandsSentToThisComputer()).toEqual([
			"mission_board",
			"mission_unreported",
			"mission_detail",
			"mission_detail",
			"mission_reported",
			"mission_answered",
			"conversation_roster_block",
			"conversation_bots",
			"conversation_main_chat",
		])
	})

	it("reads the companions and the main chat of the run driver on this computer whatever space is active", async () => {
		await missionRunTransport.bots()
		await missionRunTransport.mainChat("b-1")

		expect(hostInvoke).toHaveBeenCalledWith("conversation_bots", {
			spaceId: null,
		})
		expect(hostInvoke).toHaveBeenCalledWith("conversation_main_chat", {
			botId: "b-1",
			spaceId: null,
		})
	})

	describe("a mission of this computer opened after the local ids were recalled", () => {
		const RECALLED = "c-recalled"
		const ORIGIN = "c-origin-opened-later"
		const THREAD = "c-thread-opened-later"
		const UNSEEN_BOT = "b-never-answered"

		const OPENED_LATER: MissionDetail = {
			mission: {
				...DETAIL.mission,
				id: "m-2",
				botId: UNSEEN_BOT,
				originConversationId: ORIGIN,
				threadConversationId: THREAD,
			},
			events: [],
		}

		const answerAfterTheRecall = async (command: string) => {
			if (command === "conversation_local_ids") {
				return [RECALLED]
			}
			if (command === "mission_detail") {
				return OPENED_LATER
			}
			return answerAsThisComputer(command)
		}

		const REPORT_WRITES = [
			"conversation_start_turn",
			"conversation_open_assistant_message",
			"conversation_append_text",
			"conversation_finalize_message",
			"conversation_complete_turn",
		]

		const writeReportIn = async (
			conversationId: string,
			turnId: string,
			messageId: string,
		) => {
			await conversationStore.startTurn({
				id: turnId,
				conversationId,
				startedAt: 1,
			})
			await conversationStore.openAssistantMessage({
				id: messageId,
				conversationId,
				turnId,
				authorBotId: UNSEEN_BOT,
				repliedToMessageId: null,
				createdAt: 1,
			})
			await conversationStore.appendText(messageId, "The walls stand.")
			await conversationStore.finalizeMessage(messageId, "complete")
			await conversationStore.completeTurn(turnId, 2)
		}

		const runTheMissionOf = async () => {
			await conversationStore.loadPage(THREAD, null)
			await conversationStore.openRuntimeSession(
				ORIGIN,
				UNSEEN_BOT,
				1,
				null,
				null,
			)
			await agentTransport.startOrResumeSession({
				conversationId: ORIGIN,
				botId: UNSEEN_BOT,
				runtimeSessionId: "r-1",
				epoch: 1,
			})
			await writeReportIn(ORIGIN, "t-1", "msg-1")
		}

		beforeEach(async () => {
			hostInvoke.mockImplementation(answerAfterTheRecall as typeof invoke)
			await conversationStore.loadPage(RECALLED, null)
			hostInvoke.mockClear()
		})

		it("opens its thread, its session and writes its report on this computer", async () => {
			await missionRunTransport.detail("m-2")

			await runTheMissionOf()

			expect(commandsSentToTheJoinedHost()).toEqual([])
			expect(commandsSentToThisComputer()).toEqual([
				"mission_detail",
				"conversation_message_page",
				"conversation_open_runtime_session",
				"agent_start_or_resume_session",
				...REPORT_WRITES,
			])
		})

		it("keeps the report writes of a turn opened on the joined host on the joined host", async () => {
			await writeReportIn("c-of-the-joined-space", "t-joined", "msg-joined")

			expect(commandsSentToThisComputer()).toEqual([])
			expect(commandsSentToTheJoinedHost()).toEqual(REPORT_WRITES)
		})

		it("keeps a conversation of the joined space on the joined host", async () => {
			await missionRunTransport.detail("m-2")

			await conversationStore.loadPage("c-of-the-joined-space", null)

			expect(commandsSentToTheJoinedHost()).toEqual([
				"conversation_message_page",
			])
		})
	})
})
