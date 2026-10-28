import { describe, expect, it } from "vitest"

import {
	droppedWaiting,
	emptyQueue,
	handedOver,
	openedWave,
	reopenedFor,
	type Summons,
} from "./turn-queue"

const SAID = "m-1"

const summons = (botId: string, promptId = SAID): Summons => ({
	botId,
	promptId,
})

const opened = (botIds: string[]) =>
	reopenedFor(
		emptyQueue,
		botIds.map((botId) => summons(botId)),
	)

const waitingIn = (queue: { waiting: Summons[] }) =>
	queue.waiting.map(({ botId }) => botId)

const waveIn = (queue: { wave: Summons[] }) =>
	queue.wave.map(({ botId }) => botId)

describe("openedWave", () => {
	it("takes every companion held, in the order they were named", () => {
		const queue = openedWave(opened(["ada", "nyx"]))
		expect(waveIn(queue)).toEqual(["ada", "nyx"])
		expect(queue.waiting).toEqual([])
	})

	it("leaves the queue alone when no companion is held", () => {
		const running = openedWave(opened(["ada"]))
		expect(openedWave(running)).toBe(running)
	})
})

describe("handedOver", () => {
	it("holds the companion named for the next wave, pointed at the message that named it", () => {
		const queue = handedOver(
			openedWave(opened(["ada"])),
			"ada",
			summons("nyx", "m-said-by-ada"),
		)
		expect(queue.waiting).toEqual([{ botId: "nyx", promptId: "m-said-by-ada" }])
	})

	it("leaves a companion already held where it is", () => {
		const queue = handedOver(opened(["ada", "nyx"]), "ada", summons("nyx"))
		expect(waitingIn(queue)).toEqual(["ada", "nyx"])
	})

	it("holds no summons for a companion that already ran in the turn", () => {
		const queue = handedOver(
			openedWave(opened(["ada", "nyx"])),
			"ada",
			summons("nyx"),
		)
		expect(waitingIn(queue)).toEqual([])
	})

	it("holds no summons for a companion of an earlier wave of the turn", () => {
		const first = openedWave(opened(["ada"]))
		const second = openedWave(handedOver(first, "ada", summons("nyx")))
		const queue = handedOver(second, "nyx", summons("ada"))
		expect(waitingIn(queue)).toEqual([])
	})

	it("holds again a companion that ran in the turn before", () => {
		const earlier = openedWave(opened(["ada"]))
		const queue = handedOver(
			openedWave(reopenedFor(earlier, [summons("nyx")])),
			"nyx",
			summons("ada"),
		)
		expect(waitingIn(queue)).toEqual(["ada"])
	})

	it("opens a second wave with the companion the first one named", () => {
		const first = openedWave(opened(["ada"]))
		const second = openedWave(handedOver(first, "ada", summons("nyx")))
		expect(waveIn(second)).toEqual(["nyx"])
		expect(second.waiting).toEqual([])
	})

	it("ignores a companion naming itself", () => {
		const queue = handedOver(openedWave(opened(["ada"])), "ada", summons("ada"))
		expect(queue.waiting).toEqual([])
	})
})

describe("droppedWaiting", () => {
	it("returns a new queue without the summons held for the companion", () => {
		const held = opened(["ada", "nyx"])
		const queue = droppedWaiting(held, "ada")
		expect(waitingIn(queue)).toEqual(["nyx"])
		expect(waitingIn(held)).toEqual(["ada", "nyx"])
	})

	it("leaves the queue alone when the companion is held nowhere", () => {
		const held = opened(["ada"])
		expect(droppedWaiting(held, "iris")).toBe(held)
	})

	it("leaves a companion seated in the open wave in its seat", () => {
		const running = openedWave(opened(["ada", "nyx"]))
		expect(droppedWaiting(running, "ada")).toBe(running)
		expect(waveIn(running)).toEqual(["ada", "nyx"])
	})

	it("drops the companion held after a handover", () => {
		const running = openedWave(opened(["ada"]))
		const named = handedOver(running, "ada", summons("nyx"))
		expect(droppedWaiting(named, "nyx").waiting).toEqual([])
	})
})

describe("reopenedFor", () => {
	it("drops those held and leaves the open wave in flight", () => {
		const running = openedWave(opened(["ada", "nyx", "iris"]))
		const queue = reopenedFor(running, [])
		expect(waveIn(queue)).toEqual(["ada", "nyx", "iris"])
		expect(queue.waiting).toEqual([])
	})

	it("keeps the open wave and holds the ones newly named", () => {
		const running = openedWave(opened(["ada", "nyx"]))
		const queue = reopenedFor(running, [summons("iris")])
		expect(waveIn(queue)).toEqual(["ada", "nyx"])
		expect(waitingIn(queue)).toEqual(["iris"])
	})
})
