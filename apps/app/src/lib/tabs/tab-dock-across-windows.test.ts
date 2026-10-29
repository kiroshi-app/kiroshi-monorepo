// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createOnThisComputerBus } from "./on-this-computer-test-bus"
import { createTabDock } from "./tab-dock"
import { answerDock } from "./tab-dock-channel"
import { createTabTearOff, type TabTearOff } from "./tab-tear-off"

import type { ScreenPosition, TabDrag } from "../bindings"

const host = vi.hoisted(() => ({
	windowTabDragStart: vi.fn(),
	windowTabDragDrop: vi.fn(),
	windowTabDragCancel: vi.fn(),
	windowStripAt: vi.fn(),
	windowReportSpace: vi.fn(),
	windowReportStrip: vi.fn(),
	dragGhostShow: vi.fn(),
	dragGhostHide: vi.fn(),
	readWindowOrigin: vi.fn(),
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

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	readWindowOrigin: host.readWindowOrigin,
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

const OVER_STRIP = { x: 1300, y: 215 }

const BELOW_STRIP = { x: 1300, y: 600 }

const DOCK_WAIT_MS = 2000

const SETTLE_EVENT = "window://tab-dock-settled"

let bus = createOnThisComputerBus()

const GHOST_TAB = { tabId: TAB_ID, href: HREF, title: "Release notes" }

const startedInOrigin: TabDrag = {
	kind: "started",
	originLabel: ORIGIN_WINDOW,
	originSpaceId: SPACE,
	tab: PACKED,
}

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

const mountStrip = () => {
	const strip = document.createElement("div")
	strip.dataset.slot = "title-bar-tabs"
	strip.getBoundingClientRect = () => DOMRect.fromRect(STRIP)
	document.body.replaceChildren(strip)
}

const twoWindows = () => {
	const receive = vi.fn()
	const target = createTabDock({
		windowLabel: TARGET_WINDOW,
		shownSpaceId: () => SPACE,
		receive,
	})
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

const dropOnTarget = ({ origin }: ReturnType<typeof twoWindows>) => {
	const dropReached = new Promise<void>((resolve) => {
		host.windowTabDragDrop.mockImplementation(async () => {
			resolve()
			return ACCEPTED
		})
	})
	origin.start(at(10, 10), () => GHOST_TAB)
	origin.drop(at(OVER_STRIP.x, OVER_STRIP.y))
	return dropReached
}

const targetDrops = (
	{ target }: ReturnType<typeof twoWindows>,
	point = OVER_STRIP,
) => target.follow(droppedAt(point))

const settlesSent = () =>
	host.emitOnThisComputer.mock.calls.filter(([event]) => event === SETTLE_EVENT)

const waitPastTheDockWait = async () => {
	await vi.advanceTimersByTimeAsync(DOCK_WAIT_MS)
	expect(vi.getTimerCount()).toBe(0)
	vi.useRealTimers()
}

beforeEach(() => {
	bus = createOnThisComputerBus()
	host.emitOnThisComputer.mockImplementation(bus.emit)
	host.listenOnThisComputer.mockImplementation(bus.listen)
	host.windowStripAt.mockResolvedValue({ label: TARGET_WINDOW, spaceId: SPACE })
	host.windowTabDragCancel.mockResolvedValue(ACCEPTED)
	host.windowReportSpace.mockResolvedValue(undefined)
	host.windowReportStrip.mockResolvedValue(undefined)
	host.dragGhostShow.mockResolvedValue(UNSUPPORTED)
	host.dragGhostHide.mockResolvedValue(UNSUPPORTED)
	host.readWindowOrigin.mockReturnValue(WINDOW_ORIGIN)
	host.revealWindow.mockResolvedValue(undefined)
	window.innerWidth = 1200
	window.innerHeight = 800
	mountStrip()
})

afterEach(() => {
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

		await dropOnTarget(windows)
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

describe("a tab dropped on another window that confirms after the wait", () => {
	it("stays in the origin window only and the target never inserts it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropOnTarget(windows)
		await waitPastTheDockWait()
		targetDrops(windows)

		await vi.waitFor(() =>
			expect(host.emitOnThisComputer).toHaveBeenCalledWith(
				"window://tab-dock-answered",
				{ windowLabel: TARGET_WINDOW, originTabId: TAB_ID, isTaken: true },
			),
		)
		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
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

describe("a tab dropped on another window that never confirms", () => {
	it("stays in the origin window only, which stops listening and clears its timer", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const windows = twoWindows()

		await dropOnTarget(windows)
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

		await dropOnTarget(windows)
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

		await dropOnTarget(windows)
		targetDrops(windows, BELOW_STRIP)

		await vi.waitFor(() =>
			expect(host.raiseReportedFailure).toHaveBeenCalledOnce(),
		)
		expect(windows.removeDocked).not.toHaveBeenCalled()
		expect(windows.receive).not.toHaveBeenCalled()
		expect(bus.listenerCount()).toBe(0)
	})
})
