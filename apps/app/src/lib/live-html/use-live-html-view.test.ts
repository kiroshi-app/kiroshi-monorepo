// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"

import {
	LIVE_HTML_LOADED_EVENT,
	LIVE_HTML_MEASURED_EVENT,
	type LiveHtmlError,
	type LiveHtmlLoaded,
	type LiveHtmlMeasured,
	type LiveHtmlTheme,
} from "@/lib/bindings"
import {
	type LiveHtmlViewNeeds,
	useLiveHtmlView,
} from "@/lib/live-html/use-live-html-view"
import type { WorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

type MeasuredHandler = (event: { payload: LiveHtmlMeasured }) => void

type LoadedHandler = (event: { payload: LiveHtmlLoaded }) => void

const host = vi.hoisted(() => ({
	answer: vi.fn(),
	listen: vi.fn(),
	stopListening: vi.fn(),
	reportFailure: vi.fn(),
	handlers: [] as MeasuredHandler[],
	loadedHandlers: [] as LoadedHandler[],
}))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: async (command: string, args: unknown) => host.answer(command, args),
}))

vi.mock("@/lib/host/window-listen", () => ({
	listenOnThisWindow: host.listen,
}))

vi.mock("@/lib/failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/failure-report")>()),
	failureReporterIn: () => host.reportFailure,
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseTransientNotice: vi.fn(() => "notice"),
}))

const listenFor = (event: string, handler: MeasuredHandler & LoadedHandler) => {
	if (event === LIVE_HTML_MEASURED_EVENT) host.handlers.push(handler)
	if (event === LIVE_HTML_LOADED_EVENT) host.loadedHandlers.push(handler)
	return Promise.resolve(() => host.stopListening(event))
}

beforeEach(() => {
	host.listen.mockImplementation(listenFor)
})

afterEach(() => {
	cleanup()
	document.body.replaceChildren()
	vi.restoreAllMocks()
	vi.mocked(raiseTransientNotice).mockClear()
	host.answer.mockReset()
	mountAt.mockReset()
	host.listen.mockReset()
	host.stopListening.mockReset()
	host.reportFailure.mockReset()
	host.handlers = []
	host.loadedHandlers = []
})

const mountAt = vi.fn()

const measure = (id: string, height: number | null) =>
	act(() => {
		for (const handler of host.handlers) {
			handler({ payload: { id, width: 600, height } })
		}
	})

const load = (id: string, failure: LiveHtmlError | null = null) =>
	act(() => {
		for (const handler of host.loadedHandlers) {
			handler({ payload: { id, failure } })
		}
	})

const LIGHT: LiveHtmlTheme = { appearance: "light", hue: null }

const REFUSAL_NOTICE = "Couldn’t show the live view."

