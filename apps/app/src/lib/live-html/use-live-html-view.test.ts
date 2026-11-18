// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LIVE_HTML_MEASURED_EVENT, type LiveHtmlMeasured } from "@/lib/bindings"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type MeasuredHandler = (event: { payload: LiveHtmlMeasured }) => void

const host = vi.hoisted(() => ({
	answer: vi.fn(),
	listen: vi.fn(),
	stopListening: vi.fn(),
	reportFailure: vi.fn(),
	handlers: [] as MeasuredHandler[],
}))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: async (command: string) => host.answer(command),
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
	document.body.replaceChildren()
	vi.restoreAllMocks()
	host.answer.mockReset()
	mountAt.mockReset()
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

const STILL = "data:image/png;base64,c3RpbGw="
const BOX = { x: 10, y: 40, width: 300, height: 320 }
const IN_SIGHT = { rect: BOX, clip: BOX }
const OVER_THE_VIEW = new DOMRect(200, 300, 160, 28)
const BESIDE_THE_VIEW = new DOMRect(400, 300, 160, 28)
const DIALOG = '<div role="dialog" data-open></div>'
const TOOLTIP =
	'<div role="presentation" data-open><div data-slot="tooltip-content" data-open></div></div>'

const callsOf = () => host.answer.mock.calls.map(([command]) => command)

const nextFrame = () =>
	act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

const renderLiveView = async () => {
	const rendered = renderView("view-1")
	await subscribed()
	act(() => rendered.result.current.onPlacementChange(IN_SIGHT))
	await waitFor(() => expect(callsOf()).toEqual(["live_html_place"]))
	return rendered
}

const open = (markup: string) => {
	const layer = document.createElement("div")
	layer.innerHTML = markup
	document.body.append(layer)
	return layer
}

const openTooltipAt = (readRectangle: () => DOMRect) => {
	const [positioner] = open(TOOLTIP).children
	vi.spyOn(positioner, "getBoundingClientRect").mockImplementation(
		readRectangle,
	)
}

describe("the still of a live html view", () => {
	beforeEach(() => {
		mountAt.mockResolvedValue({ status: "ok", data: null })
		host.answer.mockImplementation(async (command: string) =>
			command === "live_html_still" ? STILL : null,
		)
	})

	it("stands in while a surface is open, and leaves once it closes", async () => {
		const { result, rerender } = await renderLiveView()

		const surface = open(DIALOG)
		await waitFor(() =>
			expect(callsOf().slice(1)).toEqual(["live_html_still", "live_html_hide"]),
		)
		expect(result.current.still).toBe(STILL)

		surface.remove()
		await waitFor(() => expect(result.current.still).toBeUndefined())
		rerender()

		expect(callsOf().slice(3)).toEqual(["live_html_show"])
		expect(result.current.still).toBeUndefined()
		expect(result.current.status).toBe("live")
	})

	it("reaches the slot before the view hides, which waits for the image to decode", async () => {
		const decoding = Promise.withResolvers<void>()
		vi.spyOn(HTMLImageElement.prototype, "decode").mockReturnValue(
			decoding.promise,
		)
		const { result } = await renderLiveView()

		open(DIALOG)
		await waitFor(() => expect(result.current.still).toBe(STILL))
		await nextFrame()
		expect(callsOf()).not.toContain("live_html_hide")

		decoding.resolve()
		await waitFor(() => expect(callsOf().at(-1)).toBe("live_html_hide"))
	})

	it("is taken again for each surface that opens", async () => {
		const { result } = await renderLiveView()

		const surface = open(DIALOG)
		await waitFor(() => expect(result.current.still).toBe(STILL))
		surface.remove()
		await waitFor(() => expect(result.current.still).toBeUndefined())
		open(DIALOG)
		await waitFor(() => expect(result.current.still).toBe(STILL))

		expect(
			callsOf().filter((command) => command === "live_html_still"),
		).toHaveLength(2)
	})

	it.each([
		["a context menu", '<div role="menu" data-open></div>'],
		["a popover, a sheet or a dialog", DIALOG],
		[
			"the mention menu",
			'<div data-slot="prompt-mention-menu"><div><div role="listbox"></div></div></div>',
		],
	])("is taken under %s", async (_surface, markup) => {
		const { result } = await renderLiveView()

		open(markup)

		await waitFor(() => expect(result.current.still).toBe(STILL))
	})

	it("is taken under a tooltip whose rectangle intersects the view", async () => {
		const { result } = await renderLiveView()

		openTooltipAt(() => OVER_THE_VIEW)

		await waitFor(() => expect(result.current.still).toBe(STILL))
	})

	it("is taken under a tooltip positioned over the view after it opened", async () => {
		const { result } = await renderLiveView()
		let rectangle = new DOMRect()

		openTooltipAt(() => rectangle)
		queueMicrotask(() => {
			rectangle = OVER_THE_VIEW
		})

		await waitFor(() => expect(result.current.still).toBe(STILL))
	})

	it("is not asked for under a tooltip beside the view", async () => {
		const { result } = await renderLiveView()

		openTooltipAt(() => BESIDE_THE_VIEW)
		await nextFrame()
		await nextFrame()

		expect(callsOf()).toEqual(["live_html_place"])
		expect(result.current.still).toBeUndefined()
	})
})
