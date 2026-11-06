import { describe, expect, it } from "vitest"

import type {
	BoardObject,
	BoardPoint,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import {
	BOARD_CULL_MARGIN,
	BOARD_ZOOM_MAX,
	BOARD_ZOOM_MIN,
	cullBoardObjects,
	fitBoardBounds,
	gridScreenPitch,
	openingViewportOf,
	panBy,
	zoomAround,
	zoomStepIn,
	zoomStepOut,
} from "@workspace/ui/components/board-viewport"

const AT_ORIGIN: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 1 }
const SCREEN = { width: 800, height: 600 }

const sticky = (id: string, x: number, y: number): BoardObject => ({
	id,
	kind: "sticky",
	position: { x, y },
	size: { width: 100, height: 100 },
	zOrder: 0,
	text: id,
})

const connector = (id: string, from: string, to: string): BoardObject => ({
	id,
	kind: "connector",
	from,
	fromSide: "right",
	to,
	toSide: "left",
	routing: "straight",
	zOrder: 0,
	text: "",
})

const toScreen = (viewport: BoardViewport, point: BoardPoint) => ({
	x: point.x * viewport.zoom + viewport.offset.x,
	y: point.y * viewport.zoom + viewport.offset.y,
})

const toBoard = (viewport: BoardViewport, point: BoardPoint) => ({
	x: (point.x - viewport.offset.x) / viewport.zoom,
	y: (point.y - viewport.offset.y) / viewport.zoom,
})

const culledIds = (
	objects: BoardObject[],
	viewport: BoardViewport = AT_ORIGIN,
) => cullBoardObjects(objects, viewport, SCREEN).map(({ object }) => object.id)

describe("zoomAround", () => {
	it("keeps the board point under the anchor fixed on screen", () => {
		const viewport: BoardViewport = { offset: { x: -120, y: 75 }, zoom: 1.3 }
		const anchor = { x: 312, y: 208 }
		const pinned = toBoard(viewport, anchor)

		const zoomed = zoomAround(viewport, 2.7, anchor)

		expect(zoomed.zoom).toBe(2.7)
		const onScreen = toScreen(zoomed, pinned)
		expect(onScreen.x).toBeCloseTo(anchor.x)
		expect(onScreen.y).toBeCloseTo(anchor.y)
	})

	it("holds the zoom at its bounds and still keeps the anchor fixed", () => {
		const anchor = { x: 400, y: 300 }
		const pinned = toBoard(AT_ORIGIN, anchor)

		const tooFar = zoomAround(AT_ORIGIN, 12, anchor)
		const tooClose = zoomAround(AT_ORIGIN, 0.01, anchor)

		expect(tooFar.zoom).toBe(BOARD_ZOOM_MAX)
		expect(tooClose.zoom).toBe(BOARD_ZOOM_MIN)
		expect(toScreen(tooFar, pinned).x).toBeCloseTo(anchor.x)
		expect(toScreen(tooClose, pinned).y).toBeCloseTo(anchor.y)
	})
})

describe("panBy", () => {
	it("moves the board against the scroll delta, at any zoom", () => {
		const viewport: BoardViewport = { offset: { x: 10, y: 20 }, zoom: 2 }

		expect(panBy(viewport, { x: 30, y: -40 })).toEqual({
			offset: { x: -20, y: 60 },
			zoom: 2,
		})
	})
})

describe("zoom steps", () => {
	it("steps between the stops and stops at the bounds", () => {
		expect(zoomStepIn(1)).toBe(1.5)
		expect(zoomStepOut(1)).toBe(0.75)
		expect(zoomStepIn(0.87)).toBe(1)
		expect(zoomStepOut(0.87)).toBe(0.75)
		expect(zoomStepIn(BOARD_ZOOM_MAX)).toBe(BOARD_ZOOM_MAX)
		expect(zoomStepOut(BOARD_ZOOM_MIN)).toBe(BOARD_ZOOM_MIN)
	})
})

