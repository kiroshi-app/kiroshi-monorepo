import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createConversationController } from "./conversation-controller"
import { readConversation } from "./read-conversation"
import { createScriptedDriver } from "./scripted-driver"
import { conversationStore } from "./store-transport"
import { botIdentity } from "./transcript-fixtures"

import type { Conversation } from "../bindings"
import { createChatController } from "../chat/chat-controller"
import type { HostSocket } from "../host/http"
import type { ReportedRunsReader } from "../routines/run-port"

const HOST = "http://192.168.1.20:45367"
const JOINED_ID = "garage"
const HOST_SPACE_ID = "space-on-host"
const GUEST_SPACE_ID = "space-of-the-guest"

type Call = [command: string, args: unknown]

const wire = vi.hoisted(() => {
	const pageRead = { answered: Promise.withResolvers<void>() }
	const answerTo = async (command: string, args: unknown) => {
		if (command === "conversation_main_chat") {
			return { id: "chat" }
		}
		if (command !== "conversation_message_page") {
			return []
		}
		await pageRead.answered.promise
		const { conversationId } = args as { conversationId: string }
		return { conversationId, messages: [], arrivals: [], hasMore: false }
	}
	return {
		localCalls: [] as [string, unknown][],
		hostCalls: [] as [string, unknown][],
		pageRead,
		answerTo,
	}
})

vi.mock("../host", async () => {
	const { createJoinedHosts } = await import("../host/joined-hosts")
	const joinedHosts = createJoinedHosts({
		local: {
			invoke: (async (command: string, args: unknown) => {
				wire.localCalls.push([command, args])
				return command === "space_list"
					? [{ id: GUEST_SPACE_ID }]
					: wire.answerTo(command, args)
			}) as never,
			listen: async () => () => undefined,
			fileSrc: (path) => path,
		},
		join: async (id) => ({
			status: "ok",
			data: {
				id,
				hostUrl: HOST,
				token: "joined",
				remoteSpaceId: HOST_SPACE_ID,
				name: id,
			},
		}),
		fetch: async (input, init) => {
			const command = decodeURIComponent(String(input).split("/").pop() ?? "")
			const args = JSON.parse(String(init?.body))
			wire.hostCalls.push([command, args])
			return new Response(JSON.stringify(await wire.answerTo(command, args)), {
				headers: { "content-type": "application/json" },
			})
		},
		openSocket: () =>
			({
				onopen: null,
				onmessage: null,
				onclose: null,
				close: () => undefined,
			}) satisfies HostSocket,
		reportFailure: () => undefined,
	})
	return {
		joinedHosts,
		invoke: joinedHosts.invoke,
		listen: joinedHosts.listen,
		activeJoinedSpaceId: joinedHosts.activeSpaceId,
	}
})

const { joinedHosts } = await import("../host")

const callsOf = (calls: Call[], command: string) =>
	calls.filter(([sent]) => sent === command).map(([, args]) => args)

describe("store calls on a guest of a shared space", () => {
	beforeEach(async () => {
		wire.localCalls.length = 0
		wire.hostCalls.length = 0
		await joinedHosts.activate(JOINED_ID)
	})

	afterEach(() => {
		joinedHosts.forget(JOINED_ID)
	})

	it("reads the companions of the host space", async () => {
		await conversationStore.bots()

		expect(callsOf(wire.hostCalls, "conversation_bots")).toEqual([
			{ spaceId: HOST_SPACE_ID },
		])
	})

	it("reads the main chat of the host space", async () => {
		await conversationStore.mainChat("b-1")

		expect(callsOf(wire.hostCalls, "conversation_main_chat")).toEqual([
			{ botId: "b-1", spaceId: HOST_SPACE_ID },
		])
	})

	it("moves a companion between sections of the host space", async () => {
		await conversationStore.moveBotToSection("b-1", "n-1")

		expect(callsOf(wire.hostCalls, "bot_move_to_section")).toEqual([
			{ botId: "b-1", sectionId: "n-1", spaceId: HOST_SPACE_ID },
		])
	})

	it("creates a companion in the host space", async () => {
		const identity = botIdentity({ name: "Ada" })

		await conversationStore.createBot(identity, null)

		expect(callsOf(wire.hostCalls, "conversation_create_bot")).toEqual([
			{ identity, spaceId: HOST_SPACE_ID },
		])
	})

	it("duplicates a companion into the host space", async () => {
		await conversationStore.duplicateBot("b-1")

		expect(callsOf(wire.hostCalls, "conversation_duplicate_bot")).toEqual([
			{ botId: "b-1", spaceId: HOST_SPACE_ID },
		])
	})

	it("reads a conversation in the host space and never in a local one", async () => {
		await readConversation(conversationStore, "c-1")

		expect(callsOf(wire.localCalls, "space_list")).toEqual([])
		expect(callsOf(wire.hostCalls, "conversation_list")).toEqual([
			{ spaceId: HOST_SPACE_ID },
		])
	})
})

