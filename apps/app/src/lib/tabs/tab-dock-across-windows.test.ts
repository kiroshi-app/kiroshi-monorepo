// @vitest-environment happy-dom

import { PhysicalPosition } from "@tauri-apps/api/dpi"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createOnThisComputerBus } from "./on-this-computer-test-bus"
import { createTabDock } from "./tab-dock"
import { answerDock } from "./tab-dock-channel"
import { createTabTearOff, type TabTearOff } from "./tab-tear-off"

import type { ScreenPosition, TabDrag } from "../bindings"

const host = vi.hoisted(() => ({
	windowTabDragStart: vi.fn(),
	windowTabDragMove: vi.fn(),
	windowTabDragDrop: vi.fn(),
	windowTabDragCancel: vi.fn(),
	windowStripAt: vi.fn(),
	windowReportSpace: vi.fn(),
	windowReportStrip: vi.fn(),
	dragGhostShow: vi.fn(),
	dragGhostHide: vi.fn(),
	getCurrentWindow: vi.fn(),
	revealWindow: vi.fn(),
	emitOnThisComputer: vi.fn(),
	listenOnThisComputer: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("../bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("../bindings")>()
	return {
		...bindings,
		commands: {
			...bindings.commands,
			windowTabDragStart: host.windowTabDragStart,
			windowTabDragMove: host.windowTabDragMove,
			windowTabDragDrop: host.windowTabDragDrop,
			windowTabDragCancel: host.windowTabDragCancel,
			windowStripAt: host.windowStripAt,
			windowReportSpace: host.windowReportSpace,
			windowReportStrip: host.windowReportStrip,
			dragGhostShow: host.dragGhostShow,
			dragGhostHide: host.dragGhostHide,
		},
	}
})

vi.mock("@tauri-apps/api/window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/window")>()),
	getCurrentWindow: host.getCurrentWindow,
}))

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	revealWindow: host.revealWindow,
	emitOnThisComputer: host.emitOnThisComputer,
	listenOnThisComputer: host.listenOnThisComputer,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

const SPACE = "space-home"

const ORIGIN_WINDOW = "main"

const TARGET_WINDOW = "window-1"

const TAB_ID = "torn"

const HREF = "/?conversation=torn"

const PACKED = {
	originTabId: TAB_ID,
	kept: { href: HREF, isPinned: false, entries: [HREF], index: 0 },
}

const ACCEPTED = { status: "ok", data: null }

const UNSUPPORTED = { status: "ok", data: { supported: false } }

const STRIP = { x: 80, y: 0, width: 600, height: 36 }

const WINDOW_ORIGIN = { x: 1000, y: 200 }

const SCALE = 2

const SCREEN_PLACE_SEEN_BY_WEBKIT = { x: 0, y: 1080 }

const OVER_STRIP = { x: 1300, y: 215 }

const BELOW_STRIP = { x: 1300, y: 600 }

const DOCK_WAIT_MS = 2000

const ANSWER_EVENT = "window://tab-dock-answered"

const SETTLE_EVENT = "window://tab-dock-settled"

const OFFER_EVENT = "window://tab-dock-offered"

const REFUSED_DROP = { status: "error", error: { kind: "Unavailable" } }

const MOVE_FAILURE_LOG = `the tab ${TAB_ID} did not move from ${ORIGIN_WINDOW} to ${TARGET_WINDOW}: `

let bus = createOnThisComputerBus()

let errors = vi.spyOn(console, "error")

const GHOST_TAB = { tabId: TAB_ID, href: HREF, title: "Release notes" }

const startedInOrigin: TabDrag = {
	kind: "started",
	originLabel: ORIGIN_WINDOW,
	originSpaceId: SPACE,
	tab: PACKED,
}

const movedTo = (point: ScreenPosition): TabDrag => ({
	kind: "moved",
	originLabel: ORIGIN_WINDOW,
	point,
})

