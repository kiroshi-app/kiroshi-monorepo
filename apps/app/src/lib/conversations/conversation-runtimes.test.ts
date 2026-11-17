import { describe, expect, it, vi } from "vitest"

import {
	type ConversationRuntimes,
	createConversationRuntimes,
} from "./conversation-runtimes"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeReconnections } from "./fake-reconnections"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { leadOf } from "./roster-conversations"
import {
	createScriptedDriver,
	type ScriptedDriver,
	spoke,
} from "./scripted-driver"
import type { Conversation } from "./store-contract"
import { seatBots } from "./transcript-fixtures"

import type { AgentEvent } from "../agent/contract"

const SPACE = "personal"

const messageIdOf = (botId: string) => `msg-${botId}`

const started = (botId: string): AgentEvent => ({
	type: "messageStarted",
	message: {
		id: messageIdOf(botId),
		role: "assistant",
		text: "",
		completion: "streaming",
		timestamp: 1,
	},
})

const wrote = (botId: string, text: string, seq = 1): AgentEvent => ({
	type: "messageDelta",
	id: messageIdOf(botId),
	seq,
	text,
})

const ENDED: AgentEvent = {
	type: "turnEnded",
	ended: { sessionId: null, outcome: "completed" },
}

const FAILED: AgentEvent = { type: "failed", error: { kind: "notStarted" } }

const TURN_FAILED: AgentEvent = { type: "turnChanged", state: "failed" }

const leadIn = (conversation: Conversation) => {
	const lead = leadOf(conversation)
	if (!lead) {
		throw new Error(`no lead in ${conversation.title}`)
	}
	return lead
}

type Screen = {
	send: (text: string) => Promise<void>
	leave: () => void
}

type Reader = {
	driver: ScriptedDriver
	runtimes: ConversationRuntimes
	openRoom: (title: string, names: string[]) => Promise<Conversation>
	enter: (conversation: Conversation) => Promise<Screen>
	answer: (botId: string, events: AgentEvent[]) => Promise<void>
	reconnect: () => Promise<void>
	pageReadIds: () => string[]
	forgetPageReads: () => void
	transcriptOf: (conversation: Conversation) => [string | null, string][]
	completionsIn: (conversation: Conversation) => Promise<string[][]>
}

const createReader = (): Reader => {
	const driver = createScriptedDriver()
	const store = createFakeTranscriptStore()
	const loadPage = vi.spyOn(store, "loadPage")
	const relay = createFakeReconnections()
	const runtimes = createConversationRuntimes(
		withFakeHostWrites(driver, store),
		store,
		{ onReconnected: relay.onReconnected },
	)

	const settled = async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	}

	const openRoom = async (title: string, names: string[]) => {
		const bots = await seatBots(store, SPACE, names)
		return store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title,
			botIds: bots.map((bot) => bot.id),
		})
	}

	const enter = async (conversation: Conversation) => {
		const runtime = runtimes.runtimeFor(conversation.id)
		const leave = runtime.subscribe(() => undefined)
		await runtime.open(conversation)
		await settled()
		return {
			leave,
			send: async (text: string) => {
				await runtime.send(text)
				await settled()
			},
		}
	}

	const answer = async (botId: string, events: AgentEvent[]) => {
		driver.pushTo(botId, events)
		await settled()
	}

	const reconnect = async () => {
		relay.reconnect()
		await settled()
	}

	const transcriptOf = (conversation: Conversation) =>
		runtimes
			.runtimeFor(conversation.id)
			.getState()
			.messages.map((message): [string | null, string] => [
				message.authorBotId,
				message.content,
			])

	const completionsIn = async (conversation: Conversation) => {
		const page = await store.loadPage(conversation.id, null)
		return page.messages.map((message) => [message.role, message.completion])
	}

	return {
		driver,
		runtimes,
		openRoom,
		enter,
		answer,
		reconnect,
		pageReadIds: () => loadPage.mock.calls.map(([id]) => id),
		forgetPageReads: () => loadPage.mockClear(),
		transcriptOf,
		completionsIn,
	}
}

