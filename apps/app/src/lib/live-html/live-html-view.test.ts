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
	vi.useRealTimers()
	vi.restoreAllMocks()
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
const STILL = "data:image/png;base64,c3RpbGw="
const OTHER_STILL = "data:image/png;base64,b3RoZXI="
const STILL_MISSED = {
	kind: "unplaced",
	detail: "the view did not hand its still in time",
}

const callsOf = () => host.answer.mock.calls.map(([command]) => command)

const roundsOf = () =>
	host.answer.mock.calls
		.filter(([command]) => command === "live_html_round")
		.map(([, { radius }]) => radius)

const hostAnswers = (answers: Record<string, () => unknown>) =>
	host.answer.mockImplementation(
		async (command: string) => answers[command]?.() ?? null,
	)

const viewOf = (
	overrides: Partial<Parameters<typeof createLiveHtmlView>[0]> = {},
) =>
	createLiveHtmlView({
		id: "view-1",
		mountAt: mountingHtml("<p>Hi</p>"),
		onLive: vi.fn(),
		onFailure: vi.fn(),
		drawStill: vi.fn().mockResolvedValue(undefined),
		dropStill: vi.fn(),
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

	it("hides behind a still while an app surface covers it, and shows once it closes", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()
		view.cover(false)
		await flush()

		expect(callsOf().slice(2)).toEqual([
			"live_html_still",
			"live_html_hide",
			"live_html_show",
		])
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

		expect(callsOf().slice(2)).toEqual(["live_html_round", "live_html_place"])
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

		expect(callsOf().slice(2)).toEqual(["live_html_round", "live_html_place"])
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
})

describe("the still of a live html view", () => {
	it("hands the still to the slot and hides the view only once it has decoded", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const decoding = Promise.withResolvers<void>()
		const drawStill = vi.fn(() => decoding.promise)
		const view = viewOf({ drawStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()
		expect(drawStill).toHaveBeenCalledWith(STILL)
		expect(callsOf().slice(2)).toEqual(["live_html_still"])

		decoding.resolve()
		await flush()
		expect(callsOf().slice(2)).toEqual(["live_html_still", "live_html_hide"])
	})

	it("drops the still only once the view is shown again", async () => {
		const showing = Promise.withResolvers<null>()
		hostAnswers({
			live_html_still: () => STILL,
			live_html_show: () => showing.promise,
		})
		const dropStill = vi.fn()
		const view = viewOf({ dropStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.cover(true)
		await flush()

		view.cover(false)
		await flush()
		expect(callsOf().at(-1)).toBe("live_html_show")
		expect(dropStill).not.toHaveBeenCalled()

		showing.resolve(null)
		await flush()
		expect(dropStill).toHaveBeenCalledTimes(1)
	})

	it("hides without a still, logs the error and stays live when the still is refused or late", async () => {
		const logged = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		hostAnswers({ live_html_still: () => Promise.reject(STILL_MISSED) })
		const onLive = vi.fn()
		const onFailure = vi.fn()
		const drawStill = vi.fn()
		const view = viewOf({ onLive, onFailure, drawStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()

		expect(callsOf().slice(2)).toEqual(["live_html_still", "live_html_hide"])
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("view-1"),
			STILL_MISSED,
		)
		expect(drawStill).not.toHaveBeenCalled()
		expect(onFailure).not.toHaveBeenCalled()
		expect(onLive).toHaveBeenCalledTimes(1)
	})

	it("keeps the view shown and discards a still answered after the surface closed", async () => {
		const taking = Promise.withResolvers<string>()
		hostAnswers({ live_html_still: () => taking.promise })
		const drawStill = vi.fn()
		const view = viewOf({ drawStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.cover(true)
		await flush()

		view.cover(false)
		taking.resolve(STILL)
		await flush()

		expect(drawStill).not.toHaveBeenCalled()
		expect(callsOf().slice(2)).toEqual(["live_html_still"])
	})

	it("takes a fresh still each time a surface opens", async () => {
		const stills = [STILL, OTHER_STILL]
		hostAnswers({ live_html_still: () => stills.shift() })
		const drawStill = vi.fn().mockResolvedValue(undefined)
		const view = viewOf({ drawStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()
		view.cover(false)
		await flush()
		view.cover(true)
		await flush()

		expect(drawStill.mock.calls).toEqual([[STILL], [OTHER_STILL]])
	})

	it("discards the still of a surface that closed and takes another for the one opened since", async () => {
		const taking = Promise.withResolvers<string>()
		const stills = [taking.promise, OTHER_STILL]
		hostAnswers({ live_html_still: () => stills.shift() })
		const drawStill = vi.fn().mockResolvedValue(undefined)
		const view = viewOf({ drawStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.cover(true)
		await flush()

		view.cover(false)
		view.cover(true)
		taking.resolve(STILL)
		await flush()

		expect(drawStill.mock.calls).toEqual([[OTHER_STILL]])
		expect(callsOf().slice(2)).toEqual([
			"live_html_still",
			"live_html_still",
			"live_html_hide",
		])
	})

	it("drops the still of a view that left the thread before the surface closed", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const dropStill = vi.fn()
		const view = viewOf({ dropStill })
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.cover(true)
		await flush()
		view.follow(OUT_OF_SIGHT)
		await flush()

		view.cover(false)
		await flush()

		expect(callsOf()).not.toContain("live_html_show")
		expect(dropStill).toHaveBeenCalledTimes(1)
	})

	it("asks for no still before the view is mounted", async () => {
		viewOf().cover(true)
		await flush()

		expect(host.answer).not.toHaveBeenCalled()
	})

	it("asks for no still while the slot is out of sight", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()
		view.follow(OUT_OF_SIGHT)
		await flush()

		view.cover(true)
		await flush()

		expect(callsOf().slice(2)).toEqual(["live_html_hide"])
	})

	it("asks for no still once the view failed", async () => {
		hostAnswers({
			live_html_place: () => Promise.reject({ kind: "invalidRectangle" }),
		})
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()

		expect(callsOf()).not.toContain("live_html_still")
	})

	it("takes a still of an attached html file like an html block", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const drawStill = vi.fn().mockResolvedValue(undefined)
		const view = viewOf({
			mountAt: mountingAttachment("/replies/page.html"),
			drawStill,
		})
		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		view.cover(true)
		await flush()

		expect(drawStill).toHaveBeenCalledWith(STILL)
		expect(callsOf().slice(2)).toEqual(["live_html_still", "live_html_hide"])
	})

	it("is under a rectangle that overlaps its visible part, and under no other", async () => {
		host.answer.mockResolvedValue(null)
		const view = viewOf()
		const overTheVisiblePart = { x: 200, y: 260, width: 200, height: 40 }
		const overTheCutPart = { x: 200, y: -30, width: 200, height: 20 }

		expect(view.isUnder(overTheVisiblePart)).toBe(false)

		view.follow({ rect: RECT, clip: CLIP })
		await flush()

		expect(view.isUnder(overTheVisiblePart)).toBe(true)
		expect(view.isUnder(overTheCutPart)).toBe(false)
	})
})

describe("the bound on the still of a live html view", () => {
	const pass = (milliseconds: number) =>
		vi.advanceTimersByTimeAsync(milliseconds)

	const orderOf = (command: string) =>
		host.answer.mock.invocationCallOrder[callsOf().indexOf(command)]

	const coveredViewOf = async (
		overrides: Parameters<typeof viewOf>[0] = {},
	) => {
		vi.useFakeTimers()
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const view = viewOf(overrides)
		view.follow({ rect: RECT, clip: CLIP })
		await pass(0)
		view.cover(true)
		return view
	}

	it("hides without a still and logs once the still has not answered within 500 ms", async () => {
		const taking = Promise.withResolvers<string>()
		hostAnswers({ live_html_still: () => taking.promise })
		const drawStill = vi.fn()
		await coveredViewOf({ drawStill })

		await pass(499)
		expect(callsOf().slice(2)).toEqual(["live_html_still"])

		await pass(1)
		expect(callsOf().slice(2)).toEqual(["live_html_still", "live_html_hide"])
		expect(console.error).toHaveBeenCalledTimes(1)

		taking.resolve(STILL)
		await pass(0)
		expect(drawStill).not.toHaveBeenCalled()
	})

	it("drops a still not decoded within 500 ms before hiding, and ignores its late decode", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const decoding = Promise.withResolvers<void>()
		const drawStill = vi.fn(() => decoding.promise)
		const dropStill = vi.fn()
		await coveredViewOf({ drawStill, dropStill })

		await pass(500)
		expect(dropStill).toHaveBeenCalledTimes(1)
		expect(dropStill.mock.invocationCallOrder[0]).toBeLessThan(
			orderOf("live_html_hide"),
		)
		expect(console.error).toHaveBeenCalledTimes(1)

		decoding.resolve()
		await pass(0)
		expect(drawStill).toHaveBeenCalledTimes(1)
		expect(dropStill).toHaveBeenCalledTimes(1)
		expect(callsOf().at(-1)).toBe("live_html_hide")
	})

	it("drops a still whose decode rejects before the view hides", async () => {
		hostAnswers({ live_html_still: () => STILL })
		const undecodable = new Error("the image cannot be decoded")
		const drawStill = vi.fn().mockRejectedValue(undecodable)
		const dropStill = vi.fn()
		await coveredViewOf({ drawStill, dropStill })

		await pass(0)

		expect(dropStill).toHaveBeenCalledTimes(1)
		expect(dropStill.mock.invocationCallOrder[0]).toBeLessThan(
			orderOf("live_html_hide"),
		)
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("view-1"),
			undecodable,
		)
	})

	it("counts one 500 ms across the still and its decode", async () => {
		hostAnswers({
			live_html_still: () =>
				new Promise((resolve) => setTimeout(() => resolve(STILL), 300)),
		})
		const drawStill = vi.fn(() => new Promise<void>(() => undefined))
		await coveredViewOf({ drawStill })

		await pass(499)
		expect(drawStill).toHaveBeenCalledWith(STILL)
		expect(callsOf()).not.toContain("live_html_hide")

		await pass(1)
		expect(callsOf().at(-1)).toBe("live_html_hide")
	})

	it("counts the 500 ms from the opening of the surface, not from the asking", async () => {
		const placing = Promise.withResolvers<null>()
		const places = [null, placing.promise]
		hostAnswers({
			live_html_place: () => places.shift(),
			live_html_still: () => new Promise(() => undefined),
		})
		vi.useFakeTimers()
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		const view = viewOf()
		view.follow({ rect: RECT, clip: CLIP })
		await pass(0)
		view.follow(MOVED)
		view.cover(true)

		await pass(200)
		placing.resolve(null)
		await pass(299)
		expect(callsOf().at(-1)).toBe("live_html_still")

		await pass(1)
		expect(callsOf().at(-1)).toBe("live_html_hide")
	})

	it("shows the view and sets no still when the surface closes past the bound, the still pending", async () => {
		const taking = Promise.withResolvers<string>()
		hostAnswers({ live_html_still: () => taking.promise })
		const drawStill = vi.fn()
		const view = await coveredViewOf({ drawStill })
		await pass(500)

		view.cover(false)
		await pass(0)
		taking.resolve(STILL)
		await pass(0)

		expect(callsOf().slice(2)).toEqual([
			"live_html_still",
			"live_html_hide",
			"live_html_show",
		])
		expect(drawStill).not.toHaveBeenCalled()
	})
})