const droppedAt = (point: ScreenPosition): TabDrag => ({
	kind: "dropped",
	originLabel: ORIGIN_WINDOW,
	point,
})

const at = (screenX: number, screenY: number): TabTearOff => ({
	tabId: TAB_ID,
	screenX,
	screenY,
})

const placeWindows = () => {
	host.getCurrentWindow.mockReturnValue({
		label: ORIGIN_WINDOW,
		innerPosition: async () =>
			new PhysicalPosition(WINDOW_ORIGIN.x * SCALE, WINDOW_ORIGIN.y * SCALE),
		scaleFactor: async () => SCALE,
	})
	Object.defineProperty(window, "screenX", {
		configurable: true,
		value: SCREEN_PLACE_SEEN_BY_WEBKIT.x,
	})
	Object.defineProperty(window, "screenY", {
		configurable: true,
		value: SCREEN_PLACE_SEEN_BY_WEBKIT.y,
	})
}

const mountStrip = () => {
	const strip = document.createElement("div")
	strip.dataset.slot = "title-bar-tabs"
	strip.getBoundingClientRect = () => DOMRect.fromRect(STRIP)
	document.body.replaceChildren(strip)
}

const twoWindows = () => {
	const receive = vi.fn()
	const target = createTabDock(
		{
			windowLabel: TARGET_WINDOW,
			shownSpaceId: () => SPACE,
			receive,
		},
		async () => () => undefined,
	)
	const removeDocked = vi.fn()
	const origin = createTabTearOff({
		moveUnghosted: vi.fn(),
		moveTornOff: vi.fn(),
		raiseMoveFailure: vi.fn(),
		tornTabOf: () => ({ packed: PACKED, spaceId: SPACE, isOnlyTab: false }),
		removeDocked,
	})
	host.windowTabDragStart.mockImplementation(async () => {
		target.follow(startedInOrigin)
		return ACCEPTED
	})
	return { origin, target, receive, removeDocked }
}

type TwoWindows = ReturnType<typeof twoWindows>

const dropCommandReached = () =>
	new Promise<void>((resolve) => {
		host.windowTabDragDrop.mockImplementation(async () => {
			resolve()
			return ACCEPTED
		})
	})

const dropFromOrigin = ({ origin }: TwoWindows) => {
	const dropReached = dropCommandReached()
	origin.start(at(10, 10), () => GHOST_TAB)
	origin.drop(at(OVER_STRIP.x, OVER_STRIP.y))
	return dropReached
}

const targetDrops = ({ target }: TwoWindows, point = OVER_STRIP) =>
	target.follow(droppedAt(point))

const settlesSent = () =>
	host.emitOnThisComputer.mock.calls.filter(([event]) => event === SETTLE_EVENT)

const moveFailureLogs = () =>
	errors.mock.calls.filter(
		([line]) => typeof line === "string" && line.startsWith(MOVE_FAILURE_LOG),
	)

const waitPastTheDockWait = async () => {
	await vi.advanceTimersByTimeAsync(DOCK_WAIT_MS)
	expect(vi.getTimerCount()).toBe(0)
	vi.useRealTimers()
}

beforeEach(() => {
	errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	bus = createOnThisComputerBus()
	host.emitOnThisComputer.mockImplementation(bus.emit)
	host.listenOnThisComputer.mockImplementation(bus.listen)
	host.windowStripAt.mockResolvedValue({ label: TARGET_WINDOW, spaceId: SPACE })
	host.windowTabDragCancel.mockResolvedValue(ACCEPTED)
	host.windowReportSpace.mockResolvedValue(undefined)
	host.windowReportStrip.mockResolvedValue(undefined)
	host.dragGhostShow.mockResolvedValue(UNSUPPORTED)
	host.dragGhostHide.mockResolvedValue(UNSUPPORTED)
	host.windowTabDragMove.mockResolvedValue(ACCEPTED)
	host.revealWindow.mockResolvedValue(undefined)
	window.innerWidth = 1200
	window.innerHeight = 800
	placeWindows()
	mountStrip()
})

