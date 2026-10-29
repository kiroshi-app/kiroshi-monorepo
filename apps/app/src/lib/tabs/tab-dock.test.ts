// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createOnThisComputerBus } from "./on-this-computer-test-bus"
import { createTabDock } from "./tab-dock"

import type { TabDrag } from "../bindings"

const host = vi.hoisted(() => ({
	windowReportSpace: vi.fn(),
	windowReportStrip: vi.fn(),
	readWindowOrigin: vi.fn(),
	revealWindow: vi.fn(),
	emitOnThisComputer: vi.fn(),
	listenOnThisComputer: vi.fn(),
}))

vi.mock("../bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("../bindings")>()
	return {
		...bindings,
		commands: {
			...bindings.commands,
			windowReportSpace: host.windowReportSpace,
			windowReportStrip: host.windowReportStrip,
		},
	}
})

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	readWindowOrigin: host.readWindowOrigin,
	revealWindow: host.revealWindow,
	emitOnThisComputer: host.emitOnThisComputer,
	listenOnThisComputer: host.listenOnThisComputer,
}))

const SPACE = "space-home"

const THIS_WINDOW = "window-1"

const ORIGIN_WINDOW = "main"

const HREF = "/?conversation=torn"

const ORIGIN_TAB = "torn"

const PACKED = {
	originTabId: ORIGIN_TAB,
	kept: { href: HREF, isPinned: false, entries: [HREF], index: 0 },
}

const STRIP = { x: 80, y: 0, width: 600, height: 36 }

const WINDOW_ORIGIN = { x: 1000, y: 200 }

const started = (originSpaceId = SPACE): TabDrag => ({
	kind: "started",
	originLabel: ORIGIN_WINDOW,
	originSpaceId,
	tab: PACKED,
})

const moved = (x: number, y: number): TabDrag => ({
	kind: "moved",
	originLabel: ORIGIN_WINDOW,
	point: { x, y },
})

const dropped = (x: number, y: number): TabDrag => ({
	kind: "dropped",
	originLabel: ORIGIN_WINDOW,
	point: { x, y },
})

const THIRD_WINDOW = "window-3"

const startedInThirdWindow: TabDrag = {
	kind: "started",
	originLabel: THIRD_WINDOW,
	originSpaceId: SPACE,
	tab: { ...PACKED, originTabId: "another-tab" },
}

const ORIGIN_ANSWER_WAIT_MS = 2000

const OVER_STRIP = { x: 1300, y: 215 }

const BELOW_STRIP = { x: 1300, y: 600 }

const mountStrip = (bounds = STRIP) => {
	document.body.replaceChildren()
	const strip = document.createElement("div")
	strip.dataset.slot = "title-bar-tabs"
	strip.getBoundingClientRect = () => DOMRect.fromRect(bounds)
	document.body.append(strip)
}

const answerOf = (isTaken: boolean) => [
	"window://tab-dock-answered",
	{ windowLabel: THIS_WINDOW, originTabId: ORIGIN_TAB, isTaken },
]

const SETTLE_EVENT = "window://tab-dock-settled"

let bus = createOnThisComputerBus()

const settleFromOrigin = (isTaken: boolean, move = {}) =>
	bus.emit(SETTLE_EVENT, {
		windowLabel: THIS_WINDOW,
		originTabId: ORIGIN_TAB,
		isTaken,
		...move,
	})

const answered = () =>
	vi.waitFor(() => expect(host.emitOnThisComputer).toHaveBeenCalled())

const dockOf = (shownSpaceId = SPACE) => {
	const receive = vi.fn()
	const dock = createTabDock({
		windowLabel: THIS_WINDOW,
		shownSpaceId: () => shownSpaceId,
		receive,
	})
	return { dock, receive }
}

const holding = (shownSpaceId = SPACE, originSpaceId = SPACE) => {
	const held = dockOf(shownSpaceId)
	held.dock.follow(started(originSpaceId))
	return held
}

