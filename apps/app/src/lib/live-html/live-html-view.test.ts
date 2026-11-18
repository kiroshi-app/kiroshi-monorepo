import { afterEach, describe, expect, it, vi } from "vitest"

import {
	createLiveHtmlView,
	mountingAttachment,
	mountingHtml,
} from "@/lib/live-html/live-html-view"

const host = vi.hoisted(() => ({ answer: vi.fn() }))

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: async (command: string, args: unknown) => host.answer(command, args),
}))

afterEach(() => {
	host.answer.mockReset()
})

const RECT = { x: 10, y: -40, width: 300, height: 320 }
const CLIP = { x: 10, y: 0, width: 300, height: 280 }
const MOVED = { rect: { ...RECT, y: -60 }, clip: { ...CLIP, height: 260 } }
const OUT_OF_SIGHT = {
	rect: { ...RECT, y: -400 },
	clip: { ...CLIP, height: 0 },
}
const ROUNDED_BELOW = {
	topLeft: 0,
	topRight: 0,
	bottomRight: 12,
	bottomLeft: 12,
}
const ROUNDED_ABOVE = {
	topLeft: 12,
	topRight: 12,
	bottomRight: 0,
	bottomLeft: 0,
}
const SQUARE = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }
const ROUNDED = { rect: RECT, clip: CLIP, radius: ROUNDED_BELOW }

const callsOf = () => host.answer.mock.calls.map(([command]) => command)

const roundsOf = () =>
	host.answer.mock.calls
		.filter(([command]) => command === "live_html_round")
		.map(([, { radius }]) => radius)

