import { afterEach, describe, expect, it, vi } from "vitest"

import { createLiveHtmlView } from "@/lib/live-html/live-html-view"

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

const callsOf = () => host.answer.mock.calls.map(([command]) => command)

const settled = () => vi.waitFor(() => expect(host.answer).toHaveBeenCalled())

const viewOf = (
	overrides: Partial<Parameters<typeof createLiveHtmlView>[0]> = {},
) =>
	createLiveHtmlView({
		id: "view-1",
		html: "<p>Hi</p>",
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
		await settled()
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

	it.each([
		["scrolls out of the thread", OUT_OF_SIGHT],
		["is gone", null],
	])("removes the view when its slot %s", async (_, geometry) => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.follow(geometry)
		await flush()

		expect(host.answer).toHaveBeenLastCalledWith("live_html_remove", {
			id: "view-1",
		})
	})

	it("mounts again when its slot scrolls back into the thread", async () => {
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
			"live_html_remove",
			"live_html_mount",
			"live_html_place",
		])
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
})