beforeEach(() => {
	host.windowReportSpace.mockResolvedValue(undefined)
	host.windowReportStrip.mockResolvedValue(undefined)
	host.readWindowOrigin.mockReturnValue(WINDOW_ORIGIN)
	host.revealWindow.mockResolvedValue(undefined)
	bus = createOnThisComputerBus()
	host.emitOnThisComputer.mockImplementation(bus.emit)
	host.listenOnThisComputer.mockImplementation(bus.listen)
	mountStrip()
})

afterEach(() => {
	vi.useRealTimers()
	document.body.replaceChildren()
	for (const mock of Object.values(host)) {
		mock.mockReset()
	}
})

describe("a tab drag started in another window", () => {
	it("reports the shown Space and the strip bounds of this window to the host", () => {
		const { dock } = dockOf()

		dock.follow(started())

		expect(host.windowReportSpace).toHaveBeenCalledExactlyOnceWith(SPACE)
		expect(host.windowReportStrip).toHaveBeenCalledExactlyOnceWith(STRIP)
	})

	it("ignores a drag started in this window", () => {
		const { dock } = dockOf()

		dock.follow({ ...started(), originLabel: THIS_WINDOW })

		expect(host.windowReportSpace).not.toHaveBeenCalled()
	})
})

describe("the pointer over the strip during a drag of the same Space", () => {
	it("parts the strip at the pointer x with the incoming tab", async () => {
		const { dock } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))

		expect(dock.getState()).toMatchObject({
			tab: { isPinned: false, entries: [{ href: HREF }] },
			clientX: 300,
		})
	})

	it("closes the parting once the pointer leaves the strip", async () => {
		const { dock } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(moved(BELOW_STRIP.x, BELOW_STRIP.y))

		expect(dock.getState()).toBeNull()
	})

	it("closes the parting when the drag is cancelled", async () => {
		const { dock } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow({ kind: "cancelled", originLabel: ORIGIN_WINDOW })

		expect(dock.getState()).toBeNull()
	})
})

describe("a drag of another Space", () => {
	it("never parts the strip, answers not taken and takes nothing on drop", async () => {
		const { dock, receive } = holding(SPACE, "space-away")

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledExactlyOnceWith(
				...answerOf(false),
			),
		)
		expect(dock.getState()).toBeNull()
		expect(receive).not.toHaveBeenCalled()
	})
})

describe("the settle of a held drag", () => {
	it("is heard as soon as this window holds the drag, before any drop", async () => {
		holding()

		await vi.waitFor(() => expect(bus.listenerCount()).toBe(1))
		expect(host.emitOnThisComputer).not.toHaveBeenCalled()
	})

	it.each([false, true])(
		"ends the hold when heard before the drop (taken: %s), so the drop answers and takes nothing",
		async (isTaken) => {
			const { dock, receive } = holding()

			dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
			await vi.waitFor(() => expect(bus.listenerCount()).toBe(1))
			await settleFromOrigin(isTaken)
			await vi.waitFor(() => expect(dock.getState()).toBeNull())
			dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

			expect(host.emitOnThisComputer).not.toHaveBeenCalled()
			expect(receive).not.toHaveBeenCalled()
			expect(bus.listenerCount()).toBe(0)
		},
	)

	it("stops being heard when the drag is cancelled", async () => {
		const { dock } = holding()
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(1))

		dock.follow({ kind: "cancelled", originLabel: ORIGIN_WINDOW })

		await vi.waitFor(() => expect(bus.listenerCount()).toBe(0))
	})
})

