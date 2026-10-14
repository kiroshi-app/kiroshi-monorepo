import { describe, expect, it } from "vitest"

import { createInvokeTally, type PhaseTally } from "./invoke-tally"

const printedTally = () => {
	const printed: PhaseTally[] = []
	const tally = createInvokeTally((phaseTally) => printed.push(phaseTally))
	return { printed, tally }
}

describe("invoke tally", () => {
	it("counts two invokes of the same command in one phase as 2", () => {
		const { printed, tally } = printedTally()

		tally.count("space_list")
		tally.count("space_list")
		tally.end("boot")

		expect(printed).toEqual([
			{ phase: "boot", counts: [{ command: "space_list", count: 2 }] },
		])
	})

	it("sorts the printed commands by count descending", () => {
		const { printed, tally } = printedTally()

		tally.count("bot_list")
		tally.count("plugin:window|show")
		tally.count("plugin:window|show")
		tally.end("boot")

		expect(printed[0]?.counts).toEqual([
			{ command: "plugin:window|show", count: 2 },
			{ command: "bot_list", count: 1 },
		])
	})

	it("resets the tally at a phase boundary", () => {
		const { printed, tally } = printedTally()

		tally.count("space_list")
		tally.end("boot")
		tally.count("conversation_page")
		tally.start("thread open")
		tally.end("thread open")

		expect(printed).toEqual([
			{ phase: "boot", counts: [{ command: "space_list", count: 1 }] },
			{ phase: "idle", counts: [{ command: "conversation_page", count: 1 }] },
			{ phase: "thread open", counts: [] },
		])
	})

	it("closes the open phase and prints it when another phase starts", () => {
		const { printed, tally } = printedTally()

		tally.end("boot")
		tally.start("space switch")
		tally.count("bot_list")
		tally.start("agent turn")

		expect(printed.map(({ phase }) => phase)).toEqual([
			"boot",
			"idle",
			"space switch",
		])
		expect(printed[2]?.counts).toEqual([{ command: "bot_list", count: 1 }])
	})

	it("ignores the end of a phase that is no longer open", () => {
		const { printed, tally } = printedTally()

		tally.start("thread open")
		tally.end("space switch")

		expect(printed.map(({ phase }) => phase)).toEqual(["boot"])
	})
})
