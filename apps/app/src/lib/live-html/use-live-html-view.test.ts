// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LIVE_HTML_MEASURED_EVENT, type LiveHtmlMeasured } from "@/lib/bindings"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type MeasuredHandler = (event: { payload: LiveHtmlMeasured }) => void

const host = vi.hoisted(() => ({
	listen: vi.fn(),
	stopListening: vi.fn(),
	reportFailure: vi.fn(),
	handlers: [] as MeasuredHandler[],
}))

vi.mock("@/lib/host/window-listen", () => ({
	listenOnThisWindow: host.listen,
}))

vi.mock("@/lib/failure-report", () => ({
	failureReporterIn: () => host.reportFailure,
}))

const listenFor = (event: string, handler: MeasuredHandler) => {
	if (event === LIVE_HTML_MEASURED_EVENT) host.handlers.push(handler)
	return Promise.resolve(host.stopListening)
}

beforeEach(() => {
	host.listen.mockImplementation(listenFor)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	host.listen.mockReset()
	host.stopListening.mockReset()
	host.reportFailure.mockReset()
	host.handlers = []
})

const mountAt = vi.fn()

const measure = (id: string, height: number | null) =>
	act(() => {
		for (const handler of host.handlers) {
			handler({ payload: { id, width: 600, height } })
		}
	})

const renderView = (id: string, onUnavailable?: () => void) => {
	vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
		id as ReturnType<typeof crypto.randomUUID>,
	)
	return renderHook(() => useLiveHtmlView(mountAt, onUnavailable))
}

const subscribed = () =>
	act(async () => {
		await Promise.resolve()
	})

describe("the height of a live html view", () => {
	it("stays undefined while no size was measured", async () => {
		const { result } = renderView("view-1")
		await subscribed()

		expect(result.current.height).toBeUndefined()
	})

	it("takes the height measured for its own view", async () => {
		const { result } = renderView("view-1")
		await subscribed()

		measure("view-1", 1840)

		expect(result.current.height).toBe(1840)
	})

	it("follows the page when it grows or shrinks later", async () => {
		const { result } = renderView("view-1")
		await subscribed()

		measure("view-1", 1840)
		measure("view-1", 2210)
		expect(result.current.height).toBe(2210)

		measure("view-1", 640)
		expect(result.current.height).toBe(640)
	})

	it("leaves the other views alone when the size is for another view", async () => {
		const first = renderView("view-1")
		const second = renderView("view-2")
		await subscribed()

		measure("view-1", 1200)
		measure("view-2", 480)
		measure("view-3", 900)

		expect(first.result.current.height).toBe(1200)
		expect(second.result.current.height).toBe(480)
	})

	it.each([null, 0, -20, Number.NaN, Number.POSITIVE_INFINITY])(
		"ignores a measured height of %s",
		async (height) => {
			const { result } = renderView("view-1")
			await subscribed()
			measure("view-1", 900)

			measure("view-1", height)

			expect(result.current.height).toBe(900)
		},
	)

	it("subscribes once, however often the view renders", async () => {
		const { rerender } = renderView("view-1")
		await subscribed()

		rerender()
		rerender()
		await subscribed()

		expect(host.listen).toHaveBeenCalledTimes(1)
	})

	it("stops listening on unmount and ignores a size arriving after it", async () => {
		const { result, unmount } = renderView("view-1")
		await subscribed()
		measure("view-1", 700)

		unmount()
		await subscribed()
		measure("view-1", 1500)

		expect(host.stopListening).toHaveBeenCalledTimes(1)
		expect(result.current.height).toBe(700)
	})

	it("stops listening once subscribed when it unmounts first", async () => {
		const { unmount } = renderView("view-1")

		unmount()
		await subscribed()

		expect(host.stopListening).toHaveBeenCalledTimes(1)
	})

	it("falls back to the chip and the notice when it cannot listen", async () => {
		const onUnavailable = vi.fn()
		host.listen.mockRejectedValue(new Error("no event channel"))

		const { result } = renderView("view-1", onUnavailable)
		await subscribed()

		expect(result.current.status).toBe("unavailable")
		expect(onUnavailable).toHaveBeenCalledTimes(1)
		expect(host.reportFailure).toHaveBeenCalledTimes(1)
	})
})
