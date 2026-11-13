// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { armLaunchRevealSafetyNet } from "./launch-reveal"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

const host = vi.hoisted(() => ({
	revealWindow: vi.fn(async () => undefined),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	revealWindow: host.revealWindow,
}))

vi.mock("@/components/workspace-layout", () => ({
	WorkspaceLayout: () => {
		throw new Error("the layout broke before the startup screen")
	},
}))

const { App } = await import("@/App")

const LATE_REVEAL_MS = 3000
const LATE_REVEAL_LOG = expect.stringContaining(
	"the startup screen did not show the window",
)

const loggedErrors = vi.spyOn(console, "error")

beforeEach(() => {
	vi.useFakeTimers()
	loggedErrors.mockImplementation(() => undefined)
})

afterEach(() => {
	cleanup()
	host.revealWindow.mockClear()
	loggedErrors.mockReset()
	vi.useRealTimers()
})

const wait = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

const launchWithBrokenLayout = async () => {
	armLaunchRevealSafetyNet()
	render(createElement(App), { wrapper: createQueryTestWrapper().wrapper })
	await wait(0)
}

it("shows the window anyway 3000 ms after the launch when the layout throws, and logs the late reveal", async () => {
	await launchWithBrokenLayout()
	await wait(LATE_REVEAL_MS - 1)

	expect(host.revealWindow).not.toHaveBeenCalled()
	expect(loggedErrors).not.toHaveBeenCalledWith(LATE_REVEAL_LOG)

	await wait(1)

	expect(host.revealWindow).toHaveBeenCalledExactlyOnceWith()
	expect(loggedErrors).toHaveBeenCalledWith(LATE_REVEAL_LOG)
})

it.each(["error", "unhandledrejection"])(
	"shows the window at once, and once only, when a window %s fires before the startup screen showed it",
	async (failure) => {
		await launchWithBrokenLayout()

		act(() => {
			window.dispatchEvent(new Event(failure))
		})

		expect(host.revealWindow).toHaveBeenCalledExactlyOnceWith()

		await wait(LATE_REVEAL_MS)

		expect(host.revealWindow).toHaveBeenCalledOnce()
		expect(loggedErrors).not.toHaveBeenCalledWith(LATE_REVEAL_LOG)
	},
)