describe("cullBoardObjects", () => {
	it("keeps the objects on screen and drops the ones past the margin", () => {
		const objects = [
			sticky("visible", 100, 100),
			sticky("in-margin", SCREEN.width + BOARD_CULL_MARGIN - 50, 100),
			sticky("past-margin", SCREEN.width + BOARD_CULL_MARGIN + 50, 100),
			sticky("above", 100, -BOARD_CULL_MARGIN - 200),
		]

		expect(culledIds(objects)).toEqual(["visible", "in-margin"])
	})

	it("follows the pan and the zoom", () => {
		const objects = [sticky("near", 0, 0), sticky("far", 5000, 3000)]
		const pannedToFar: BoardViewport = {
			offset: { x: -4800, y: -2800 },
			zoom: 1,
		}
		const zoomedOut: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 0.1 }

		expect(culledIds(objects)).toEqual(["near"])
		expect(culledIds(objects, pannedToFar)).toEqual(["far"])
		expect(culledIds(objects, zoomedOut)).toEqual(["near", "far"])
	})

	it("scales the margin with the zoom so it stays the same on screen", () => {
		const justPastMargin = SCREEN.width + BOARD_CULL_MARGIN + 10
		const objects = [sticky("edge", justPastMargin / 2, 0)]
		const zoomedIn: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 2 }

		expect(culledIds(objects, zoomedIn)).toEqual([])
	})

	it("mounts a connector by the bounds of its endpoints", () => {
		const objects = [
			sticky("left", -3000, 200),
			sticky("right", 3000, 200),
			sticky("far-a", 9000, 9000),
			sticky("far-b", 9500, 9000),
			connector("across", "left", "right"),
			connector("away", "far-a", "far-b"),
			connector("dangling", "left", "missing"),
		]

		expect(culledIds(objects)).toEqual(["across"])
		expect(
			cullBoardObjects(objects, AT_ORIGIN, SCREEN).find(
				({ object }) => object.id === "across",
			)?.bounds,
		).toEqual({ x: -3000, y: 200, width: 6100, height: 100 })
	})
})

describe("gridScreenPitch", () => {
	it("follows the zoom and doubles once the dots would crowd", () => {
		expect(gridScreenPitch(1)).toBe(24)
		expect(gridScreenPitch(2)).toBe(48)
		expect(gridScreenPitch(0.5)).toBe(12)
		expect(gridScreenPitch(0.25)).toBe(12)
		expect(gridScreenPitch(BOARD_ZOOM_MIN)).toBeCloseTo(19.2)
	})
})

describe("fitBoardBounds", () => {
	const PREVIEW = { width: 271, height: 180 }

	it("shrinks a wide board to the width, centred, keeping the margin", () => {
		const fitted = fitBoardBounds(
			{ x: -100, y: 50, width: 1000, height: 200 },
			PREVIEW,
			20,
		)
		expect(fitted.zoom).toBeCloseTo(0.231, 3)
		expect(fitted.offset.x + -100 * fitted.zoom).toBeCloseTo(20)
		expect(fitted.offset.y + 50 * fitted.zoom).toBeCloseTo(
			(180 - 200 * fitted.zoom) / 2,
		)
	})

	it("shrinks a tall board to the height, centred, keeping the margin", () => {
		const fitted = fitBoardBounds(
			{ x: 0, y: 0, width: 200, height: 700 },
			PREVIEW,
			20,
		)
		expect(fitted.zoom).toBeCloseTo(0.2)
		expect(fitted.offset.y).toBeCloseTo(20)
		expect(fitted.offset.x).toBeCloseTo((271 - 40) / 2)
	})

	it("never magnifies a board smaller than the preview", () => {
		const fitted = fitBoardBounds(
			{ x: 10, y: 10, width: 100, height: 60 },
			PREVIEW,
			20,
		)
		expect(fitted).toEqual({ zoom: 1, offset: { x: 75.5, y: 50 } })
	})
})

describe("openingViewportOf", () => {
	const MARGIN = 48

	it("frames content far from the origin, centred, the margin on the limiting axis", () => {
		const objects = [
			sticky("near", 5000, 3000),
			sticky("far", 7900, 4900),
			connector("link", "near", "far"),
		]
		const opening = openingViewportOf(objects, SCREEN, MARGIN)
		const topLeft = toScreen(opening, { x: 5000, y: 3000 })
		const bottomRight = toScreen(opening, { x: 8000, y: 5000 })

		expect(opening.zoom).toBeCloseTo((800 - 2 * MARGIN) / 3000)
		expect(topLeft.x).toBeCloseTo(MARGIN)
		expect(SCREEN.width - bottomRight.x).toBeCloseTo(MARGIN)
		expect(topLeft.y).toBeCloseTo(SCREEN.height - bottomRight.y)
	})

	it("opens content that fits at 100 percent, centred", () => {
		const opening = openingViewportOf(
			[sticky("a", -300, -200), sticky("b", -150, -200)],
			SCREEN,
			MARGIN,
		)

		expect(opening).toEqual({ zoom: 1, offset: { x: 575, y: 450 } })
	})

	it("puts the origin of an empty board at the centre, at 100 percent", () => {
		expect(openingViewportOf([], SCREEN, MARGIN)).toEqual({
			zoom: 1,
			offset: { x: 400, y: 300 },
		})
	})
})