afterEach(() => {
	errors.mockRestore()
	vi.useRealTimers()
	document.body.replaceChildren()
	for (const mock of Object.values(host)) {
		mock.mockReset()
	}
})

describe("a tab dropped on another window of its Space that confirms at once", () => {
	it("lives in the target window at the drop index and leaves the origin window", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()
		windows.target.placeIncoming(1)

		await dropFromOrigin(windows)
		targetDrops(windows)

		await vi.waitFor(() =>
			expect(windows.receive).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					entries: [expect.objectContaining({ href: HREF })],
				}),
				1,
			),
		)
		expect(windows.removeDocked).toHaveBeenCalledExactlyOnceWith(SPACE, TAB_ID)
		expect(vi.getTimerCount()).toBe(0)
		expect(bus.listenerCount()).toBe(0)
		expect(host.raiseReportedFailure).not.toHaveBeenCalled()
	})
})

describe("a tab dropped on another window whose page reports the screen place WebKit gives it", () => {
	it("is taken by that window, which locates itself where the host hit-test does", async () => {
		const windows = twoWindows()

		await dropFromOrigin(windows)
		targetDrops(windows)

		await vi.waitFor(() =>
			expect(windows.removeDocked).toHaveBeenCalledExactlyOnceWith(
				SPACE,
				TAB_ID,
			),
		)
		expect(host.emitOnThisComputer).toHaveBeenCalledWith(ANSWER_EVENT, {
			windowLabel: TARGET_WINDOW,
			originTabId: TAB_ID,
			isTaken: true,
		})
		expect(windows.receive).toHaveBeenCalledOnce()
		expect(host.raiseReportedFailure).not.toHaveBeenCalled()
		expect(moveFailureLogs()).toEqual([])
	})
})

describe("a tab dropped on a window of its Space that reloaded after the drag started", () => {
	it("lives in that window at the drop index and leaves the origin window", async () => {
		const windows = twoWindows()
		host.windowTabDragStart.mockResolvedValue(ACCEPTED)
		host.windowTabDragMove.mockImplementation(async (point: ScreenPosition) => {
			windows.target.follow(movedTo(point))
			return ACCEPTED
		})
		const stopWatching = await windows.target.watch()

		windows.origin.start(at(10, 10), () => GHOST_TAB)
		windows.origin.move(at(OVER_STRIP.x, OVER_STRIP.y))
		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledWith(
				OFFER_EVENT,
				expect.objectContaining({ windowLabel: TARGET_WINDOW }),
			),
		)
		windows.origin.move(at(OVER_STRIP.x + 4, OVER_STRIP.y))
		await vi.waitFor(() => expect(windows.target.getState()).not.toBeNull())
		windows.target.placeIncoming(1)
		const dropReached = dropCommandReached()
		windows.origin.drop(at(OVER_STRIP.x + 4, OVER_STRIP.y))
		await dropReached
		targetDrops(windows, { x: OVER_STRIP.x + 4, y: OVER_STRIP.y })

		await vi.waitFor(() =>
			expect(windows.receive).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					entries: [expect.objectContaining({ href: HREF })],
				}),
				1,
			),
		)
		await vi.waitFor(() =>
			expect(windows.removeDocked).toHaveBeenCalledExactlyOnceWith(
				SPACE,
				TAB_ID,
			),
		)
		stopWatching()
		expect(bus.listenerCount()).toBe(0)
		expect(host.raiseReportedFailure).not.toHaveBeenCalled()
	})
})