describe("store calls with no joined space", () => {
	beforeEach(async () => {
		wire.localCalls.length = 0
		await joinedHosts.activate(null)
	})

	it("sends the space arguments as before", async () => {
		await conversationStore.bots()
		await conversationStore.mainChat("b-1")
		await conversationStore.moveBotToSection("b-1", null)
		await readConversation(conversationStore, "c-1")

		expect(wire.localCalls).toEqual([
			["conversation_bots", { spaceId: null }],
			["conversation_main_chat", { botId: "b-1", spaceId: null }],
			["bot_move_to_section", { botId: "b-1", sectionId: null }],
			["space_list", undefined],
			["conversation_list", { spaceId: GUEST_SPACE_ID }],
		])
	})
})

const GROUP: Conversation = {
	id: "c-1",
	spaceId: GUEST_SPACE_ID,
	sectionId: null,
	pinPosition: null,
	title: "Walls",
	instructions: "",
	icon: null,
	color: null,
	createdAt: 0,
	updatedAt: 0,
	participants: [],
}

const NO_REPORTED_RUNS: ReportedRunsReader = () => Promise.resolve([])

const NO_LIVE_EVENTS = () => Promise.resolve(() => undefined)

const NO_RECONNECTIONS = () => () => undefined

const pageAsked = (conversationId: string) =>
	vi.waitFor(() => {
		const asked = [...wire.localCalls, ...wire.hostCalls].some(
			([command, args]) =>
				command === "conversation_message_page" &&
				(args as { conversationId: string }).conversationId === conversationId,
		)
		if (!asked) {
			throw new Error(`no page of ${conversationId} was asked`)
		}
	})

const openGroupThread = () => {
	const controller = createConversationController(
		createScriptedDriver(),
		conversationStore,
		{
			readReportedRuns: NO_REPORTED_RUNS,
			onCompanionArrived: NO_LIVE_EVENTS,
			onMessageStored: NO_LIVE_EVENTS,
			onReconnected: NO_RECONNECTIONS,
		},
	)
	const opened = controller.open(GROUP)
	return { controller, opened }
}

const openSoloThread = () => {
	const controller = createChatController(
		createScriptedDriver(),
		conversationStore,
		{
			readReportedRuns: NO_REPORTED_RUNS,
			onMessageStored: NO_LIVE_EVENTS,
			onReconnected: NO_RECONNECTIONS,
		},
	)
	void controller.open("b-1", null)
	return controller
}

describe.each([
	{ path: "the local store", joinedSpaceId: null },
	{ path: "the joined host", joinedSpaceId: JOINED_ID },
])("the first page of a thread read through $path", ({ joinedSpaceId }) => {
	beforeEach(async () => {
		wire.localCalls.length = 0
		wire.hostCalls.length = 0
		wire.pageRead.answered = Promise.withResolvers<void>()
		await joinedHosts.activate(joinedSpaceId)
	})

	afterEach(() => {
		wire.pageRead.answered.resolve()
		joinedHosts.forget(JOINED_ID)
	})

	it("holds a group thread in its first load until the page answers", async () => {
		const { controller, opened } = openGroupThread()
		await pageAsked("c-1")

		expect(controller.getState().isFirstLoadPending).toBe(true)

		wire.pageRead.answered.resolve()
		await opened

		expect(controller.getState().isFirstLoadPending).toBe(false)
	})

	it("holds a solo bot thread in its first load until the page answers", async () => {
		const controller = openSoloThread()
		await pageAsked("chat")

		expect(controller.stateFor("b-1").isFirstLoadPending).toBe(true)

		wire.pageRead.answered.resolve()

		await vi.waitFor(() => {
			expect(controller.stateFor("b-1").isFirstLoadPending).toBe(false)
		})
	})
})