describe("a tab dropped on the parted strip", () => {
	it("answers taken and holds the tab without inserting it until the origin settles", async () => {
		const { dock, receive } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()

		expect(dock.getState()).toBeNull()
		expect(host.emitOnThisComputer).toHaveBeenCalledExactlyOnceWith(
			...answerOf(true),
		)
		expect(receive).not.toHaveBeenCalled()
		expect(host.revealWindow).not.toHaveBeenCalled()
	})

	it("takes the tab at the parted index and focuses this window once the origin settles it taken", async () => {
		const { dock, receive } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.placeIncoming(2)
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await settleFromOrigin(true)

		await vi.waitFor(() =>
			expect(host.revealWindow).toHaveBeenCalledExactlyOnceWith({
				withFocus: true,
			}),
		)
		expect(receive).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				entries: [expect.objectContaining({ href: HREF })],
			}),
			2,
		)
		expect(bus.listenerCount()).toBe(0)
	})

	it("takes nothing and stops listening when the origin settles it reclaimed", async () => {
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await settleFromOrigin(false)
		await settleFromOrigin(true)

		expect(receive).not.toHaveBeenCalled()
		expect(host.revealWindow).not.toHaveBeenCalled()
		expect(bus.listenerCount()).toBe(0)
	})

	it("takes it once when the settle arrives twice", async () => {
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await settleFromOrigin(true)
		await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce())
		await settleFromOrigin(true)

		expect(receive).toHaveBeenCalledOnce()
	})

	it("ignores a settle addressed to another window or another tab", async () => {
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await settleFromOrigin(true, { windowLabel: "window-2" })
		await settleFromOrigin(true, { originTabId: "another-tab" })

		expect(receive).not.toHaveBeenCalled()
		expect(bus.listenerCount()).toBe(1)
	})

	it("keeps hearing the settle of a taken tab when another window starts a drag before it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		dock.follow(startedInThirdWindow)
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(2))
		await settleFromOrigin(true)
		await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce())
		await settleFromOrigin(true)

		expect(receive).toHaveBeenCalledOnce()
		expect(bus.listenerCount()).toBe(1)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("keeps hearing the settle of a taken tab when a third window cancels its drag before it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		dock.follow({ kind: "cancelled", originLabel: THIRD_WINDOW })
		await vi.advanceTimersByTimeAsync(0)
		await settleFromOrigin(true)
		await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce())
		await settleFromOrigin(true)

		expect(receive).toHaveBeenCalledOnce()
		expect(bus.listenerCount()).toBe(0)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("takes nothing and stops listening once the origin stays silent past its own answer wait", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1))
		await vi.advanceTimersByTimeAsync(ORIGIN_ANSWER_WAIT_MS)
		expect(bus.listenerCount()).toBe(1)
		await vi.advanceTimersByTimeAsync(ORIGIN_ANSWER_WAIT_MS)
		await settleFromOrigin(true)

		expect(receive).not.toHaveBeenCalled()
		expect(bus.listenerCount()).toBe(0)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("takes it once when the drop reaches two listeners", async () => {
		const { dock, receive } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		await answered()
		await settleFromOrigin(true)

		await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce())
		expect(host.emitOnThisComputer).toHaveBeenCalledOnce()
	})

	it("answers not taken, holds nothing and takes nothing when dropped off the strip", async () => {
		const { dock, receive } = holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(BELOW_STRIP.x, BELOW_STRIP.y))

		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledExactlyOnceWith(
				...answerOf(false),
			),
		)
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(0))
		await settleFromOrigin(true)
		expect(receive).not.toHaveBeenCalled()
		expect(host.revealWindow).not.toHaveBeenCalled()
	})

	it("takes nothing and stops listening when its answer cannot be sent", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		host.emitOnThisComputer.mockRejectedValue(new Error("no channel"))
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		await answered()
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(0))
		await settleFromOrigin(true)
		expect(receive).not.toHaveBeenCalled()
	})

	it("answers nothing and takes nothing when it cannot listen for the settle", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		host.listenOnThisComputer.mockRejectedValue(new Error("no channel"))
		const { dock, receive } = holding()

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
		expect(host.emitOnThisComputer).not.toHaveBeenCalled()
		expect(receive).not.toHaveBeenCalled()
	})
})

describe("the drop decision", () => {
	it("measures the strip at the drop, not at the start of the drag", async () => {
		const { dock, receive } = holding()
		mountStrip({ ...STRIP, y: 400 })

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledExactlyOnceWith(
				...answerOf(false),
			),
		)
		expect(receive).not.toHaveBeenCalled()
	})

	it("reads the window origin again when the window moved during the drag", async () => {
		const { dock, receive } = holding()
		host.readWindowOrigin.mockReturnValue({ x: 0, y: 0 })

		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledExactlyOnceWith(
				...answerOf(false),
			),
		)
		expect(receive).not.toHaveBeenCalled()
	})
})
