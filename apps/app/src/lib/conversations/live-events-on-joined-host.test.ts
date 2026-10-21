// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	onTestFinished,
	vi,
} from "vitest"

import {
	type ConversationController,
	type ConversationControllerOptions,
	createConversationController,
} from "./conversation-controller"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { FOREIGN_SPEAKER_SILENCE_MS } from "./foreign-turns"
import { createScriptedDriver } from "./scripted-driver"
import type { Conversation, ConversationInPage } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import type { TranscriptMessage } from "./transcript-contract"
import { message, seatBots } from "./transcript-fixtures"

import { JOINED_SPACE_RECONNECTED_EVENT } from "../bindings"
import { useControllerState } from "../use-controller"
import type {
	AgentEvent,
	CancelOutcome,
	EventTurn,
	PermissionRequest,
	QuestionAnswers,
	QuestionRequest,
	RuntimeScope,
	ScopedEvent,
} from "../agent/contract"
import { agentTransport } from "../agent/transport"
import {
	createRosterController,
	type RosterSpace,
} from "../bots/roster-controller"
import { useRosterReads } from "../bots/use-roster"
import {
	type ChatControllerOptions,
	createChatController,
} from "../chat/chat-controller"
import {
	questionMessageIdOf,
	questionMessageText,
} from "../chat/question-message"
import {
	sidebarActivityFor,
	toRuns,
	toTranscriptRows,
} from "../chat/screen-model"
import { useAskedQuestion } from "../chat/use-asked-question"
import type { HostSocket } from "../host/http"
import { aMission } from "../missions/mission-fixtures"
import { useLiveMissions } from "../missions/use-live-missions"
import { invalidateOnHostReconnect } from "../query/host-invalidations"
import { createQueryTestWrapper } from "../query/query-test-wrapper"
import { joinedRowIdOf } from "../spaces/joined-spaces-controller"

type Handler = (event: { event: string; id: number; payload: unknown }) => void

const PENDING_QUESTIONS = "agent_pending_questions"

const wire = vi.hoisted(() => ({
	sockets: [] as HostSocket[],
	local: new Map<string, Set<Handler>>(),
	pendingQuestions: (): Promise<unknown> => Promise.resolve([]),
}))

const asJson = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})

const answerOnHost = (input: RequestInfo | URL) =>
	String(input).endsWith(PENDING_QUESTIONS)
		? wire.pendingQuestions().then(asJson, (reason) => asJson(reason, 500))
		: Promise.resolve(asJson(null))

vi.mock("../host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../host")>()
	const { createJoinedHosts } = await import("../host/joined-hosts")
	const joinedHosts = createJoinedHosts({
		local: {
			invoke: (async (command: string) =>
				command === PENDING_QUESTIONS
					? wire.pendingQuestions()
					: null) as never,
			listen: async (event, handler) => {
				const heard = wire.local.get(event) ?? new Set<Handler>()
				heard.add(handler as Handler)
				wire.local.set(event, heard)
				return () => {
					heard.delete(handler as Handler)
				}
			},
			fileSrc: (path) => path,
		},
		join: async (id) => ({
			status: "ok",
			data: {
				id,
				hostUrl: "http://192.168.1.20:45367",
				token: "joined",
				remoteSpaceId: null,
				name: id,
			},
		}),
		fetch: (input) => answerOnHost(input),
		openSocket: () => {
			const socket: HostSocket = {
				onopen: null,
				onmessage: null,
				onclose: null,
				close: () => undefined,
			}
			wire.sockets.push(socket)
			return socket
		},
		reportFailure: () => undefined,
	})
	return {
		...actual,
		joinedHosts,
		invoke: joinedHosts.invoke,
		listen: joinedHosts.listen,
		listenToActiveHost: joinedHosts.listenToActiveHost,
		activeJoinedSpaceId: joinedHosts.activeSpaceId,
		onHostReconnected: joinedHosts.onReconnected,
		drivesRealHost: () => true,
	}
})

const { joinedHosts } = await import("../host")

const JOINED = "garage"

const BOT = "default"

const MEMBER = "member-account"

const settled = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const emitLocally = (event: string, payload: unknown) =>
	act(async () => {
		for (const handler of [...(wire.local.get(event) ?? [])]) {
			handler({ event, id: 0, payload })
		}
	})

const lastSocket = () => wire.sockets[wire.sockets.length - 1]

const emitOnHost = (event: string, payload: unknown) =>
	act(async () => {
		const socket = lastSocket()
		socket?.onmessage?.call(
			socket as WebSocket,
			new MessageEvent("message", { data: JSON.stringify({ event, payload }) }),
		)
	})

const openLastSocket = () =>
	act(async () => {
		const socket = lastSocket()
		socket?.onopen?.call(socket as WebSocket, new Event("open"))
	})

const dropLastSocket = () => {
	vi.useFakeTimers()
	const socket = lastSocket()
	socket?.onclose?.call(socket as WebSocket, new Event("close") as CloseEvent)
	vi.runOnlyPendingTimers()
	vi.useRealTimers()
}

const joinHost = async () => {
	await act(() => joinedHosts.activate(JOINED))
	await openLastSocket()
}

const reconnectHost = async () => {
	dropLastSocket()
	await openLastSocket()
	await settled()
}

const reopenRelay = async (id: string) => {
	await emitLocally(JOINED_SPACE_RECONNECTED_EVENT, { id })
	await settled()
}

const foreignScope = (conversationId: string): RuntimeScope => ({
	conversationId,
	botId: BOT,
	runtimeSessionId: "run-of-another-window",
	epoch: 1,
})

const storedTurn = (conversationId: string): EventTurn => ({
	turnId: "turn-of-another-window",
	conversationId,
})

const streamed = (id: string, text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: {
			id,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "messageDelta", id, seq: 1, text },
]

const TURN_ENDED: AgentEvent = {
	type: "turnEnded",
	ended: { sessionId: null, outcome: "completed" },
}

const writtenElsewhere = async (
	store: TranscriptStore,
	conversationId: string,
	content: string,
): Promise<TranscriptMessage> => {
	const written = message({
		id: `written-${content}`,
		conversationId,
		turnId: `turn-${content}`,
		role: "user",
		content,
		createdAt: 5,
	})
	await store.appendUserMessage(written)
	return written
}

type StoredReply = {
	conversationId: string
	botId: string
	replyId: string
	text: string
}

const repliedElsewhere = async (
	store: TranscriptStore,
	{ conversationId, botId, replyId, text }: StoredReply,
): Promise<TranscriptMessage> => {
	const prompt = await writtenElsewhere(
		store,
		conversationId,
		"Asked elsewhere",
	)
	await store.openAssistantMessage({
		id: replyId,
		conversationId,
		turnId: prompt.turnId,
		authorBotId: botId,
		repliedToMessageId: prompt.id,
		createdAt: 6,
	})
	await store.appendText(replyId, text)
	await store.finalizeMessage(replyId, "complete")
	return prompt
}

type Shown = {
	messages: { role: string; content: string; completion: string }[]
}

const contentsOf = ({ messages }: Shown) =>
	messages.map(({ content }) => content)

const assistantRowsOf = ({ messages }: Shown) =>
	messages.filter(({ role }) => role === "assistant")

const liveDriver = (store: TranscriptStore) => {
	const scripted = createScriptedDriver()
	return {
		scripted,
		driver: withFakeHostWrites(
			{
				...scripted,
				subscribe: agentTransport.subscribe,
				pendingQuestions: agentTransport.pendingQuestions,
			},
			store,
		),
	}
}

