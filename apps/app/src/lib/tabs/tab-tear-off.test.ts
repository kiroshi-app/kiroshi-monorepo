// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTabTearOff, type TabTearOff } from "./tab-tear-off"

const ghost = vi.hoisted(() => ({
	dragGhostShow: vi.fn(),
	dragGhostMove: vi.fn(),
	dragGhostHide: vi.fn(),
}))

vi.mock("../bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("../bindings")>()
	return { ...bindings, commands: { ...bindings.commands, ...ghost } }
})

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

const answerEveryGhostCommand = (answer: unknown) => {
	ghost.dragGhostShow.mockResolvedValue(answer)
	ghost.dragGhostMove.mockResolvedValue(answer)
	ghost.dragGhostHide.mockResolvedValue(answer)
}

const sessionWithMoves = () => {
	const moves = {
		moveUnghosted: vi.fn(),
		moveTornOff: vi.fn().mockResolvedValue(undefined),
		raiseMoveFailure: vi.fn(),
	}
	return { moves, session: createTabTearOff(moves) }
}

const drawGhost = vi.fn(() => TAB)

beforeEach(() => {
	window.innerWidth = 1200
	window.innerHeight = 800
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	ghost.dragGhostShow.mockReset()
	ghost.dragGhostMove.mockReset()
	ghost.dragGhostHide.mockReset()
	drawGhost.mockClear()
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

	it("falls back to the move without a ghost when drawing the ghost throws", async () => {
		answerEveryGhostCommand(SUPPORTED)
		drawGhost.mockImplementationOnce(() => {
			throw new Error("tab gone")
		})
		const { moves, session } = sessionWithMoves()

		session.start(at(10, 10), drawGhost)
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.moveUnghosted).toHaveBeenCalledExactlyOnceWith(at(500, 300)),
		)
		expect(ghost.dragGhostShow).not.toHaveBeenCalled()
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

describe("a tab torn off after a tear-off whose move failed", () => {
	it("raises one notice, then shows the ghost and opens the window at the drop", async () => {
		answerEveryGhostCommand(UNSUPPORTED)
		const failure = new Error("window lost")
		const { moves, session } = sessionWithMoves()
		moves.moveUnghosted.mockImplementationOnce(() => {
			throw failure
		})

		session.start(at(10, 10), drawGhost)
		session.drop(at(100, 100))
		await vi.waitFor(() =>
			expect(moves.raiseMoveFailure).toHaveBeenCalledExactlyOnceWith(failure),
		)
		answerEveryGhostCommand(SUPPORTED)
		session.start(at(20, 20), drawGhost)
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.moveTornOff).toHaveBeenCalledExactlyOnceWith(at(500, 300), {
				width: 1200,
				height: 800,
			}),
		)
		expect(ghost.dragGhostShow).toHaveBeenLastCalledWith(
			{ x: 20, y: 20 },
			{ width: 600, height: 400 },
			TAB,
		)
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
		expect(moves.raiseMoveFailure).toHaveBeenCalledOnce()
	})

	it("raises one notice when opening the torn-off window rejects", async () => {
		answerEveryGhostCommand(SUPPORTED)
		const failure = new Error("carried tab lost")
		const { moves, session } = sessionWithMoves()
		moves.moveTornOff.mockRejectedValueOnce(failure)

		session.start(at(10, 10), drawGhost)
		session.drop(at(500, 300))

		await vi.waitFor(() =>
			expect(moves.raiseMoveFailure).toHaveBeenCalledExactlyOnceWith(failure),
		)
		expect(ghost.dragGhostHide).toHaveBeenCalledOnce()
	})
})