describe("createConversationRuntimes", () => {
	it("keeps writing an answer the reader walked away from", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		screen.leave()

		await reader.answer(ada, [started(ada), wrote(ada, "walls up"), ENDED])

		expect(await reader.completionsIn(room)).toEqual([
			["user", "complete"],
			["assistant", "complete"],
		])
	})

	it("shows the answer as it stands when the reader comes back", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		screen.leave()

		await reader.answer(ada, [started(ada), wrote(ada, "walls ")])
		await reader.enter(room)

		expect(reader.transcriptOf(room)).toEqual([
			[null, "and now?"],
			[ada, "walls "],
		])

		await reader.answer(ada, [wrote(ada, "up", 2), ENDED])

		expect(reader.transcriptOf(room)).toEqual([
			[null, "and now?"],
			[ada, "walls up"],
		])
	})

	it("closes an answer that fails while its room is off screen", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		screen.leave()

		await reader.answer(ada, [
			started(ada),
			wrote(ada, "walls "),
			FAILED,
			TURN_FAILED,
		])

		expect(await reader.completionsIn(room)).toEqual([
			["user", "complete"],
			["assistant", "failed"],
		])
	})

	it("keeps both answers running when a second room is opened", async () => {
		const reader = createReader()
		const walls = await reader.openRoom("Walls", ["Ada"])
		const gates = await reader.openRoom("Gates", ["Nyx"])
		const ada = leadIn(walls)
		const nyx = leadIn(gates)

		const first = await reader.enter(walls)
		await first.send("and now?")
		first.leave()

		const second = await reader.enter(gates)
		await second.send("and now?")

		await reader.answer(ada, [started(ada), wrote(ada, "walls up"), ENDED])
		await reader.answer(nyx, [started(nyx), wrote(nyx, "gates shut"), ENDED])

		expect(reader.transcriptOf(walls)).toEqual([
			[null, "and now?"],
			[ada, "walls up"],
		])
		expect(reader.transcriptOf(gates)).toEqual([
			[null, "and now?"],
			[nyx, "gates shut"],
		])
	})

	it("shuts the runtime of a room down when that room is deleted", async () => {
		const reader = createReader()
		const shutdown = vi.spyOn(reader.driver, "shutdown")
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		await reader.answer(ada, [started(ada), wrote(ada, "walls ")])

		await reader.runtimes.release(room.id)

		expect(shutdown.mock.calls.map(([scope]) => scope.botId)).toEqual([ada])
	})

	it("stops an answer that is still writing when its room is deleted", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		await reader.answer(ada, [started(ada), wrote(ada, "walls ")])

		await reader.runtimes.release(room.id)
		await reader.answer(ada, [wrote(ada, "up", 2), ENDED])
		await reader.enter(room)

		expect(reader.transcriptOf(room)).toEqual([
			[null, "and now?"],
			[ada, "walls "],
		])
	})

	it("stops rereading a deleted room on reconnection while its runtime is still shutting down", async () => {
		const reader = createReader()
		vi.spyOn(reader.driver, "shutdown").mockReturnValue(
			new Promise(() => undefined),
		)
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)
		await screen.send("and now?")
		await reader.answer(ada, [started(ada), wrote(ada, "walls ")])

		void reader.runtimes.release(room.id)
		reader.forgetPageReads()
		await reader.reconnect()

		expect(reader.pageReadIds()).toEqual([])
	})

	it("builds a fresh runtime when a released room is opened again", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const screen = await reader.enter(room)

		await screen.send("and now?")
		await reader.answer(ada, spoke(ada, "walls up"))
		await reader.runtimes.release(room.id)

		const reopened = await reader.enter(room)
		await reopened.send("and after?")
		await reader.answer(ada, spoke(ada, "gates shut"))

		expect(reader.transcriptOf(room)).toEqual([
			[null, "and now?"],
			[ada, "walls up"],
			[null, "and after?"],
			[ada, "gates shut"],
		])
	})

	it("leaves the other rooms running when one is released", async () => {
		const reader = createReader()
		const walls = await reader.openRoom("Walls", ["Ada"])
		const gates = await reader.openRoom("Gates", ["Nyx"])
		const nyx = leadIn(gates)

		await reader.enter(walls)
		const second = await reader.enter(gates)
		await second.send("and now?")

		await reader.runtimes.release(walls.id)
		await reader.answer(nyx, [started(nyx), wrote(nyx, "gates shut"), ENDED])

		expect(reader.transcriptOf(gates)).toEqual([
			[null, "and now?"],
			[nyx, "gates shut"],
		])
	})

	it("forgets a room whose runtime refused to shut down", async () => {
		const reader = createReader()
		const room = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(room)
		const runtime = reader.runtimes.runtimeFor(room.id)
		vi.spyOn(runtime, "shutdown").mockRejectedValue(new Error("stuck"))

		const screen = await reader.enter(room)
		await screen.send("and now?")
		await reader.runtimes.release(room.id)

		const reopened = await reader.enter(room)
		await reopened.send("and after?")
		await reader.answer(ada, [started(ada), wrote(ada, "gates shut"), ENDED])

		expect(reader.transcriptOf(room)).toEqual([
			[null, "and now?"],
			[null, "and after?"],
			[ada, "gates shut"],
		])
	})

	it("shuts every room it opened down when the app goes away", async () => {
		const reader = createReader()
		const shutdown = vi.spyOn(reader.driver, "shutdown")
		const walls = await reader.openRoom("Walls", ["Ada"])
		const gates = await reader.openRoom("Gates", ["Nyx"])
		const ada = leadIn(walls)
		const nyx = leadIn(gates)

		const first = await reader.enter(walls)
		await first.send("and now?")
		first.leave()

		const second = await reader.enter(gates)
		await second.send("and now?")

		await reader.runtimes.shutdown()

		expect(shutdown.mock.calls.map(([scope]) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})

	it("tells a watcher of every room it holds", async () => {
		const reader = createReader()
		const walls = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(walls)
		const screen = await reader.enter(walls)
		await screen.send("and now?")
		screen.leave()

		const watching = vi.fn()
		reader.runtimes.subscribe(watching)
		await reader.answer(ada, [started(ada), wrote(ada, "walls up"), ENDED])

		expect(watching).toHaveBeenCalled()
	})

	it("stops telling a watcher about a room it has let go", async () => {
		const reader = createReader()
		const walls = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(walls)
		const screen = await reader.enter(walls)
		await screen.send("and now?")

		const watching = vi.fn()
		reader.runtimes.subscribe(watching)
		await reader.runtimes.release(walls.id)
		watching.mockClear()
		await reader.answer(ada, [started(ada), wrote(ada, "walls up"), ENDED])

		expect(watching).not.toHaveBeenCalled()
	})

	it("stops telling a watcher that walked away", async () => {
		const reader = createReader()
		const walls = await reader.openRoom("Walls", ["Ada"])
		const ada = leadIn(walls)
		const screen = await reader.enter(walls)
		await screen.send("and now?")

		const watching = vi.fn()
		const stop = reader.runtimes.subscribe(watching)
		stop()
		await reader.answer(ada, [started(ada), wrote(ada, "walls up"), ENDED])

		expect(watching).not.toHaveBeenCalled()
	})
})
