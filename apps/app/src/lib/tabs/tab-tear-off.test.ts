// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	drawGhost as drawThumbnail,
	readGhostThumbnail,
} from "./ghost-thumbnail"
import { createTabTearOff, type TabTearOff } from "./tab-tear-off"

const ghost = vi.hoisted(() => ({
	dragGhostShow: vi.fn(),
	dragGhostMove: vi.fn(),
	dragGhostHide: vi.fn(),
}))

const drag = vi.hoisted(() => ({
	windowTabDragStart: vi.fn(),
	windowTabDragMove: vi.fn(),
	windowTabDragDrop: vi.fn(),
	windowTabDragCancel: vi.fn(),
	windowStripAt: vi.fn(),
	windowStartNativeMove: vi.fn(),
}))

const raiseReportedFailure = vi.hoisted(() => vi.fn())

vi.mock("../bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("../bindings")>()
	return { ...bindings, commands: { ...bindings.commands, ...ghost, ...drag } }
})

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure,
}))

const SUPPORTED = { status: "ok", data: { supported: true } }

const UNSUPPORTED = { status: "ok", data: { supported: false } }

const TAB = {
	tabId: "torn",
	href: "/?conversation=torn",
	title: "Release notes",
}

const at = (screenX: number, screenY: number): TabTearOff => ({
	tabId: TAB.tabId,
	screenX,
	screenY,
})

const SPACE = "space-home"

const TORN = {
	packed: { href: TAB.href, isPinned: false, entries: [TAB.href], index: 0 },
	spaceId: SPACE,
	isOnlyTab: false,
}

const ACCEPTED = { status: "ok", data: null }

const REFUSED = { status: "error", error: { kind: "unavailable" } }

const SAME_SPACE_STRIP = { label: "window-1", spaceId: SPACE }

const OTHER_SPACE_STRIP = { label: "window-2", spaceId: "space-away" }

const answerEveryDragCommand = (answer: unknown) => {
	drag.windowTabDragStart.mockResolvedValue(answer)
	drag.windowTabDragMove.mockResolvedValue(answer)
	drag.windowTabDragDrop.mockResolvedValue(answer)
	drag.windowTabDragCancel.mockResolvedValue(answer)
	drag.windowStartNativeMove.mockResolvedValue(answer)
}

const answerEveryGhostCommand = (answer: unknown) => {
	ghost.dragGhostShow.mockResolvedValue(answer)
	ghost.dragGhostMove.mockResolvedValue(answer)
	ghost.dragGhostHide.mockResolvedValue(answer)
}

const sessionWithMoves = () => {
	const moves = {
		moveUnghosted: vi.fn(),
		moveTornOff: vi.fn().mockResolvedValue(undefined),
		tornTabOf: vi.fn(() => TORN),
		removeDocked: vi.fn(),
	}
	return { moves, session: createTabTearOff(moves) }
}

const drawGhost = vi.fn(() => TAB)

beforeEach(() => {
	answerEveryDragCommand(ACCEPTED)
	drag.windowStripAt.mockResolvedValue(null)
	window.innerWidth = 1200
	window.innerHeight = 800
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	ghost.dragGhostShow.mockReset()
	ghost.dragGhostMove.mockReset()
	ghost.dragGhostHide.mockReset()
	for (const command of Object.values(drag)) {
		command.mockReset()
	}
	raiseReportedFailure.mockReset()
	drawGhost.mockClear()
	localStorage.clear()
})