const renderView = (
	id: string,
	onFailed?: () => void,
	theme: LiveHtmlTheme = LIGHT,
	wrapper?: (props: { children: ReactNode }) => ReactNode,
) => {
	vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
		id as ReturnType<typeof crypto.randomUUID>,
	)
	const needs: LiveHtmlViewNeeds = { refusalNotice: REFUSAL_NOTICE, onFailed }
	return renderHook(
		(worn: LiveHtmlTheme) => useLiveHtmlView(mountAt, worn, needs),
		{ initialProps: theme, wrapper },
	)
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

		rerender(LIGHT)
		rerender(LIGHT)
		await subscribed()

		expect(host.listen).toHaveBeenCalledTimes(2)
		expect(host.listen).toHaveBeenCalledWith(
			LIVE_HTML_MEASURED_EVENT,
			expect.any(Function),
		)
		expect(host.listen).toHaveBeenCalledWith(
			LIVE_HTML_LOADED_EVENT,
			expect.any(Function),
		)
	})

	it("stops listening on unmount and ignores a size arriving after it", async () => {
		const { result, unmount } = renderView("view-1")
		await subscribed()
		measure("view-1", 700)

		unmount()
		await subscribed()
		measure("view-1", 1500)

		expect(host.stopListening).toHaveBeenCalledWith(LIVE_HTML_MEASURED_EVENT)
		expect(result.current.height).toBe(700)
	})

	it("stops listening once subscribed when it unmounts first", async () => {
		const { unmount } = renderView("view-1")

		unmount()
		await subscribed()

		expect(host.stopListening).toHaveBeenCalledWith(LIVE_HTML_MEASURED_EVENT)
	})

	it("falls back to the chip and the notice when it cannot listen", async () => {
		const onFailed = vi.fn()
		host.listen.mockRejectedValue(new Error("no event channel"))

		const { result } = renderView("view-1", onFailed)
		await subscribed()

		expect(result.current.status).toBe("unavailable")
		expect(onFailed).toHaveBeenCalledTimes(1)
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
	load("view-1")
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
		rerender(LIGHT)

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

	it("leaves the slot when its image cannot be decoded, and the view hides", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValue(
			new Error("the image cannot be decoded"),
		)
		const { result } = await renderLiveView()

		open(DIALOG)
		await waitFor(() => expect(callsOf().at(-1)).toBe("live_html_hide"))

		expect(result.current.still).toBeUndefined()
		expect(console.error).toHaveBeenCalledTimes(1)
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

describe("the theme of a live html view", () => {
	const DARK: LiveHtmlTheme = { appearance: "dark", hue: null }
	const DARK_RED: LiveHtmlTheme = { appearance: "dark", hue: 1 }

	const themesSent = () =>
		host.answer.mock.calls
			.filter(([command]) => command === "live_html_theme")
			.map(([, args]) => args)

	beforeEach(() => {
		mountAt.mockResolvedValue({ status: "ok", data: null })
		host.answer.mockResolvedValue(null)
	})

	it("mounts in its theme, then rethemes in place on each change", async () => {
		const { result, rerender } = await renderLiveView()
		expect(mountAt).toHaveBeenCalledWith("view-1", BOX, LIGHT)

		rerender(DARK)
		await waitFor(() =>
			expect(themesSent()).toEqual([{ id: "view-1", theme: DARK }]),
		)

		rerender(DARK_RED)
		await waitFor(() =>
			expect(themesSent()).toEqual([
				{ id: "view-1", theme: DARK },
				{ id: "view-1", theme: DARK_RED },
			]),
		)
		expect(mountAt).toHaveBeenCalledTimes(1)
		expect(callsOf()).not.toContain("live_html_remove")
		expect(result.current.status).toBe("live")
	})

	it("sends no theme while the theme stays the same across renders", async () => {
		const { rerender } = await renderLiveView()

		rerender({ ...LIGHT })
		rerender({ ...LIGHT })
		await subscribed()

		expect(themesSent()).toEqual([])
	})

	it("turns unavailable when the theme is refused", async () => {
		host.answer.mockImplementation(async (command: string) => {
			if (command === "live_html_theme") throw { kind: "unknownView" }
			return null
		})
		const { result, rerender } = await renderLiveView()

		rerender(DARK)

		await waitFor(() => expect(result.current.status).toBe("unavailable"))
		expect(host.reportFailure).toHaveBeenCalledTimes(1)
	})
})

const EXPECTED_REFUSALS: LiveHtmlError[] = [
	{ kind: "notAvailableHere" },
	{ kind: "outsideAttachments" },
	{ kind: "notHtml" },
	{ kind: "unreadable", detail: "No such file or directory" },
]

const UNEXPECTED_FAILURES: LiveHtmlError[] = [
	{ kind: "unknownView", id: "view-1" },
	{ kind: "alreadyShown", id: "view-1" },
	{ kind: "invalidRectangle" },
	{ kind: "invalidRadius" },
	{ kind: "mainWindowMissing" },
	{ kind: "unserved", detail: "address in use" },
	{ kind: "unplaced", detail: "no superview" },
]

const refusedMount = (error: unknown) =>
	mountAt.mockResolvedValue({ status: "error", error })

const rejectedMount = (reason: unknown) => mountAt.mockRejectedValue(reason)

const placeEarly = async (rendered: ReturnType<typeof renderView>) => {
	await subscribed()
	act(() => rendered.result.current.onPlacementChange(IN_SIGHT))
	await subscribed()
}

const placeInSight = async (rendered: ReturnType<typeof renderView>) => {
	await placeEarly(rendered)
	await waitFor(() => expect(mountAt).toHaveBeenCalledTimes(1))
}

const workspaceOnSpace = (initialSpaceRowId: string) => {
	let spaceRowId = initialSpaceRowId
	const workspace = {
		core: {
			roster: { controller: { getState: () => ({ spaceRowId }) } },
		},
	} as unknown as WorkspaceAssembly
	return {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(WorkspaceContext, { value: workspace }, children),
		switchTo: (next: string) => {
			spaceRowId = next
		},
	}
}

const listenToLoadWith = (registering: Promise<() => void>) =>
	host.listen.mockImplementation(
		(event: string, handler: MeasuredHandler & LoadedHandler) =>
			event === LIVE_HTML_LOADED_EVENT
				? registering.then((stopListening) => {
						host.loadedHandlers.push(handler)
						return stopListening
					})
				: listenFor(event, handler),
	)

describe("the load of a live html view", () => {
	beforeEach(() => {
		mountAt.mockResolvedValue({ status: "ok", data: null })
		host.answer.mockResolvedValue(null)
	})

	it("stays loading once mounted, until its own page has loaded", async () => {
		const rendered = renderView("view-1")
		await placeInSight(rendered)
		await waitFor(() => expect(callsOf()).toEqual(["live_html_place"]))

		expect(rendered.result.current.status).toBe("loading")

		load("view-2")
		expect(rendered.result.current.status).toBe("loading")

		load("view-1")
		expect(rendered.result.current.status).toBe("live")
	})

	it("mounts only once its loaded listener is registered, however late", async () => {
		const registering = Promise.withResolvers<() => void>()
		listenToLoadWith(registering.promise)
		const rendered = renderView("view-1")
		await placeEarly(rendered)

		expect(mountAt).not.toHaveBeenCalled()

		registering.resolve(() => host.stopListening(LIVE_HTML_LOADED_EVENT))

		await waitFor(() => expect(mountAt).toHaveBeenCalledTimes(1))
		load("view-1")
		expect(rendered.result.current.status).toBe("live")
	})

	it("fails the view, without mounting it, when its loaded listener cannot register", async () => {
		const onFailed = vi.fn()
		listenToLoadWith(Promise.reject(new Error("no event channel")))
		const rendered = renderView("view-1", onFailed)
		await placeEarly(rendered)

		await waitFor(() =>
			expect(rendered.result.current.status).toBe("unavailable"),
		)
		expect(mountAt).not.toHaveBeenCalled()
		expect(host.reportFailure).toHaveBeenCalledTimes(1)
		expect(onFailed).toHaveBeenCalledTimes(1)
	})

	it("loads again on each new mount after a remove", async () => {
		const rendered = renderView("view-1")
		await placeInSight(rendered)
		load("view-1")
		expect(rendered.result.current.status).toBe("live")

		act(() => rendered.result.current.onPlacementChange(null))
		await waitFor(() => expect(callsOf()).toContain("live_html_remove"))
		act(() => rendered.result.current.onPlacementChange(IN_SIGHT))

		await waitFor(() => expect(mountAt).toHaveBeenCalledTimes(2))
		expect(rendered.result.current.status).toBe("loading")

		load("view-1")
		expect(rendered.result.current.status).toBe("live")
	})

	it("mounts nothing and leaves no listener when it unmounts before its listener registers", async () => {
		const registering = Promise.withResolvers<() => void>()
		listenToLoadWith(registering.promise)
		const rendered = renderView("view-1")
		await placeEarly(rendered)

		rendered.unmount()
		registering.resolve(() => host.stopListening(LIVE_HTML_LOADED_EVENT))
		await subscribed()
		await subscribed()

		expect(mountAt).not.toHaveBeenCalled()
		expect(host.stopListening).toHaveBeenCalledWith(LIVE_HTML_LOADED_EVENT)
	})

	it("stops listening to the load on unmount and ignores a load arriving after it", async () => {
		const { result, unmount } = renderView("view-1")
		await subscribed()

		unmount()
		await subscribed()
		load("view-1")

		expect(host.stopListening).toHaveBeenCalledWith(LIVE_HTML_LOADED_EVENT)
		expect(result.current.status).toBe("loading")
	})

	it.each(EXPECTED_REFUSALS)(
		"raises a notice and no report when the page answers the expected refusal $kind",
		async (refusal) => {
			const onFailed = vi.fn()
			const rendered = renderView("view-1", onFailed)
			await placeInSight(rendered)

			load("view-1", refusal)

			await waitFor(() =>
				expect(rendered.result.current.status).toBe("unavailable"),
			)
			expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
			expect(raiseTransientNotice).toHaveBeenCalledWith(
				expect.objectContaining({ title: REFUSAL_NOTICE }),
			)
			expect(host.reportFailure).not.toHaveBeenCalled()
			expect(onFailed).not.toHaveBeenCalled()
			await waitFor(() => expect(callsOf()).toContain("live_html_remove"))
		},
	)

	it.each(UNEXPECTED_FAILURES)(
		"keeps raising a report when the page answers the unexpected failure $kind",
		async (failure) => {
			const onFailed = vi.fn()
			const rendered = renderView("view-1", onFailed)
			await placeInSight(rendered)

			load("view-1", failure)

			await waitFor(() =>
				expect(rendered.result.current.status).toBe("unavailable"),
			)
			expect(host.reportFailure).toHaveBeenCalledTimes(1)
			expect(host.reportFailure).toHaveBeenCalledWith(expect.anything(), {
				reason: failure,
			})
			expect(onFailed).toHaveBeenCalledTimes(1)
			expect(raiseTransientNotice).not.toHaveBeenCalled()
		},
	)

	it("raises a notice and no report when the mount is refused for an expected reason", async () => {
		refusedMount({ kind: "notHtml" })
		const rendered = renderView("view-1")
		await placeInSight(rendered)

		await waitFor(() =>
			expect(rendered.result.current.status).toBe("unavailable"),
		)
		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
		expect(host.reportFailure).not.toHaveBeenCalled()
	})

	it.each([
		[
			"refused for an unexpected reason",
			() => refusedMount({ kind: "mainWindowMissing" }),
		],
		[
			"rejected with something else than a refusal",
			() => rejectedMount(new Error("ipc closed")),
		],
		["rejected with an unknown kind", () => rejectedMount({ kind: "tooBig" })],
	])(
		"keeps raising a report when the mount is %s",
		async (_case, failMount) => {
			failMount()
			const onFailed = vi.fn()
			const rendered = renderView("view-1", onFailed)
			await placeInSight(rendered)

			await waitFor(() =>
				expect(rendered.result.current.status).toBe("unavailable"),
			)
			expect(host.reportFailure).toHaveBeenCalledTimes(1)
			expect(onFailed).toHaveBeenCalledTimes(1)
			expect(raiseTransientNotice).not.toHaveBeenCalled()
		},
	)

	it("logs an expected refusal and raises no notice once its Space left the screen", async () => {
		const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const workspace = workspaceOnSpace("space-a")
		const rendered = renderView("view-1", undefined, LIGHT, workspace.wrapper)
		await placeInSight(rendered)

		workspace.switchTo("space-b")
		load("view-1", { kind: "notHtml" })

		await waitFor(() =>
			expect(rendered.result.current.status).toBe("unavailable"),
		)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(host.reportFailure).not.toHaveBeenCalled()
		expect(logged).toHaveBeenCalledWith(expect.stringContaining("notHtml"))
	})

	it("raises the notice of an expected refusal while its Space is on screen", async () => {
		const workspace = workspaceOnSpace("space-a")
		const rendered = renderView("view-1", undefined, LIGHT, workspace.wrapper)
		await placeInSight(rendered)

		load("view-1", { kind: "notHtml" })

		await waitFor(() => expect(raiseTransientNotice).toHaveBeenCalledTimes(1))
	})
})