type Opening = {
	store: TranscriptStore
	driver: ReturnType<typeof liveDriver>["driver"]
	conversationId: string
	botId: string
}

type Prepare = (opening: Opening) => Promise<void>

const NOTHING_TO_PREPARE: Prepare = async () => undefined

const openSoloChat = async (
	prepare = NOTHING_TO_PREPARE,
	options: ChatControllerOptions = {},
) => {
	const store = createFakeTranscriptStore()
	const { scripted, driver } = liveDriver(store)
	const controller = createChatController(driver, store, {
		senderAccountId: () => MEMBER,
		...options,
	})
	const detach = controller.attach()
	const chat = await store.mainChat(BOT, null)
	await prepare({ store, driver, conversationId: chat.id, botId: BOT })
	await act(() => controller.open(BOT, null).then(() => undefined))
	await settled()
	const conversationId = controller.getState().conversationId ?? ""
	return {
		store,
		scripted,
		driver,
		controller,
		detach,
		botId: BOT,
		conversationId,
	}
}

const openRoom = async (
	prepare = NOTHING_TO_PREPARE,
	options: ConversationControllerOptions = {},
) => {
	const store = createFakeTranscriptStore()
	const { scripted, driver } = liveDriver(store)
	const [bot] = await seatBots(store, "personal", ["Ada"])
	const conversation = await store.createConversation({
		spaceId: "personal",
		sectionId: null,
		title: "Walls",
		botIds: [bot?.id ?? ""],
	})
	const botId = bot?.id ?? ""
	const controller = createConversationController(driver, store, {
		senderAccountId: () => MEMBER,
		...options,
	})
	const detach = controller.attach()
	await prepare({ store, driver, conversationId: conversation.id, botId })
	await act(() => controller.open(conversation))
	await settled()
	return {
		store,
		scripted,
		driver,
		controller,
		detach,
		botId,
		conversation,
		conversationId: conversation.id,
	}
}

beforeEach(async () => {
	await joinedHosts.activate(null)
	wire.sockets.length = 0
	wire.pendingQuestions = () => Promise.resolve([])
})

afterEach(() => {
	cleanup()
	joinedHosts.forget(JOINED)
})

describe("a solo conversation fed by every writer", () => {
	it("renders live a turn another window started", async () => {
		const { controller, detach, conversationId } = await openSoloChat()
		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)

		for (const event of streamed("elsewhere-1", "Hello from elsewhere")) {
			await emitLocally("agent://event", { scope, turn, event })
		}

		expect(assistantRowsOf(controller.getState())).toMatchObject([
			{ content: "Hello from elsewhere", completion: "streaming" },
		])

		await emitLocally("agent://event", { scope, turn, event: TURN_ENDED })

		expect(assistantRowsOf(controller.getState())).toMatchObject([
			{ content: "Hello from elsewhere", completion: "complete" },
		])
		detach()
	})

	it("reloads the page when a message is stored in the open conversation", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		const stored = await writtenElsewhere(store, conversationId, "From a guest")

		await emitLocally("conversation://message-stored", stored)
		await settled()

		expect(contentsOf(controller.getState())).toContain("From a guest")
		detach()
	})

	it("takes the events from the joined host while a joined space is active", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		await joinHost()
		const stored = await writtenElsewhere(store, conversationId, "Host echo")

		await emitOnHost("conversation://message-stored", stored)
		await settled()

		expect(contentsOf(controller.getState())).toContain("Host echo")

		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)
		for (const event of streamed("hosted-1", "Typed on the host")) {
			await emitOnHost("agent://event", { scope, turn, event })
		}

		expect(contentsOf(controller.getState())).toContain("Typed on the host")
		detach()
	})

	it("reloads the transcript when the joined host comes back up", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Missed while down")

		await reconnectHost()

		expect(contentsOf(controller.getState())).toContain("Missed while down")
		detach()
	})

	it("reloads the transcript when the relay of the joined Space reopens", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Missed during the cut")

		await reopenRelay(JOINED)

		expect(contentsOf(controller.getState())).toContain("Missed during the cut")
		detach()
	})

	it("reads the transcript nothing more when the relay of another Space reopens", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Held by another Space")

		await reopenRelay("attic")

		expect(contentsOf(controller.getState())).not.toContain(
			"Held by another Space",
		)
		detach()
	})

	it("reads the transcript nothing more once it is detached", async () => {
		const { store, controller, detach, conversationId } = await openSoloChat()
		await joinHost()
		detach()
		await writtenElsewhere(store, conversationId, "After the screen left")

		await reopenRelay(JOINED)

		expect(contentsOf(controller.getState())).not.toContain(
			"After the screen left",
		)
	})

	it("keeps a turn started in this window rendered once", async () => {
		const { scripted, controller, detach, conversationId } =
			await openSoloChat()
		await act(() => controller.send("Hi"))
		await settled()
		const scope = scripted.submissions.at(-1)?.scope

		for (const event of [...streamed("mine-1", "Mine"), TURN_ENDED]) {
			await emitLocally("agent://event", { scope, event })
		}
		await settled()
		const prompt = controller
			.getState()
			.messages.find(({ role }) => role === "user")
		await emitLocally("conversation://message-stored", {
			...prompt,
			conversationId,
		})
		await settled()

		expect(assistantRowsOf(controller.getState())).toMatchObject([
			{ content: "Mine" },
		])
		expect(
			contentsOf(controller.getState()).filter((text) => text === "Hi"),
		).toHaveLength(1)
		detach()
	})
})

describe("a room fed by every writer", () => {
	it("renders live a turn another window started", async () => {
		const { controller, detach, botId, conversationId } = await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)

		for (const event of [...streamed("elsewhere-2", "Room echo"), TURN_ENDED]) {
			await emitLocally("agent://event", { scope, turn, event })
		}

		expect(assistantRowsOf(controller.getState())).toMatchObject([
			{ content: "Room echo", completion: "complete" },
		])
		detach()
	})

	it("reloads the page when a message is stored in the open room", async () => {
		const { store, controller, detach, conversationId } = await openRoom()
		const stored = await writtenElsewhere(store, conversationId, "Room guest")

		await emitLocally("conversation://message-stored", stored)
		await settled()

		expect(contentsOf(controller.getState())).toContain("Room guest")
		detach()
	})

	it("reloads the transcript when the joined host comes back up", async () => {
		const { store, controller, detach, conversationId } = await openRoom()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Room missed")

		await reconnectHost()

		expect(contentsOf(controller.getState())).toContain("Room missed")
		detach()
	})

	it("reloads the transcript when the relay of the joined Space reopens", async () => {
		const { store, controller, detach, conversationId } = await openRoom()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Missed during the cut")

		await reopenRelay(JOINED)

		expect(contentsOf(controller.getState())).toContain("Missed during the cut")
		detach()
	})

	it("reads the transcript nothing more when the relay of another Space reopens", async () => {
		const { store, controller, detach, conversationId } = await openRoom()
		await joinHost()
		await writtenElsewhere(store, conversationId, "Held by another Space")

		await reopenRelay("attic")

		expect(contentsOf(controller.getState())).not.toContain(
			"Held by another Space",
		)
		detach()
	})

	it("reads the transcript nothing more once it is detached", async () => {
		const { store, controller, detach, conversationId } = await openRoom()
		await joinHost()
		detach()
		await writtenElsewhere(store, conversationId, "After the screen left")

		await reopenRelay(JOINED)

		expect(contentsOf(controller.getState())).not.toContain(
			"After the screen left",
		)
	})

	it("keeps a turn started in this window rendered once", async () => {
		const { scripted, controller, detach, botId } = await openRoom()
		await act(() => controller.send("@Ada hi"))
		await settled()
		const scope = scripted.submissions.findLast(
			(submission) => submission.scope.botId === botId,
		)?.scope

		for (const event of [...streamed("mine-2", "Room mine"), TURN_ENDED]) {
			await emitLocally("agent://event", { scope, event })
		}
		await settled()

		expect(assistantRowsOf(controller.getState())).toMatchObject([
			{ content: "Room mine" },
		])
		detach()
	})
})