describe("a cross-window move that fails", () => {
	it("logs once that the target never answered, naming both windows and the tab", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropFromOrigin(windows)
		await waitPastTheDockWait()

		await vi.waitFor(() =>
			expect(moveFailureLogs()).toEqual([[`${MOVE_FAILURE_LOG}no answer`]]),
		)
	})

	it("logs once that the target refused the tab", async () => {
		const windows = twoWindows()

		await dropFromOrigin(windows)
		targetDrops(windows, BELOW_STRIP)

		await vi.waitFor(() =>
			expect(moveFailureLogs()).toEqual([
				[`${MOVE_FAILURE_LOG}refused by the receiver`],
			]),
		)
	})

	it("logs once that the host refused the drop command", async () => {
		const windows = twoWindows()
		host.windowTabDragDrop.mockResolvedValue(REFUSED_DROP)

		windows.origin.start(at(10, 10), () => GHOST_TAB)
		windows.origin.drop(at(OVER_STRIP.x, OVER_STRIP.y))

		await vi.waitFor(() =>
			expect(moveFailureLogs()).toEqual([
				[`${MOVE_FAILURE_LOG}drop command refused`],
			]),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
	})

	it("logs once that the settle was lost, and the tab stays in the origin window only", async () => {
		const windows = twoWindows()
		host.emitOnThisComputer.mockImplementation(async (event, payload) => {
			if (event === SETTLE_EVENT) {
				throw new Error("the settle did not leave the window")
			}
			return bus.emit(event, payload)
		})

		await dropFromOrigin(windows)
		targetDrops(windows)

		await vi.waitFor(() =>
			expect(moveFailureLogs()).toEqual([[`${MOVE_FAILURE_LOG}settle lost`]]),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
	})
})

describe("a tab dropped on another window whose answer lands after the wait", () => {
	it("stays in the origin window only, the target never inserts it and nobody listens anymore", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()
		let openAnswers: () => void = () => undefined
		const answersOpen = new Promise<void>((resolve) => {
			openAnswers = resolve
		})
		host.emitOnThisComputer.mockImplementation(async (event, payload) => {
			if (event === ANSWER_EVENT) {
				await answersOpen
			}
			return bus.emit(event, payload)
		})

		await dropFromOrigin(windows)
		targetDrops(windows)
		await waitPastTheDockWait()
		openAnswers()

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(0))
		expect(host.emitOnThisComputer).toHaveBeenCalledWith(ANSWER_EVENT, {
			windowLabel: TARGET_WINDOW,
			originTabId: TAB_ID,
			isTaken: true,
		})
		expect(settlesSent()).toEqual([
			[
				SETTLE_EVENT,
				{ windowLabel: TARGET_WINDOW, originTabId: TAB_ID, isTaken: false },
			],
		])
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
	})
})

describe("a tab whose drop reaches the target after the wait", () => {
	it("stays in the origin window only, the target answers nothing and nobody listens anymore", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropFromOrigin(windows)
		await waitPastTheDockWait()
		await vi.waitFor(() => expect(bus.listenerCount()).toBe(0))
		targetDrops(windows)

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		expect(bus.listenerCount()).toBe(0)
		expect(host.emitOnThisComputer).not.toHaveBeenCalledWith(
			ANSWER_EVENT,
			expect.anything(),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
	})
})

describe("a tab dropped on another window that never confirms", () => {
	it("stays in the origin window only, which stops listening and clears its timer", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropFromOrigin(windows)
		await waitPastTheDockWait()

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		expect(bus.listenerCount()).toBe(0)
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
	})

	it("ignores answers from another window or about another tab", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropFromOrigin(windows)
		await answerDock({
			windowLabel: "window-2",
			originTabId: TAB_ID,
			isTaken: true,
		})
		await answerDock({
			windowLabel: TARGET_WINDOW,
			originTabId: "another-tab",
			isTaken: true,
		})
		await waitPastTheDockWait()

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
	})
})

describe("a tab dropped on another window that refuses it", () => {
	it("stays in the origin window only", async () => {
		const windows = twoWindows()

		await dropFromOrigin(windows)
		targetDrops(windows, BELOW_STRIP)

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
		expect(bus.listenerCount()).toBe(0)
	})
})
