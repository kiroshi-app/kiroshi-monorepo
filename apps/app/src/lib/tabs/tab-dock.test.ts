// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTabDock } from "./tab-dock"

import type { TabDrag } from "../bindings"

const host = vi.hoisted(() => ({
	windowReportSpace: vi.fn(),
	windowReportStrip: vi.fn(),
	readWindowOrigin: vi.fn(),
	revealWindow: vi.fn(),
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
}))

const SPACE = "space-home"

const THIS_WINDOW = "window-1"

const ORIGIN_WINDOW = "main"

const HREF = "/?conversation=torn"

const PACKED = { href: HREF, isPinned: false, entries: [HREF], index: 0 }

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

const OVER_STRIP = { x: 1300, y: 215 }

const BELOW_STRIP = { x: 1300, y: 600 }

const mountStrip = () => {
	const strip = document.createElement("div")
	strip.dataset.slot = "title-bar-tabs"
	strip.getBoundingClientRect = () => DOMRect.fromRect(STRIP)
	document.body.append(strip)
}

const dockOf = (shownSpaceId = SPACE) => {
	const receive = vi.fn()
	const dock = createTabDock({
		windowLabel: THIS_WINDOW,
		shownSpaceId: () => shownSpaceId,
		receive,
	})
	return { dock, receive }
}

const holding = async (shownSpaceId = SPACE, originSpaceId = SPACE) => {
	const held = dockOf(shownSpaceId)
	held.dock.follow(started(originSpaceId))
	await vi.waitFor(() => expect(host.readWindowOrigin).toHaveBeenCalled())
	await Promise.resolve()
	return held
}

beforeEach(() => {
	host.windowReportSpace.mockResolvedValue(undefined)
	host.windowReportStrip.mockResolvedValue(undefined)
	host.readWindowOrigin.mockResolvedValue(WINDOW_ORIGIN)
	host.revealWindow.mockResolvedValue(undefined)
	mountStrip()
})

afterEach(() => {
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
		const { dock } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))

		expect(dock.getState()).toMatchObject({
			tab: { isPinned: false, entries: [{ href: HREF }] },
			clientX: 300,
		})
	})

	it("closes the parting once the pointer leaves the strip", async () => {
		const { dock } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(moved(BELOW_STRIP.x, BELOW_STRIP.y))

		expect(dock.getState()).toBeNull()
	})

	it("closes the parting when the drag is cancelled", async () => {
		const { dock } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow({ kind: "cancelled", originLabel: ORIGIN_WINDOW })

		expect(dock.getState()).toBeNull()
	})
})

describe("a drag of another Space", () => {
	it("never parts the strip and takes nothing on drop", async () => {
		const { dock, receive } = await holding(SPACE, "space-away")

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		expect(dock.getState()).toBeNull()
		expect(receive).not.toHaveBeenCalled()
	})
})

describe("a tab dropped on the parted strip", () => {
	it("takes the tab at the parted index, focuses this window and closes the parting", async () => {
		const { dock, receive } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.placeIncoming(2)
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		expect(receive).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				entries: [expect.objectContaining({ href: HREF })],
			}),
			2,
		)
		expect(host.revealWindow).toHaveBeenCalledExactlyOnceWith({
			withFocus: true,
		})
		expect(dock.getState()).toBeNull()
	})

	it("takes it once when the drop reaches two listeners", async () => {
		const { dock, receive } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(OVER_STRIP.x, OVER_STRIP.y))

		expect(receive).toHaveBeenCalledOnce()
	})

	it("takes nothing when dropped off the strip", async () => {
		const { dock, receive } = await holding()

		dock.follow(moved(OVER_STRIP.x, OVER_STRIP.y))
		dock.follow(dropped(BELOW_STRIP.x, BELOW_STRIP.y))

		expect(receive).not.toHaveBeenCalled()
		expect(host.revealWindow).not.toHaveBeenCalled()
	})
})