describe("the roster and the conversation list fed by every writer", () => {
	const REREADS = [
		["conversation://deleted", { spaceId: "personal", conversationId: "c" }],
		["companion://updated", { id: "b", bot: {} }],
		["companion://deleted", { id: "b", spaceId: "personal" }],
	] as const

	const PATCHES = ["conversation://created", "conversation://updated"] as const

	const LOCAL_ROSTER = { spaceRowId: "personal", spaceId: "personal" }

	const HOSTED_ROSTER = {
		spaceRowId: joinedRowIdOf(JOINED),
		spaceId: "personal",
	}

	const mountedRoster = async (space: RosterSpace = LOCAL_ROSTER) => {
		const store = createFakeTranscriptStore()
		const { queryClient, wrapper } = createQueryTestWrapper()
		onTestFinished(invalidateOnHostReconnect(queryClient))
		const roster = createRosterController(store, { queryClient })
		const rendered = renderHook(
			() => useRosterReads(roster, useControllerState(roster)),
			{ wrapper },
		)
		await roster.load({
			spaces: [space],
			spaceRowId: space.spaceRowId,
			lastRowId: null,
		})
		await settled()
		const reads = vi.spyOn(store, "conversationPage")
		const writeConversation = (title: string) =>
			store.createConversation({
				spaceId: "personal",
				sectionId: null,
				title,
				botIds: [BOT],
			})
		const titles = () =>
			(roster.getState().conversationRosters[space.spaceRowId] ?? []).map(
				({ title }) => title,
			)
		return { store, roster, rendered, reads, writeConversation, titles }
	}

	const storedRowTitled = async (store: TranscriptStore, title: string) => {
		const { conversations } = await store.conversationPage("personal", null, 30)
		const row = conversations.find(
			(conversation) => conversation.title === title,
		)
		return { spaceId: "personal", conversation: row }
	}

	it.each(REREADS)(
		"reads the roster again on a local %s",
		async (event, payload) => {
			const { reads } = await mountedRoster()

			await emitLocally(event, payload)

			await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce())
		},
	)

	it.each(PATCHES)(
		"writes a local %s into the roster without reading it",
		async (event) => {
			const { store, reads, writeConversation, titles } = await mountedRoster()
			await writeConversation("Written elsewhere")
			const stored = await storedRowTitled(store, "Written elsewhere")
			reads.mockClear()

			await emitLocally(event, stored)

			expect(titles()).toContain("Written elsewhere")
			expect(reads).not.toHaveBeenCalled()
		},
	)

	it.each(REREADS)(
		"reads the roster of the joined space again on %s from the joined host",
		async (event, payload) => {
			const { reads } = await mountedRoster(HOSTED_ROSTER)
			await joinHost()
			await settled()

			await emitOnHost(event, payload)
			await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce())
		},
	)

	it.each(PATCHES)(
		"writes %s from the joined host only into the roster of the joined space",
		async (event) => {
			const { store, reads, writeConversation, titles } =
				await mountedRoster(HOSTED_ROSTER)
			await joinHost()
			await settled()
			await writeConversation("Written elsewhere")
			const stored = await storedRowTitled(store, "Written elsewhere")
			reads.mockClear()

			await emitLocally(event, stored)
			await settled()
			expect(titles()).not.toContain("Written elsewhere")

			await emitOnHost(event, stored)
			await vi.waitFor(() => expect(titles()).toContain("Written elsewhere"))
			expect(reads).not.toHaveBeenCalled()
		},
	)

	it.each(PATCHES)(
		"writes %s from a joined host that is not the active one into its roster",
		async (event) => {
			const { store, reads, writeConversation, titles } =
				await mountedRoster(HOSTED_ROSTER)
			await act(() => joinedHosts.connect(JOINED))
			await openLastSocket()
			await writeConversation("Written elsewhere")
			const stored = await storedRowTitled(store, "Written elsewhere")
			reads.mockClear()

			await emitOnHost(event, stored)

			expect(joinedHosts.getState().active).toBeNull()
			await vi.waitFor(() => expect(titles()).toContain("Written elsewhere"))
			expect(reads).not.toHaveBeenCalled()
		},
	)

	it("reads the roster of the joined host again when it comes back up", async () => {
		const { reads } = await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()

		await reconnectHost()

		await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce())
	})

	it("reads nothing of a local roster when the joined host comes back up", async () => {
		const { reads } = await mountedRoster()
		await joinHost()
		await settled()

		await reconnectHost()
		await settled()

		expect(reads).not.toHaveBeenCalled()
	})

	it("lists a conversation written during the cut once the relay of the joined Space reopens", async () => {
		const { writeConversation, titles } = await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()
		await writeConversation("Opened during the cut")

		await reopenRelay(JOINED)

		await vi.waitFor(() => expect(titles()).toContain("Opened during the cut"))
	})

	it("lists nothing new when the relay of another Space reopens", async () => {
		const { writeConversation, titles } = await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()
		await writeConversation("Held by another Space")

		await reopenRelay("attic")
		await settled()

		expect(titles()).not.toContain("Held by another Space")
	})

	it("lists nothing new once the roster is gone", async () => {
		const { rendered, writeConversation, titles } =
			await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()
		rendered.unmount()
		await writeConversation("After the roster left")

		await reopenRelay(JOINED)
		await settled()

		expect(titles()).not.toContain("After the roster left")
	})

	it("reads the roster once when the relay reopens before the socket", async () => {
		const { reads } = await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()

		dropLastSocket()
		await reopenRelay(JOINED)
		await openLastSocket()
		await settled()

		await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce())
		await settled()
		expect(reads).toHaveBeenCalledOnce()
	})

	it("reads the roster twice when the socket reopens before the relay", async () => {
		const { reads } = await mountedRoster(HOSTED_ROSTER)
		await joinHost()
		await settled()

		await reconnectHost()
		await reopenRelay(JOINED)

		await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
		await settled()
		expect(reads).toHaveBeenCalledTimes(2)
	})
})

describe("a foreign reply the conversation then stores", () => {
	const openers = [
		["a solo conversation", openSoloChat],
		["a room", openRoom],
	] as const

	it.each(openers)(
		"shows the reply once in %s after the stored page is reloaded",
		async (_, open) => {
			const { store, controller, detach, botId, conversationId } = await open()
			const scope = { ...foreignScope(conversationId), botId }
			const turn = storedTurn(conversationId)
			for (const event of [...streamed("foreign-reply", "Echo"), TURN_ENDED]) {
				await emitLocally("agent://event", { scope, turn, event })
			}
			const prompt = await repliedElsewhere(store, {
				conversationId,
				botId,
				replyId: "foreign-reply",
				text: "Echo",
			})

			await emitLocally("conversation://message-stored", prompt)
			await settled()

			expect(assistantRowsOf(controller.getState())).toMatchObject([
				{ content: "Echo", completion: "complete" },
			])
			detach()
		},
	)
})

