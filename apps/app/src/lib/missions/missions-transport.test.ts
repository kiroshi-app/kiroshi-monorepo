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

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostInvoke = vi.mocked(invoke)
const hostListen = vi.mocked(listen)

const DETAIL: MissionDetail = {
	mission: {
		id: "m-1",
		originConversationId: "c-1",
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

it("hands every mission change to its listener", async () => {
	const heard: MissionChanged[] = []
	hostListen.mockResolvedValueOnce(() => undefined)

	await missionsTransport.onChanged((changed) => heard.push(changed))

	const [event, handler] = hostListen.mock.calls[0] ?? []
	expect(event).toBe(MISSION_CHANGED_EVENT)

	handler?.({
		event: MISSION_CHANGED_EVENT,
		id: 1,
		payload: { missionId: "m-1", state: "waiting_human" },
	})

	expect(heard).toEqual([{ missionId: "m-1", state: "waiting_human" }])
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

	it("sends every mission call of the run driver to this computer", async () => {
		await missionRunTransport.board()
		await missionRunTransport.unreported()
		await missionRunTransport.detail("m-1")
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
})
