// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { createConversationRuntimes } from "./conversation-runtimes"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { createScriptedDriver } from "./scripted-driver"
import type { Conversation } from "./store-contract"
import { seatBots } from "./transcript-fixtures"
import { useConversationWorkers } from "./use-conversation"

import type { AgentEvent } from "../agent/contract"

const SPACE = "personal"

const held = (count: number): AgentEvent => ({
	type: "turnHeld",
	hold: { reason: "backgroundTasks", count },
})

const RELEASED: AgentEvent = { type: "turnHeld", hold: null }

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

const idOf = (conversation: Conversation, name: string) => {
	const seat = conversation.participants.find(
		(participant) => participant.name === name,
	)
	if (!seat) {
		throw new Error(`no seat for ${name}`)
	}
	return seat.botId
}

const openWave = async () => {
	const driver = createScriptedDriver()
	const store = createFakeTranscriptStore()
	const runtimes = createConversationRuntimes(
		withFakeHostWrites(driver, store),
		store,
	)
	const bots = await seatBots(store, SPACE, ["Ada", "Nyx", "Iris"])
	const room = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const runtime = runtimes.runtimeFor(room.id)
	await runtime.open(room)
	await runtime.send("@Nyx then @Iris")
	await settled()
	const rendered = renderHook(() => useConversationWorkers(runtimes, [room]))
	const answer = async (botId: string, events: AgentEvent[]) => {
		await act(async () => {
			driver.pushTo(botId, events)
			await settled()
		})
	}
	const workersOf = () => rendered.result.current[room.id]
	const workerOf = (botId: string) =>
		workersOf().find((worker) => worker.botId === botId)
	return { room, rendered, answer, workersOf, workerOf }
}

afterEach(cleanup)

describe("useConversationWorkers", () => {
	it("gives a held speaker the tasks it waits on, then drops them on release", async () => {
		const wave = await openWave()
		const nyx = idOf(wave.room, "Nyx")

		await wave.answer(nyx, [held(2)])
		expect(wave.workerOf(nyx)).toEqual({
			botId: nyx,
			kind: "working",
			backgroundTasks: 2,
		})

		await wave.answer(nyx, [RELEASED])
		expect(wave.workerOf(nyx)).toEqual({ botId: nyx, kind: "thinking" })
	})

	it("publishes new workers when the count of held tasks changes", async () => {
		const wave = await openWave()
		const nyx = idOf(wave.room, "Nyx")
		await wave.answer(nyx, [held(2)])
		const before = wave.workersOf()

		await wave.answer(nyx, [held(1)])

		expect(wave.workersOf()).not.toBe(before)
		expect(wave.workerOf(nyx)?.backgroundTasks).toBe(1)
	})

	it("leaves the other speakers of the wave as they were", async () => {
		const wave = await openWave()
		const nyx = idOf(wave.room, "Nyx")
		const iris = idOf(wave.room, "Iris")
		const before = wave.workerOf(iris)

		await wave.answer(nyx, [held(2)])

		expect(wave.workerOf(iris)).toEqual(before)
	})
})