describe("a tab crossing the tear-off threshold", () => {
	it("shows the ghost under the pointer at half the origin window, drawing that tab", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { session } = sessionWithMoves()

		session.start(at(640.4, 120.6), drawGhost)

		await vi.waitFor(() =>
			expect(ghost.dragGhostShow).toHaveBeenCalledExactlyOnceWith(
				{ x: 640, y: 121 },
				{ width: 600, height: 400 },
				TAB,
			),
		)
		expect(drawGhost).toHaveBeenCalledExactlyOnceWith({
			width: 600,
			height: 400,
		})
	})

	it("moves the ghost to the pointer on every move, in order", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(-300, 40))
		session.move(at(2400, 900))

		await vi.waitFor(() =>
			expect(ghost.dragGhostMove.mock.calls).toEqual([
				[{ x: -300, y: 40 }],
				[{ x: 2400, y: 900 }],
			]),
		)
	})

	it("opens no window before the drop", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(20, 20))

		await vi.waitFor(() => expect(ghost.dragGhostMove).toHaveBeenCalled())
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
	})
})

describe("a torn-off tab brought back or let go with Esc", () => {
	it("hides the ghost and moves nothing", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.cancel()
		session.move(at(30, 30))

		await vi.waitFor(() => expect(ghost.dragGhostHide).toHaveBeenCalledOnce())
		expect(ghost.dragGhostMove).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
	})

	it("hides nothing when the ghost never showed", async () => {
		answerEveryGhostCommand(UNSUPPORTED)
		const { session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.cancel()

		await vi.waitFor(() => expect(ghost.dragGhostShow).toHaveBeenCalled())
		expect(ghost.dragGhostHide).not.toHaveBeenCalled()
	})
})

const deferredAnswer = () => {
	let land: () => void = () => undefined
	const answering = new Promise((resolve) => {
		land = () => resolve(SUPPORTED)
	})
	return { answering, land }
}

describe("a tab torn off, brought back and torn off again in one drag", () => {
	it("shows the ghost for the second tear-off only once the first hide has landed", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const firstMove = deferredAnswer()
		const firstHide = deferredAnswer()
		ghost.dragGhostMove.mockReturnValueOnce(firstMove.answering)
		ghost.dragGhostHide.mockReturnValueOnce(firstHide.answering)
		const { session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(20, 20))
		await vi.waitFor(() => expect(ghost.dragGhostMove).toHaveBeenCalledOnce())
		session.cancel()
		session.start(at(30, 30), drawGhost)
		session.move(at(40, 40))
		firstMove.land()
		await vi.waitFor(() => expect(ghost.dragGhostHide).toHaveBeenCalledOnce())

		expect(ghost.dragGhostShow).toHaveBeenCalledOnce()
		firstHide.land()
		await vi.waitFor(() =>
			expect(ghost.dragGhostMove).toHaveBeenLastCalledWith({ x: 40, y: 40 }),
		)
		expect(ghost.dragGhostShow).toHaveBeenCalledTimes(2)
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
		expect(ghost.dragGhostShow.mock.invocationCallOrder[1]).toBeGreaterThan(
			ghost.dragGhostHide.mock.invocationCallOrder[0] ?? 0,
		)
	})
})

describe("a torn-off tab released outside any strip", () => {
	it("hides the ghost, then opens the window at the drop point with the origin window size", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		expect(session.drop(at(500, 300))).toBe(true)

		await vi.waitFor(() =>
			expect(moves.moveTornOff).toHaveBeenCalledExactlyOnceWith(at(500, 300), {
				width: 1200,
				height: 800,
			}),
		)
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
		expect(ghost.dragGhostHide.mock.invocationCallOrder[0]).toBeLessThan(
			moves.moveTornOff.mock.invocationCallOrder[0] ?? 0,
		)
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
	})

	it("falls back to the move without a ghost when the ghost is unsupported", async () => {
		answerEveryGhostCommand(UNSUPPORTED)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(20, 20))
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.moveUnghosted).toHaveBeenCalledExactlyOnceWith(at(500, 300)),
		)
		expect(ghost.dragGhostMove).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
	})

	it("falls back to the move without a ghost when showing the ghost fails", async () => {
		ghost.dragGhostShow.mockRejectedValue(new Error("ghost lost"))
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.moveUnghosted).toHaveBeenCalledExactlyOnceWith(at(500, 300)),
		)
		expect(moves.moveTornOff).not.toHaveBeenCalled()
	})

	it("hides the ghost and falls back when moving it fails", async () => {
		answerEveryGhostCommand(SUPPORTED)
		ghost.dragGhostMove.mockResolvedValue({
			status: "error",
			error: { kind: "unavailable" },
		})
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(20, 20))
		session.move(at(30, 30))
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.moveUnghosted).toHaveBeenCalledExactlyOnceWith(at(500, 300)),
		)
		expect(ghost.dragGhostMove).toHaveBeenCalledOnce()
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
	})

	it("falls back to the move without a ghost when the drag never crossed the threshold", () => {
		const { moves, session } = sessionWithMoves()

		session.drop(at(500, 300))

		expect(moves.moveUnghosted).toHaveBeenCalledExactlyOnceWith(at(500, 300))
		expect(ghost.dragGhostShow).not.toHaveBeenCalled()
	})
})

