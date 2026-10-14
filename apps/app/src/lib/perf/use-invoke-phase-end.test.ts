// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest"

import type { InvokePhase } from "./invoke-tally"

type SettledScreen = { settledOn: string | null }

let printedLabels: MockInstance<typeof console.info>

const mountPhaseEnd = async (phase: InvokePhase, settledOn: string) => {
	vi.resetModules()
	const { startInvokePhase } = await import("./invoke-tally-devtools")
	const { useInvokePhaseEnd } = await import("./use-invoke-phase-end")
	const screen = renderHook(
		({ settledOn }: SettledScreen) => useInvokePhaseEnd(phase, settledOn),
		{ initialProps: { settledOn } as SettledScreen },
	)
	startInvokePhase(phase)
	printedLabels.mockClear()
	return screen
}

beforeEach(() => {
	printedLabels = vi.spyOn(console, "info").mockImplementation(() => {})
	vi.spyOn(console, "table").mockImplementation(() => {})
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("useInvokePhaseEnd", () => {
	it("ends a space switch once the switched space settles", async () => {
		const screen = await mountPhaseEnd("space switch", "space-a")

		screen.rerender({ settledOn: null })
		expect(printedLabels).not.toHaveBeenCalled()

		screen.rerender({ settledOn: "space-b" })
		expect(printedLabels).toHaveBeenCalledExactlyOnceWith(
			"invokes during space switch",
		)
	})

	it("ends a thread open when an already loaded thread shows at once", async () => {
		const screen = await mountPhaseEnd("thread open", "conversation-a")

		screen.rerender({ settledOn: "conversation-b" })

		expect(printedLabels).toHaveBeenCalledExactlyOnceWith(
			"invokes during thread open",
		)
	})
})