const viewOf = (
	overrides: Partial<Parameters<typeof createLiveHtmlView>[0]> = {},
) =>
	createLiveHtmlView({
		id: "view-1",
		mountAt: mountingHtml("<p>Hi</p>"),
		onLive: vi.fn(),
		onFailure: vi.fn(),
		...overrides,
	})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("a live html view", () => {
	it("mounts at the full box, then cuts it to the visible part", async () => {
		const onLive = vi.fn()
		host.answer.mockResolvedValue(null)

		viewOf({ onLive }).follow({ rect: RECT, clip: CLIP })
		await flush()

		expect(host.answer.mock.calls).toEqual([
			["live_html_mount", { id: "view-1", html: "<p>Hi</p>", rectangle: RECT }],
			["live_html_place", { id: "view-1", rectangle: RECT, clip: CLIP }],
		])
		expect(onLive).toHaveBeenCalledTimes(1)
	})

	it("places the view again when its slot moves, the latest move last", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()

		view.follow({ rect: RECT, clip: CLIP })
		view.follow(MOVED)
		await flush()

		expect(host.answer).toHaveBeenLastCalledWith("live_html_place", {
			id: "view-1",
			rectangle: MOVED.rect,
			clip: MOVED.clip,
		})
		expect(callsOf()).toEqual(["live_html_mount", "live_html_place"])
	})

	it("hides the view, kept alive, when its slot scrolls out of the thread", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.follow(OUT_OF_SIGHT)
		await flush()

		expect(callsOf().slice(2)).toEqual(["live_html_hide"])
	})

	it("removes the view when its slot is gone", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.follow(null)
		await flush()

		expect(host.answer).toHaveBeenLastCalledWith("live_html_remove", {
			id: "view-1",
		})
	})

	it("places then shows the same view when its slot scrolls back into the thread", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.follow(OUT_OF_SIGHT)
		await flush()

		view.follow(MOVED)
		await flush()

		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_place",
			"live_html_hide",
			"live_html_place",
			"live_html_show",
		])
		expect(host.answer).toHaveBeenCalledWith("live_html_place", {
			id: "view-1",
			rectangle: MOVED.rect,
			clip: MOVED.clip,
		})
	})

	it("keeps a view scrolled out of the thread hidden when a surface closes", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.follow(OUT_OF_SIGHT)
		view.cover(true)
		await flush()

		view.cover(false)
		await flush()

		expect(callsOf().slice(2)).toEqual(["live_html_hide"])
	})

	it("mounts nothing for a slot out of sight", async () => {
		viewOf().follow(OUT_OF_SIGHT)
		await flush()

		expect(host.answer).not.toHaveBeenCalled()
	})

	it("hides while an app surface covers it, and shows once it closes", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()
		view.cover(false)
		await flush()

		expect(callsOf().slice(2)).toEqual(["live_html_hide", "live_html_show"])
	})

	it("hides a view mounted under an open surface before placing it", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.cover(true)

		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_hide",
			"live_html_place",
		])
	})

	it("reports a refused mount and calls nothing more", async () => {
		const onFailure = vi.fn()
		host.answer.mockRejectedValue({ kind: "mainWindowMissing" })
		const view = viewOf({ onFailure })

		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.follow(MOVED)
		await flush()

		expect(onFailure).toHaveBeenCalledWith({ kind: "mainWindowMissing" })
		expect(callsOf()).toEqual(["live_html_mount"])
	})

	it("raises one notice when removing fails after an earlier failure", async () => {
		const onFailure = vi.fn()
		host.answer.mockImplementation(async (command: string) => {
			if (command === "live_html_place") throw { kind: "invalidRectangle" }
			if (command === "live_html_remove") throw { kind: "unknownView" }
			return null
		})

		viewOf({ onFailure }).follow({ rect: RECT, clip: CLIP })
		await flush()

		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_place",
			"live_html_remove",
		])
		expect(onFailure).toHaveBeenCalledTimes(1)
		expect(onFailure).toHaveBeenCalledWith({ kind: "invalidRectangle" })
	})

	it("removes a mounted view whose placing failed", async () => {
		const onFailure = vi.fn()
		host.answer.mockImplementation(async (command: string) => {
			if (command === "live_html_place") throw { kind: "invalidRectangle" }
			return null
		})

		viewOf({ onFailure }).follow({ rect: RECT, clip: CLIP })
		await flush()

		expect(onFailure).toHaveBeenCalledWith({ kind: "invalidRectangle" })
		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_place",
			"live_html_remove",
		])
	})

	it("rounds a mounted view once, to its largest corner radius", async () => {
		host.answer.mockResolvedValue(null)

		viewOf().follow(ROUNDED)
		await flush()

		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_place",
			"live_html_round",
		])
		expect(host.answer).toHaveBeenLastCalledWith("live_html_round", {
			id: "view-1",
			radius: 12,
		})
	})

	it("rounds the view again when its largest corner radius changes, down to square", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow(ROUNDED)
		await flush()

		view.follow({ ...ROUNDED, radius: { ...ROUNDED_BELOW, bottomLeft: 20 } })
		await flush()
		view.follow({ ...ROUNDED, radius: SQUARE })
		await flush()

		expect(roundsOf()).toEqual([12, 20, 0])
	})

	it("rounds once while the largest corner radius stays the same", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow(ROUNDED)
		await flush()

		view.follow({ ...MOVED, radius: ROUNDED_ABOVE })
		await flush()

		expect(roundsOf()).toEqual([12])
		expect(host.answer).toHaveBeenLastCalledWith("live_html_place", {
			id: "view-1",
			rectangle: MOVED.rect,
			clip: MOVED.clip,
		})
	})

	it("rounds the view mounted again after its slot was gone", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow(ROUNDED)
		await flush()

		view.follow(null)
		await flush()
		view.follow(ROUNDED)
		await flush()

		expect(roundsOf()).toEqual([12, 12])
	})

	it("leaves a view mounted square as it is", async () => {
		host.answer.mockResolvedValue(null)

		viewOf().follow({ ...ROUNDED, radius: SQUARE })
		await flush()

		expect(roundsOf()).toEqual([])
	})

	it("rounds nothing for a placement that carries no radius", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow(ROUNDED)
		await flush()

		view.follow(MOVED)
		await flush()

		expect(roundsOf()).toEqual([12])
	})

	it("rounds an attached html file like an html block", async () => {
		host.answer.mockResolvedValue(null)

		viewOf({ mountAt: mountingAttachment("/replies/page.html") }).follow(
			ROUNDED,
		)
		await flush()

		expect(callsOf()).toEqual([
			"live_html_mount_attachment",
			"live_html_place",
			"live_html_round",
		])
		expect(roundsOf()).toEqual([12])
	})

	it("removes a mounted view whose rounding failed", async () => {
		const onFailure = vi.fn()
		host.answer.mockImplementation(async (command: string) => {
			if (command === "live_html_round") throw { kind: "unknownView" }
			return null
		})
		const view = viewOf({ onFailure })

		view.follow(ROUNDED)
		await flush()
		view.follow(MOVED)
		await flush()

		expect(onFailure).toHaveBeenCalledTimes(1)
		expect(onFailure).toHaveBeenCalledWith({ kind: "unknownView" })
		expect(callsOf()).toEqual([
			"live_html_mount",
			"live_html_place",
			"live_html_round",
			"live_html_remove",
		])
	})

	it("hides a rounded view under an app surface without asking for a still", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow(ROUNDED)
		await flush()

		view.cover(true)
		await flush()

		expect(callsOf().slice(3)).toEqual(["live_html_hide"])
		expect(callsOf()).not.toContain("live_html_still")
	})
})