describe("a foreign event that names no stored turn of the shown conversation", () => {
	const openers = [
		["a solo conversation", openSoloChat],
		["a room", openRoom],
	] as const

	it.each(openers)(
		"renders nothing in %s from a mission run that stores no turn",
		async (_, open) => {
			const { controller, detach, botId, conversationId } = await open()
			const scope = { ...foreignScope(conversationId), botId }

			for (const event of [
				...streamed("mission-1", "Mission work"),
				TURN_ENDED,
			]) {
				await emitLocally("agent://event", { scope, event })
			}

			expect(assistantRowsOf(controller.getState())).toEqual([])
			detach()
		},
	)

	it.each(openers)(
		"renders nothing in %s from a turn stored in another conversation",
		async (_, open) => {
			const { controller, detach, botId, conversationId } = await open()
			const scope = { ...foreignScope(conversationId), botId }
			const turn = storedTurn("another-conversation")

			for (const event of [
				...streamed("elsewhere-3", "Not here"),
				TURN_ENDED,
			]) {
				await emitLocally("agent://event", { scope, turn, event })
			}

			expect(assistantRowsOf(controller.getState())).toEqual([])
			detach()
		},
	)
})

const TURN_RUNNING: AgentEvent = { type: "turnChanged", state: "running" }

const SEARCHING: AgentEvent = {
	type: "activity",
	activity: {
		id: "tool-1",
		title: "Grep walls",
		kind: "tool",
		status: "running",
	},
}

const TURN_FAILED: AgentEvent = {
	type: "failed",
	error: { kind: "crashed", code: null, detail: null },
}

type Emit = (event: string, payload: unknown) => Promise<void>

const sides = [
	["the host", emitLocally, async () => undefined],
	["the guest", emitOnHost, joinHost],
] as const

const speakersOf = ({ speakers }: { speakers: { botId: string }[] }) =>
	speakers.map(({ botId }) => botId)

const workOf = ({ speakers }: { speakers: { work: { kind: string } }[] }) =>
	speakers.map(({ work }) => work.kind)

type MissionRoom = Awaited<ReturnType<typeof openRoom>>

const liveMissionsOf = ({ controller, botId, conversationId }: MissionRoom) => {
	const mission = aMission({ botId, threadConversationId: conversationId })
	const runtimes = {
		subscribe: controller.subscribe,
		heldFor: (id: string) => (id === conversationId ? controller : null),
	}
	return renderHook(() => useLiveMissions(runtimes, [mission], 0)).result
}

describe("a turn the other Mac started", () => {
	it.each(sides)(
		"opens a working speaker and a live mission in a room on %s, then closes them",
		async (_, emit: Emit, join) => {
			const room = await openRoom()
			await join()
			const { controller, detach, botId, conversationId } = room
			const live = liveMissionsOf(room)
			const scope = { ...foreignScope(conversationId), botId }
			const turn = storedTurn(conversationId)

			await emit("agent://event", { scope, turn, event: TURN_RUNNING })
			await emit("agent://event", { scope, turn, event: SEARCHING })

			expect(speakersOf(controller.getState())).toEqual([botId])
			expect(workOf(controller.getState())).toEqual(["searching"])
			expect(live.current.size).toBe(1)

			for (const event of [...streamed("foreign-1", "Found it"), TURN_ENDED]) {
				await emit("agent://event", { scope, turn, event })
			}

			expect(speakersOf(controller.getState())).toEqual([])
			expect(live.current.size).toBe(0)
			expect(assistantRowsOf(controller.getState())).toMatchObject([
				{ content: "Found it", completion: "complete" },
			])
			detach()
		},
	)

	it.each(sides)(
		"reports the bot working in its solo roster line on %s until the turn ends",
		async (_, emit: Emit, join) => {
			const { controller, detach, botId, conversationId } = await openSoloChat()
			await join()
			const scope = foreignScope(conversationId)
			const turn = storedTurn(conversationId)

			await emit("agent://event", { scope, turn, event: SEARCHING })

			expect(sidebarActivityFor(controller.stateFor(botId))).toEqual({
				isWorking: true,
				kind: "searching",
			})

			await emit("agent://event", { scope, turn, event: TURN_ENDED })

			expect(sidebarActivityFor(controller.stateFor(botId))).toEqual({
				isWorking: false,
			})
			detach()
		},
	)

	it("closes the speaker when the foreign turn fails", async () => {
		const { controller, detach, botId, conversationId } = await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)

		await emitLocally("agent://event", { scope, turn, event: TURN_RUNNING })
		await emitLocally("agent://event", { scope, turn, event: TURN_FAILED })

		expect(speakersOf(controller.getState())).toEqual([])
		detach()
	})

	it("keeps one speaker for the bot once this window starts its own turn", async () => {
		const { controller, detach, botId, conversationId } = await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)
		await emitLocally("agent://event", { scope, turn, event: TURN_RUNNING })

		await act(() => controller.send("and here?"))
		await settled()

		expect(speakersOf(controller.getState())).toEqual([botId])
		detach()
	})
})

const STARTED_AT = 1_000

const rowOf = (
	conversation: Conversation,
	openBotIds: string[] | null,
): ConversationInPage => ({
	...conversation,
	lastActivityAt: STARTED_AT,
	lastWord: null,
	soloBotId: null,
	activeTurn: openBotIds && { startedAt: STARTED_AT, botIds: openBotIds },
})

const startedWorkOf = ({
	speakers,
}: {
	speakers: { work: { startedAt?: number } }[]
}) => speakers.map(({ work }) => work.startedAt)