const REDOCK_NOTICE = {
	title: "Couldn’t move the tab",
	description: "The tab stayed here. Drag it to the other window again.",
}

const stripsAt = (...strips: unknown[]) => {
	for (const strip of strips) {
		drag.windowStripAt.mockResolvedValueOnce(strip)
	}
}

describe("a torn-off tab moving over the windows", () => {
	it("announces the drag with its tab and Space, then asks the host which strip lies under every move", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.move(at(900, 60))

		await vi.waitFor(() =>
			expect(drag.windowStripAt.mock.calls).toEqual([
				[{ x: 300, y: 40 }],
				[{ x: 900, y: 60 }],
			]),
		)
		expect(drag.windowTabDragStart).toHaveBeenCalledExactlyOnceWith(
			TORN.packed,
			SPACE,
		)
		expect(drag.windowTabDragMove.mock.calls).toEqual([
			[{ x: 300, y: 40 }],
			[{ x: 900, y: 60 }],
		])
	})

	it("hides the ghost over a strip of the same Space and shows it again once the pointer leaves", async () => {
		answerEveryGhostCommand(SUPPORTED)
		stripsAt(SAME_SPACE_STRIP, null)
		const { session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		await vi.waitFor(() => expect(ghost.dragGhostHide).toHaveBeenCalledOnce())
		session.move(at(500, 400))

		await vi.waitFor(() => expect(ghost.dragGhostShow).toHaveBeenCalledTimes(2))
		expect(ghost.dragGhostShow).toHaveBeenLastCalledWith(
			{ x: 500, y: 400 },
			{ width: 600, height: 400 },
			TAB,
		)
		expect(drawGhost).toHaveBeenCalledOnce()
		expect(ghost.dragGhostMove).not.toHaveBeenCalled()
	})

	it("shows the thumbnail not allowed over a window of another Space, and allowed again past it", async () => {
		answerEveryGhostCommand(SUPPORTED)
		stripsAt(OTHER_SPACE_STRIP, null)
		const { session } = sessionWithMoves()
		const drawRealThumbnail = (size: { width: number; height: number }) =>
			drawThumbnail(TAB, size, {
				bots: [],
				conversations: [],
				missionTitles: {},
				soloThreads: {},
				spaceId: SPACE,
				readTranscript: () => new Promise(() => undefined),
			})

		session.start(at(10, 10), drawRealThumbnail)
		session.move(at(300, 40))
		await vi.waitFor(() =>
			expect(readGhostThumbnail()?.isNotAllowed).toBe(true),
		)
		expect(ghost.dragGhostHide).not.toHaveBeenCalled()
		session.move(at(500, 400))

		await vi.waitFor(() =>
			expect(readGhostThumbnail()?.isNotAllowed).toBe(false),
		)
	})
})

