import { describe, expect, it, vi } from "vitest"

import { createHomeEntries } from "@/lib/home/home-entries"
import { watchWindowFocus } from "@/lib/host/index"

vi.mock("@/lib/host/index", () => ({
	watchWindowFocus: vi.fn(),
}))

const followFocusFrom = (initiallyFocused: boolean) => {
	let report: (isFocused: boolean) => void = () => undefined
	vi.mocked(watchWindowFocus).mockImplementation((reported) => {
		report = reported
		reported(initiallyFocused)
		return Promise.resolve(() => undefined)
	})
	const entries = createHomeEntries()
	entries.followWindowReturns()
	return { entries, report: (isFocused: boolean) => report(isFocused) }
}

describe("the Home entries of a window", () => {
	it("counts no entry for the focus reported when it starts following", () => {
		const { entries } = followFocusFrom(true)

		expect(entries.getState()).toBe(0)
	})

	it("counts no entry when the window loses focus", () => {
		const { entries, report } = followFocusFrom(true)

		report(false)

		expect(entries.getState()).toBe(0)
	})

	it("counts one entry each time the window regains focus", () => {
		const { entries, report } = followFocusFrom(true)

		report(false)
		report(true)
		report(true)
		report(false)
		report(true)

		expect(entries.getState()).toBe(2)
	})
})