describe("the working state the stored open turn carries", () => {
	it("shows one unheard working line per bot the stored turn names", async () => {
		const { controller, detach, botId, conversation } = await openRoom()

		await act(() => controller.open(rowOf(conversation, [botId])))

		expect(speakersOf(controller.getState())).toEqual([botId])
		expect(workOf(controller.getState())).toEqual(["thinking"])
		expect(startedWorkOf(controller.getState())).toEqual([STARTED_AT])
		detach()
	})

	it("refines the stored line with the activity a live event names", async () => {
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom()
		await act(() => controller.open(rowOf(conversation, [botId])))
		const scope = { ...foreignScope(conversationId), botId }

		await emitLocally("agent://event", {
			scope,
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		expect(workOf(controller.getState())).toEqual(["searching"])
		detach()
	})

	it("shows no working line while the stored turn is closed, whatever the live events left open", async () => {
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		await emitLocally("agent://event", {
			scope,
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		await act(() => controller.open(rowOf(conversation, null)))

		expect(speakersOf(controller.getState())).toEqual([])
		detach()
	})

	it("closes a foreign speaker silent for a minute and rereads its row once", async () => {
		const rereadRows: string[] = []
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom(NOTHING_TO_PREPARE, {
				rereadConversation: (id) => rereadRows.push(id),
			})
		await act(() => controller.open(rowOf(conversation, [botId])))
		vi.useFakeTimers()
		onTestFinished(() => {
			vi.useRealTimers()
		})
		await emitLocally("agent://event", {
			scope: { ...foreignScope(conversationId), botId },
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		act(() => vi.advanceTimersByTime(FOREIGN_SPEAKER_SILENCE_MS - 1))

		expect(workOf(controller.getState())).toEqual(["searching"])
		expect(rereadRows).toEqual([])

		act(() => vi.advanceTimersByTime(1))

		expect(workOf(controller.getState())).toEqual(["thinking"])
		expect(rereadRows).toEqual([conversationId])

		act(() => vi.advanceTimersByTime(FOREIGN_SPEAKER_SILENCE_MS))

		expect(rereadRows).toEqual([conversationId])
		detach()
	})

	it("rebuilds the foreign speakers from the row reread once the joined host reconnects", async () => {
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom()
		await joinHost()
		await act(() => controller.open(rowOf(conversation, [botId])))
		await emitOnHost("agent://event", {
			scope: { ...foreignScope(conversationId), botId },
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})
		expect(workOf(controller.getState())).toEqual(["searching"])

		await reconnectHost()
		await act(() => controller.open(rowOf(conversation, null)))

		expect(speakersOf(controller.getState())).toEqual([])

		await act(() => controller.open(rowOf(conversation, [botId])))

		expect(speakersOf(controller.getState())).toEqual([botId])
		expect(workOf(controller.getState())).toEqual(["thinking"])
		detach()
	})

	it("keeps the speaker the reread row still names once the joined host reconnects", async () => {
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom()
		await joinHost()
		await act(() => controller.open(rowOf(conversation, [botId])))
		await emitOnHost("agent://event", {
			scope: { ...foreignScope(conversationId), botId },
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		await reconnectHost()
		await act(() => controller.open(rowOf(conversation, [botId])))

		expect(workOf(controller.getState())).toEqual(["searching"])
		detach()
	})
})

const WRITE_FAILED = { kind: "writeFailed", detail: "pipe closed" } as const

const refusedBySession = (botId: string): CancelOutcome => ({
	kind: "failed",
	failures: [{ botId, reason: { source: "session", error: WRITE_FAILED } }],
})

const refusedByStore = (botId: string): CancelOutcome => ({
	kind: "failed",
	failures: [
		{
			botId,
			reason: { source: "store", error: { kind: "unknownTurn", id: "t-1" } },
		},
	],
})

const openStoredOnlyRoom = async () => {
	const rereadRows: string[] = []
	const room = await openRoom(NOTHING_TO_PREPARE, {
		rereadConversation: (id) => rereadRows.push(id),
	})
	await act(() => room.controller.open(rowOf(room.conversation, [room.botId])))
	return { ...room, rereadRows }
}

const pressStop = async (controller: ConversationController) => {
	const [speaking] = controller.getState().speakers
	await act(async () => {
		await speaking?.stop?.()
	})
}

describe("the Stop of a bot working from the stored turn alone", () => {
	it("cancels the turn of that conversation and bot", async () => {
		const { controller, detach, scripted, botId, conversationId } =
			await openStoredOnlyRoom()
		const asked: RuntimeScope[] = []
		scripted.answerCancelWith((scope) => {
			asked.push(scope)
			return Promise.resolve({ kind: "cancelled" })
		})

		expect(controller.getState().speakers[0]?.stop).not.toBeNull()
		await pressStop(controller)

		expect(asked).toMatchObject([{ conversationId, botId }])
		detach()
	})

	it.each<CancelOutcome>([{ kind: "cancelled" }, { kind: "nothingToCancel" }])(
		"turns the indicator off once the row is read again after $kind",
		async (outcome) => {
			const {
				controller,
				detach,
				scripted,
				conversation,
				conversationId,
				rereadRows,
			} = await openStoredOnlyRoom()
			scripted.answerCancelWith(() => Promise.resolve(outcome))

			await pressStop(controller)

			expect(rereadRows).toEqual([conversationId])
			expect(controller.getState().latestError).toBeNull()

			await act(() => controller.open(rowOf(conversation, null)))

			expect(speakersOf(controller.getState())).toEqual([])
			detach()
		},
	)

	it.each([
		["the session refuses", refusedBySession, "pipe closed"],
		["the store refuses", refusedByStore, "unknownTurn"],
	])(
		"keeps the indicator on and names the bot when %s",
		async (_, refusal, reason) => {
			const { controller, detach, scripted, botId, rereadRows } =
				await openStoredOnlyRoom()
			scripted.answerCancelWith(() => Promise.resolve(refusal(botId)))

			await pressStop(controller)

			const { latestError } = controller.getState()
			expect(latestError).toMatchObject({
				botId,
				error: { kind: "writeFailed" },
			})
			expect(JSON.stringify(latestError?.error)).toContain(reason)
			expect(speakersOf(controller.getState())).toEqual([botId])
			expect(rereadRows).toEqual([])
			detach()
		},
	)

	it("keeps the indicator on and names the bot when the call rejects", async () => {
		const { controller, detach, scripted, botId, rereadRows } =
			await openStoredOnlyRoom()
		scripted.answerCancelWith(() => Promise.reject(WRITE_FAILED))

		await pressStop(controller)

		expect(controller.getState().latestError).toMatchObject({
			botId,
			error: WRITE_FAILED,
		})
		expect(speakersOf(controller.getState())).toEqual([botId])
		expect(rereadRows).toEqual([])
		detach()
	})

	it("starts the clock of a bot heard live from its live run, not the older open turn", async () => {
		const heardAt = STARTED_AT + 60_000
		const { controller, detach, botId, conversation, conversationId } =
			await openRoom(NOTHING_TO_PREPARE, { now: () => heardAt })
		await act(() => controller.open(rowOf(conversation, [botId])))

		await emitLocally("agent://event", {
			scope: { ...foreignScope(conversationId), botId },
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		expect(startedWorkOf(controller.getState())).toEqual([heardAt])
		detach()
	})
})

describe("a foreign speaker silent in the solo chat", () => {
	it("closes it after a minute of silence and reads the stored turn again once", async () => {
		const rereadRows: string[] = []
		const { controller, detach, botId, conversationId } = await openSoloChat(
			NOTHING_TO_PREPARE,
			{ rereadConversation: (id) => rereadRows.push(id) },
		)
		vi.useFakeTimers()
		onTestFinished(() => {
			vi.useRealTimers()
		})
		await emitLocally("agent://event", {
			scope: foreignScope(conversationId),
			turn: storedTurn(conversationId),
			event: SEARCHING,
		})

		act(() => vi.advanceTimersByTime(FOREIGN_SPEAKER_SILENCE_MS - 1))

		expect(sidebarActivityFor(controller.stateFor(botId)).isWorking).toBe(true)
		expect(rereadRows).toEqual([])

		act(() => vi.advanceTimersByTime(1))

		expect(sidebarActivityFor(controller.stateFor(botId))).toEqual({
			isWorking: false,
		})
		expect(rereadRows).toEqual([conversationId])
		detach()
	})
})

const PERMISSION: PermissionRequest = {
	id: "permission-1",
	toolName: "Bash",
	title: "Run ls",
	detail: null,
}

const QUESTION: QuestionRequest = {
	id: "question-1",
	questions: [
		{
			question: "Which wall?",
			header: "Wall",
			options: [],
			multiSelect: false,
		},
	],
}

const ANSWERS = { "Which wall?": "North" }

const ASKED_PERMISSION: AgentEvent = {
	type: "permissionRequested",
	request: PERMISSION,
}

const ASKED_QUESTION: AgentEvent = {
	type: "questionRequested",
	request: QUESTION,
}

const PERMISSION_RESOLVED: AgentEvent = {
	type: "permissionResolved",
	id: PERMISSION.id,
	decision: "allowOnce",
}

const QUESTION_RESOLVED: AgentEvent = {
	type: "permissionResolved",
	id: QUESTION.id,
	decision: "allowOnce",
}

const MOVING_ON: AgentEvent[] = [
	TURN_RUNNING,
	SEARCHING,
	...streamed("foreign-2", "Still thinking"),
]

describe("a prompt raised by a turn the other Mac started", () => {
	it.each(sides)(
		"shows the approval in a room on %s, answers it with the foreign scope, and closes it once resolved",
		async (_, emit: Emit, join) => {
			const room = await openRoom()
			await join()
			const { controller, driver, detach, botId, conversationId } = room
			const respond = vi.spyOn(driver, "respondToPermission")
			const scope = { ...foreignScope(conversationId), botId }
			const turn = storedTurn(conversationId)

			await emit("agent://event", { scope, turn, event: ASKED_PERMISSION })

			expect(controller.getState().pendingPrompt).toEqual({
				kind: "permission",
				botId,
				request: PERMISSION,
			})

			await act(() => controller.respond(PERMISSION.id, "allowOnce"))

			expect(respond).toHaveBeenCalledWith(scope, PERMISSION.id, "allowOnce")

			await emit("agent://event", { scope, turn, event: PERMISSION_RESOLVED })

			expect(controller.getState().pendingPrompt).toBeNull()
			detach()
		},
	)

	it("closes the approval in a room when it was resolved on the other side", async () => {
		const { controller, detach, botId, conversationId } = await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)

		await emitLocally("agent://event", { scope, turn, event: ASKED_PERMISSION })
		await emitLocally("agent://event", {
			scope,
			turn,
			event: PERMISSION_RESOLVED,
		})

		expect(controller.getState().pendingPrompt).toBeNull()
		detach()
	})

	it("shows the question in a room, answers it with the foreign scope, and closes it", async () => {
		const { controller, driver, detach, botId, conversationId } =
			await openRoom()
		const answer = vi.spyOn(driver, "answerQuestion")
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)

		await emitLocally("agent://event", { scope, turn, event: ASKED_QUESTION })

		expect(controller.getState().pendingPrompt).toEqual({
			kind: "question",
			botId,
			request: QUESTION,
		})

		await act(() => controller.answer(QUESTION.id, ANSWERS))

		expect(answer).toHaveBeenCalledWith(scope, QUESTION.id, ANSWERS)
		expect(controller.getState().pendingPrompt).toBeNull()
		detach()
	})

	it("keeps the question open in a room while the turn moves on, and closes it once resolved", async () => {
		const { controller, detach, botId, conversationId } = await openRoom()
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)
		await emitLocally("agent://event", { scope, turn, event: ASKED_QUESTION })

		for (const event of MOVING_ON) {
			await emitLocally("agent://event", { scope, turn, event })
		}

		expect(controller.getState().pendingPrompt).toMatchObject({
			request: QUESTION,
		})

		await emitLocally("agent://event", {
			scope,
			turn,
			event: QUESTION_RESOLVED,
		})

		expect(controller.getState().pendingPrompt).toBeNull()
		detach()
	})

	it("keeps the question open in a solo chat while the turn moves on, and closes it once resolved", async () => {
		const { controller, detach, botId, conversationId } = await openSoloChat()
		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)
		await emitLocally("agent://event", { scope, turn, event: ASKED_QUESTION })

		for (const event of MOVING_ON) {
			await emitLocally("agent://event", { scope, turn, event })
		}

		expect(controller.stateFor(botId).foreignTurn?.question).toEqual(QUESTION)

		await emitLocally("agent://event", {
			scope,
			turn,
			event: QUESTION_RESOLVED,
		})

		expect(controller.stateFor(botId).foreignTurn?.question).toBeNull()
		detach()
	})

	it("keeps the approval open in a room and raises a notice when the answer is refused", async () => {
		const { controller, driver, detach, botId, conversationId } =
			await openRoom()
		vi.spyOn(driver, "respondToPermission").mockRejectedValueOnce(
			new Error("relay down"),
		)
		const scope = { ...foreignScope(conversationId), botId }
		const turn = storedTurn(conversationId)
		await emitLocally("agent://event", { scope, turn, event: ASKED_PERMISSION })

		await act(() => controller.respond(PERMISSION.id, "allowOnce"))

		expect(controller.getState().pendingPrompt).toMatchObject({
			request: PERMISSION,
		})
		expect(controller.getState().latestError).not.toBeNull()
		detach()
	})

	it("shows the approval in a solo chat, answers it with the foreign scope, and closes it once resolved", async () => {
		const { store, controller, driver, detach, botId, conversationId } =
			await openSoloChat()
		const respond = vi.spyOn(driver, "respondToPermission")
		const append = vi.spyOn(store, "appendUserMessage")
		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)

		await emitLocally("agent://event", { scope, turn, event: ASKED_PERMISSION })

		expect(controller.stateFor(botId).foreignTurn?.permission).toEqual(
			PERMISSION,
		)

		await act(() => controller.respond(PERMISSION.id, "allowOnce"))

		expect(respond).toHaveBeenCalledWith(scope, PERMISSION.id, "allowOnce")
		expect(append).not.toHaveBeenCalled()

		await emitLocally("agent://event", {
			scope,
			turn,
			event: PERMISSION_RESOLVED,
		})

		expect(controller.stateFor(botId).foreignTurn?.permission).toBeNull()
		detach()
	})

	it("shows the question in a solo chat, answers it with the foreign scope, and closes it when the turn ends", async () => {
		const { controller, driver, detach, botId, conversationId } =
			await openSoloChat()
		const answer = vi.spyOn(driver, "answerQuestion").mockResolvedValue()
		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)

		await emitLocally("agent://event", { scope, turn, event: ASKED_QUESTION })

		expect(controller.stateFor(botId).foreignTurn?.question).toEqual(QUESTION)

		await act(() => controller.answer(QUESTION.id, ANSWERS))

		expect(answer).toHaveBeenCalledWith(scope, QUESTION.id, ANSWERS)

		await emitLocally("agent://event", { scope, turn, event: TURN_ENDED })

		expect(controller.stateFor(botId).foreignTurn).toBeNull()
		detach()
	})

	it("keeps the question open in a solo chat and raises a notice when the answer is refused", async () => {
		const { store, controller, driver, detach, botId, conversationId } =
			await openSoloChat()
		vi.spyOn(driver, "answerQuestion").mockRejectedValueOnce(
			new Error("relay down"),
		)
		const append = vi.spyOn(store, "appendUserMessage")
		const scope = foreignScope(conversationId)
		const turn = storedTurn(conversationId)
		await emitLocally("agent://event", { scope, turn, event: ASKED_QUESTION })

		await act(() => controller.answer(QUESTION.id, ANSWERS))

		expect(controller.stateFor(botId).foreignTurn?.question).toEqual(QUESTION)
		expect(controller.stateFor(botId).errors).not.toEqual([])
		expect(append).not.toHaveBeenCalled()
		detach()
	})

	it("records the answer to a question of a turn opened elsewhere and shows it in the thread", async () => {
		const answered = await answerForeignQuestion({ open: openSoloChat })

		expect(answered.append).toHaveBeenCalledWith(
			answerStoredIn(answered.conversationId),
		)
		expect(answered.bubble).toMatchObject(ANSWER_BUBBLE)
	})

	it("records the answer of a member on the joined host and shows it in the thread", async () => {
		const answered = await answerForeignQuestion({
			open: openSoloChat,
			ask: askOnJoinedHost,
		})

		expect(answered.append).toHaveBeenCalledWith(
			answerStoredIn(answered.conversationId),
		)
		expect(answered.bubble).toMatchObject(ANSWER_BUBBLE)
	})

	it("records nothing when the answer to a foreign question is empty", async () => {
		const answered = await answerForeignQuestion({
			open: openSoloChat,
			answers: {},
		})

		expect(answered.append).not.toHaveBeenCalled()
		expect(answered.bubble).toBeUndefined()
	})

	it("records the answer to a question of a turn opened elsewhere and shows it in the room", async () => {
		const answered = await answerForeignQuestion({ open: openRoom })

		expect(answered.append).toHaveBeenCalledWith(
			answerStoredIn(answered.conversationId),
		)
		expect(answered.bubble).toMatchObject(ANSWER_BUBBLE)
	})

	it("records nothing in the room when the answer to a foreign question is refused", async () => {
		const answered = await answerForeignQuestion({
			open: openRoom,
			deliver: REFUSED,
		})

		expect(answered.append).not.toHaveBeenCalled()
		expect(answered.bubble).toBeUndefined()
	})

	it("records nothing in the room when the answer to a foreign question is empty", async () => {
		const answered = await answerForeignQuestion({
			open: openRoom,
			answers: {},
		})

		expect(answered.append).not.toHaveBeenCalled()
		expect(answered.bubble).toBeUndefined()
	})
})

type AskForeign = (scoped: ScopedEvent) => Promise<void>

const askLocally: AskForeign = (scoped) => emitLocally("agent://event", scoped)

const askOnJoinedHost: AskForeign = async (scoped) => {
	await joinHost()
	await emitOnHost("agent://event", scoped)
}

const ACCEPTED = () => Promise.resolve()

const REFUSED = () => Promise.reject(new Error("relay down"))

type ForeignAnswering = {
	open: typeof openSoloChat | typeof openRoom
	ask?: AskForeign
	answers?: QuestionAnswers
	deliver?: () => Promise<void>
}

const answerForeignQuestion = async ({
	open,
	ask = askLocally,
	answers = ANSWERS,
	deliver = ACCEPTED,
}: ForeignAnswering) => {
	const { store, controller, driver, detach, botId, conversationId } =
		await open()
	vi.spyOn(driver, "answerQuestion").mockImplementation(deliver)
	const append = vi.spyOn(store, "appendUserMessage")
	await ask({
		scope: { ...foreignScope(conversationId), botId },
		turn: storedTurn(conversationId),
		event: ASKED_QUESTION,
	})

	await act(() => controller.answer(QUESTION.id, answers))
	await settled()
	detach()

	const bubble = controller
		.getState()
		.messages.find(
			({ repliedToMessageId }) => repliedToMessageId === QUESTION_ROW_ID,
		)
	return { append, bubble, conversationId }
}

const answerStoredIn = (conversationId: string) =>
	expect.objectContaining({
		conversationId,
		turnId: "turn-of-another-window",
		authorBotId: null,
		repliedToMessageId: QUESTION_ROW_ID,
		content: "North",
	})

const ANSWER_BUBBLE = {
	role: "user",
	content: "North",
	authorAccountId: MEMBER,
}

type QuestionShown = {
	messages: TranscriptMessage[]
	question: QuestionRequest | null
}

const QUESTION_ROW_ID = questionMessageIdOf(QUESTION.id)

const openAskedRoom = async (prepare = NOTHING_TO_PREPARE) => {
	const room = await openRoom(prepare)
	const shown = (): QuestionShown => {
		const { messages, pendingPrompt } = room.controller.getState()
		const question =
			pendingPrompt?.kind === "question" ? pendingPrompt.request : null
		return { messages, question }
	}
	return { ...room, shown }
}

const openAskedSoloChat = async (prepare = NOTHING_TO_PREPARE) => {
	const solo = await openSoloChat(prepare)
	const shown = (): QuestionShown => {
		const { messages, foreignTurn } = solo.controller.stateFor(solo.botId)
		return { messages, question: foreignTurn?.question ?? null }
	}
	return { ...solo, shown }
}

const askedIn = ({ messages, question }: QuestionShown) =>
	renderHook(() =>
		useAskedQuestion({
			question,
			runs: toRuns(toTranscriptRows(messages)),
			toQuote: vi.fn(),
		}),
	).result.current.asked

const questionRowsIn = ({ messages }: QuestionShown) =>
	messages.filter(({ id }) => id === QUESTION_ROW_ID)

const ASKED_CARD = { messageId: QUESTION_ROW_ID, request: QUESTION }

describe.each([
	["a room", openAskedRoom],
	["a solo conversation", openAskedSoloChat],
] as const)(
	"the question card of a turn the other Mac started in %s",
	(_, open) => {
		const openAsked = async (emit: Emit, join: () => Promise<void>) => {
			const opened = await open()
			await join()
			const scope = {
				...foreignScope(opened.conversationId),
				botId: opened.botId,
			}
			const turn = storedTurn(opened.conversationId)
			const emitTurn = (event: AgentEvent) =>
				emit("agent://event", { scope, turn, event })
			await emitTurn(ASKED_QUESTION)
			return { ...opened, scope, emitTurn }
		}

		it.each(sides)(
			"anchors one question row and shows its card on %s",
			async (_, emit: Emit, join) => {
				const { shown, detach } = await openAsked(emit, join)

				expect(questionRowsIn(shown())).toMatchObject([
					{
						role: "assistant",
						content: questionMessageText(QUESTION),
						completion: "complete",
					},
				])
				expect(askedIn(shown())).toEqual(ASKED_CARD)
				detach()
			},
		)

		it.each(sides)(
			"keeps one row and one card on %s once the question row is stored",
			async (_, emit: Emit, join) => {
				const { store, shown, detach, botId, conversationId } = await openAsked(
					emit,
					join,
				)
				const prompt = await repliedElsewhere(store, {
					conversationId,
					botId,
					replyId: QUESTION_ROW_ID,
					text: questionMessageText(QUESTION),
				})

				await emit("conversation://message-stored", prompt)
				await settled()

				expect(questionRowsIn(shown())).toHaveLength(1)
				expect(askedIn(shown())).toEqual(ASKED_CARD)
				detach()
			},
		)

		it.each(sides)(
			"sends the answer given on %s to the agent of the starting side and closes the card",
			async (_, emit: Emit, join) => {
				const { driver, shown, scope, detach, controller } = await openAsked(
					emit,
					join,
				)
				const answer = vi.spyOn(driver, "answerQuestion").mockResolvedValue()

				await act(() => controller.answer(QUESTION.id, ANSWERS))

				expect(answer).toHaveBeenCalledWith(scope, QUESTION.id, ANSWERS)
				expect(questionRowsIn(shown())).toHaveLength(1)
				expect(askedIn(shown())).toBeNull()
				detach()
			},
		)

		it.each(sides)(
			"closes the card on %s once the question is resolved",
			async (_, emit: Emit, join) => {
				const { shown, emitTurn, detach } = await openAsked(emit, join)

				await emitTurn(QUESTION_RESOLVED)

				expect(questionRowsIn(shown())).toHaveLength(1)
				expect(askedIn(shown())).toBeNull()
				detach()
			},
		)
	},
)

type HeldRead = {
	answer: (questions: unknown[]) => Promise<void>
	refuse: () => Promise<void>
}

const holdPendingQuestions = (): HeldRead => {
	let answer: (questions: unknown) => void = () => undefined
	let refuse: (reason: unknown) => void = () => undefined
	wire.pendingQuestions = () =>
		new Promise((resolve, reject) => {
			answer = resolve
			refuse = reject
		})
	return {
		answer: async (questions) => {
			answer(questions)
			await settled()
		},
		refuse: async () => {
			refuse("host unreachable")
			await settled()
		},
	}
}

type WaitingView = {
	shownConversationId: () => string | null
	hasFailed: () => boolean
	switchAway: () => Promise<() => QuestionShown>
}

const openWaitingRoom = async () => {
	const room = await openAskedRoom()
	const { controller, store, botId } = room
	const view: WaitingView = {
		shownConversationId: () => controller.getState().conversationId,
		hasFailed: () => controller.getState().latestError !== null,
		switchAway: async () => {
			const other = await store.createConversation({
				spaceId: "personal",
				sectionId: null,
				title: "Floors",
				botIds: [botId],
			})
			await act(() => controller.open(other))
			return room.shown
		},
	}
	return { ...room, ...view }
}

const OTHER_BOT = "other"

const openWaitingSoloChat = async () => {
	const solo = await openAskedSoloChat()
	const { controller, botId } = solo
	const view: WaitingView = {
		shownConversationId: () => controller.stateFor(botId).conversationId,
		hasFailed: () => controller.stateFor(botId).errors.length > 0,
		switchAway: async () => {
			await act(() => controller.open(OTHER_BOT, null).then(() => undefined))
			await settled()
			return () => {
				const { messages, foreignTurn } = controller.stateFor(OTHER_BOT)
				return { messages, question: foreignTurn?.question ?? null }
			}
		},
	}
	return { ...solo, ...view }
}

describe.each([
	["a room", openWaitingRoom],
	["a solo conversation", openWaitingSoloChat],
] as const)(
	"the questions still waiting when %s opens or reloads",
	(_, open) => {
		const openWaiting = async (join: () => Promise<void>) => {
			const read = holdPendingQuestions()
			await join()
			const opened = await open()
			const scope = {
				...foreignScope(opened.conversationId),
				botId: opened.botId,
			}
			const turn = storedTurn(opened.conversationId)
			const waiting = { scope, turn, event: ASKED_QUESTION }
			return { ...opened, read, scope, turn, waiting }
		}

		it.each(sides)(
			"shows one card and one question row for each on %s",
			async (_, _emit, join) => {
				const { read, waiting, shown, detach } = await openWaiting(join)

				await read.answer([waiting])

				expect(questionRowsIn(shown())).toMatchObject([
					{ content: questionMessageText(QUESTION), completion: "complete" },
				])
				expect(askedIn(shown())).toEqual(ASKED_CARD)
				detach()
			},
		)

		it.each(sides)(
			"keeps one card and one row on %s when the live replay brings the question too",
			async (_, emit: Emit, join) => {
				const { read, waiting, shown, detach } = await openWaiting(join)

				await emit("agent://event", waiting)
				await read.answer([waiting])
				await emit("agent://event", waiting)

				expect(questionRowsIn(shown())).toHaveLength(1)
				expect(askedIn(shown())).toEqual(ASKED_CARD)
				detach()
			},
		)

		it.each(sides)(
			"shows no card on %s for a question resolved before the read returns",
			async (_, emit: Emit, join) => {
				const { read, waiting, scope, turn, shown, detach } =
					await openWaiting(join)

				await emit("agent://event", waiting)
				await emit("agent://event", { scope, turn, event: QUESTION_RESOLVED })
				await read.answer([waiting])

				expect(askedIn(shown())).toBeNull()
				detach()
			},
		)

		it.each(sides)(
			"sends the answer given on %s to the turn that asked and closes the card",
			async (_, _emit, join) => {
				const { read, waiting, scope, driver, controller, shown, detach } =
					await openWaiting(join)
				const answer = vi.spyOn(driver, "answerQuestion").mockResolvedValue()
				await read.answer([waiting])

				await act(() => controller.answer(QUESTION.id, ANSWERS))

				expect(answer).toHaveBeenCalledWith(scope, QUESTION.id, ANSWERS)
				expect(askedIn(shown())).toBeNull()
				detach()
			},
		)

		it.each(sides)(
			"raises a notice on %s and keeps the conversation open when the read is refused",
			async (_, _emit, join) => {
				const opened = await openWaiting(join)

				await opened.read.refuse()

				expect(opened.hasFailed()).toBe(true)
				expect(opened.shownConversationId()).toBe(opened.conversationId)
				opened.detach()
			},
		)

		it.each(sides)(
			"renders none of its questions on %s in the conversation shown instead",
			async (_, _emit, join) => {
				const { read, waiting, switchAway, detach } = await openWaiting(join)
				const shownInstead = await switchAway()

				await read.answer([waiting])

				expect(questionRowsIn(shownInstead())).toEqual([])
				expect(askedIn(shownInstead())).toBeNull()
				detach()
			},
		)
	},
)

const writeHistory: Prepare = async ({ store, conversationId }) => {
	await writtenElsewhere(store, conversationId, "First")
	await writtenElsewhere(store, conversationId, "Second")
}

const writeHistoryAndQuestionRow: Prepare = async (opening) => {
	await writeHistory(opening)
	await repliedElsewhere(opening.store, {
		conversationId: opening.conversationId,
		botId: opening.botId,
		replyId: QUESTION_ROW_ID,
		text: questionMessageText(QUESTION),
	})
}

const answerBeforePage =
	(writePage: Prepare): Prepare =>
	async (opening) => {
		await writePage(opening)
		const { store, driver, conversationId, botId } = opening
		const scope = { ...foreignScope(conversationId), botId }
		vi.spyOn(driver, "pendingQuestions").mockResolvedValueOnce([
			{ scope, turn: storedTurn(conversationId), event: ASKED_QUESTION },
		])
		const loadPage = store.loadPage
		vi.spyOn(store, "loadPage").mockImplementationOnce(async (...page) => {
			await settled()
			return loadPage(...page)
		})
	}

describe.each([
	["a room", openAskedRoom],
	["a solo conversation", openAskedSoloChat],
] as const)(
	"a question still waiting read before the page of %s",
	(_, open) => {
		it("shows its row once, after every message of the page, and its card", async () => {
			const { shown, detach } = await open(answerBeforePage(writeHistory))

			expect(contentsOf(shown())).toEqual([
				"First",
				"Second",
				questionMessageText(QUESTION),
			])
			expect(askedIn(shown())).toEqual(ASKED_CARD)
			detach()
		})

		it("shows its row once and its card when the page carries the row too", async () => {
			const { shown, detach } = await open(
				answerBeforePage(writeHistoryAndQuestionRow),
			)

			expect(questionRowsIn(shown())).toHaveLength(1)
			expect(contentsOf(shown()).at(-1)).toBe(questionMessageText(QUESTION))
			expect(askedIn(shown())).toEqual(ASKED_CARD)
			detach()
		})
	},
)