describe("a torn-off tab dropped on a strip of the same Space", () => {
	it("drops it on the host at the point, removes it from the origin and opens no window", async () => {
		answerEveryGhostCommand(SUPPORTED)
		stripsAt(SAME_SPACE_STRIP, SAME_SPACE_STRIP)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.drop(at(300.4, 40.2))

		await vi.waitFor(() =>
			expect(moves.removeDocked).toHaveBeenCalledExactlyOnceWith(
				SPACE,
				TAB.tabId,
			),
		)
		expect(drag.windowTabDragDrop).toHaveBeenCalledExactlyOnceWith({
			x: 300,
			y: 40,
		})
		expect(drag.windowTabDragCancel).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("keeps the tab in the origin and raises the notice when the host refuses the drop", async () => {
		answerEveryGhostCommand(SUPPORTED)
		drag.windowTabDragDrop.mockResolvedValue(REFUSED)
		stripsAt(SAME_SPACE_STRIP)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.drop(at(300, 40))

		await vi.waitFor(() =>
			expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				REDOCK_NOTICE,
				{ raisedIn: "tab-tear-off", command: "window_tab_drag_drop" },
			),
		)
		expect(moves.removeDocked).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
	})
})

describe("a torn-off tab dropped on a window of another Space", () => {
	it("ends the drag on the host and puts the tab back with no notice and no other change", async () => {
		answerEveryGhostCommand(SUPPORTED)
		stripsAt(OTHER_SPACE_STRIP, OTHER_SPACE_STRIP)
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.drop(at(300, 40))

		await vi.waitFor(() =>
			expect(drag.windowTabDragCancel).toHaveBeenCalledOnce(),
		)
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
		expect(drag.windowTabDragDrop).not.toHaveBeenCalled()
		expect(moves.removeDocked).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
		expect(raiseReportedFailure).not.toHaveBeenCalled()
	})
})

describe("a host drag command that rejects", () => {
	it("keeps the tab in the origin and raises the notice once when the drag cannot start", async () => {
		answerEveryGhostCommand(SUPPORTED)
		drag.windowTabDragStart.mockRejectedValue(new Error("host lost"))
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.drop(at(500, 300))

		await vi.waitFor(() => expect(ghost.dragGhostHide).toHaveBeenCalledOnce())
		expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			REDOCK_NOTICE,
			{ raisedIn: "tab-tear-off", command: "window_tab_drag_start" },
		)
		expect(drag.windowTabDragCancel).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
		expect(moves.removeDocked).not.toHaveBeenCalled()
	})

	it("ends the announced drag and keeps the tab when the strip lookup fails", async () => {
		answerEveryGhostCommand(SUPPORTED)
		drag.windowStripAt.mockRejectedValue(new Error("no answer"))
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(drag.windowTabDragCancel).toHaveBeenCalledOnce(),
		)
		expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			REDOCK_NOTICE,
			{ raisedIn: "tab-tear-off", command: "window_strip_at" },
		)
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.removeDocked).not.toHaveBeenCalled()
	})
})

describe("the only tab of its window torn off", () => {
	it("shows no thumbnail, moves the window itself and leaves it where it is released", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const { moves, session } = sessionWithMoves()
		moves.tornTabOf.mockReturnValue({ ...TORN, isOnlyTab: true })

		session.start(at(10, 10), drawGhost)
		session.move(at(300, 40))
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(drag.windowStartNativeMove).toHaveBeenCalledOnce(),
		)
		expect(ghost.dragGhostShow).not.toHaveBeenCalled()
		expect(drawGhost).not.toHaveBeenCalled()
		expect(drag.windowTabDragStart).not.toHaveBeenCalled()
		expect(moves.moveTornOff).not.toHaveBeenCalled()
		expect(moves.moveUnghosted).not.toHaveBeenCalled()
	})

	it("raises the notice when the window cannot move", async () => {
		drag.windowStartNativeMove.mockResolvedValue(REFUSED)
		const { moves, session } = sessionWithMoves()
		moves.tornTabOf.mockReturnValue({ ...TORN, isOnlyTab: true })

		session.start(at(10, 10), drawGhost)

		await vi.waitFor(() =>
			expect(raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				REDOCK_NOTICE,
				{ raisedIn: "tab-tear-off", command: "window_start_native_move" },
			),
		)
	})
})
