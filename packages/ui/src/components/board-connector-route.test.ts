import { describe, expect, it } from "vitest"

import {
	anchorOf,
	arrowheadPathData,
	BOARD_SIDES,
	looseEnd,
	routeConnector,
	routePathData,
} from "@workspace/ui/components/board-connector-route"
import type {
	BoardPoint,
	BoardRect,
	BoardSide,
} from "@workspace/ui/components/board-view"

const OUTWARD: Record<BoardSide, BoardPoint> = {
	top: { x: 0, y: -1 },
	right: { x: 1, y: 0 },
	bottom: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
}

const INWARD: Record<BoardSide, BoardPoint> = {
	top: { x: 0, y: 1 },
	right: { x: -1, y: 0 },
	bottom: { x: 0, y: -1 },
	left: { x: 1, y: 0 },
}

const SOURCE: BoardRect = { x: 0, y: 0, width: 160, height: 120 }

const LAYOUTS: Record<string, BoardRect> = {
	"apart on both axes": { x: 320, y: 280, width: 144, height: 80 },
	"overlapping on the vertical axis": { x: 280, y: 60, width: 144, height: 80 },
	"overlapping on the horizontal axis": {
		x: 60,
		y: 260,
		width: 144,
		height: 80,
	},
	"close and overlapping on the vertical axis": {
		x: 176,
		y: 40,
		width: 144,
		height: 80,
	},
	"close and overlapping on the horizontal axis": {
		x: 40,
		y: 136,
		width: 144,
		height: 80,
	},
}

const directionOf = (from: BoardPoint, to: BoardPoint): BoardPoint => ({
	x: Math.sign(to.x - from.x),
	y: Math.sign(to.y - from.y),
})

const segmentsOf = (points: readonly BoardPoint[]) =>
	points.slice(1).map((to, index) => [points[index], to] as const)

const crossesInside = (a: BoardPoint, b: BoardPoint, rect: BoardRect) => {
	const steps = 64
	return Array.from({ length: steps + 1 }, (_, step) => ({
		x: a.x + ((b.x - a.x) * step) / steps,
		y: a.y + ((b.y - a.y) * step) / steps,
	})).some(
		(point) =>
			rect.x < point.x &&
			point.x < rect.x + rect.width &&
			rect.y < point.y &&
			point.y < rect.y + rect.height,
	)
}

describe("routeConnector straight", () => {
	for (const fromSide of BOARD_SIDES)
		for (const toSide of BOARD_SIDES)
			it(`joins the ${fromSide} anchor to the ${toSide} anchor in one segment`, () => {
				const target = LAYOUTS["overlapping on the vertical axis"]
				const route = routeConnector(
					{ rect: SOURCE, side: fromSide },
					{ rect: target, side: toSide },
					"straight",
				)
				const from = anchorOf({ rect: SOURCE, side: fromSide })
				const to = anchorOf({ rect: target, side: toSide })
				expect(route.points).toEqual([from, to])
				const length = Math.hypot(to.x - from.x, to.y - from.y)
				expect(route.arrow.x).toBeCloseTo((to.x - from.x) / length)
				expect(route.arrow.y).toBeCloseTo((to.y - from.y) / length)
			})
})

describe("routeConnector elbow", () => {
	for (const [layout, target] of Object.entries(LAYOUTS))
		for (const fromSide of BOARD_SIDES)
			for (const toSide of BOARD_SIDES)
				it(`routes ${fromSide} to ${toSide} with the objects ${layout}`, () => {
					const { points, arrow } = routeConnector(
						{ rect: SOURCE, side: fromSide },
						{ rect: target, side: toSide },
						"elbow",
					)
					const segments = segmentsOf(points)

					expect(points[0]).toEqual(anchorOf({ rect: SOURCE, side: fromSide }))
					expect(points.at(-1)).toEqual(
						anchorOf({ rect: target, side: toSide }),
					)
					for (const [a, b] of segments) {
						expect(a.x === b.x || a.y === b.y).toBe(true)
						expect(a.x === b.x && a.y === b.y).toBe(false)
						expect(crossesInside(a, b, SOURCE)).toBe(false)
						expect(crossesInside(a, b, target)).toBe(false)
					}
					const [first] = segments
					const last = segments.at(-1) as (typeof segments)[number]
					expect(directionOf(...first)).toEqual(OUTWARD[fromSide])
					expect(directionOf(...last)).toEqual(INWARD[toSide])
					expect(arrow).toEqual(directionOf(...last))
				})

	it("draws one segment between facing anchors on the same line", () => {
		const target = { x: 280, y: 0, width: 160, height: 120 }
		expect(
			routeConnector(
				{ rect: SOURCE, side: "right" },
				{ rect: target, side: "left" },
				"elbow",
			).points,
		).toEqual([
			{ x: 160, y: 60 },
			{ x: 280, y: 60 },
		])
	})

	it("turns halfway between facing anchors on different lines", () => {
		const target = { x: 280, y: 160, width: 160, height: 120 }
		expect(
			routeConnector(
				{ rect: SOURCE, side: "right" },
				{ rect: target, side: "left" },
				"elbow",
			).points,
		).toEqual([
			{ x: 160, y: 60 },
			{ x: 220, y: 60 },
			{ x: 220, y: 220 },
			{ x: 280, y: 220 },
		])
	})
})

describe("looseEnd", () => {
	it("faces the point it is drawn from", () => {
		expect(looseEnd({ x: 400, y: 50 }, { x: 160, y: 60 })).toEqual({
			rect: { x: 400, y: 50, width: 0, height: 0 },
			side: "left",
		})
		expect(looseEnd({ x: 170, y: 400 }, { x: 160, y: 60 }).side).toBe("top")
	})
})

describe("routePathData", () => {
	it("draws a straight route as one line", () => {
		expect(
			routePathData([
				{ x: 0, y: 0 },
				{ x: 30, y: 40 },
			]),
		).toBe("M0 0 L30 40")
	})

	it("rounds each turn with a quadratic corner of radius 8", () => {
		expect(
			routePathData([
				{ x: 0, y: 0 },
				{ x: 40, y: 0 },
				{ x: 40, y: 40 },
			]),
		).toBe("M0 0 L32 0 Q40 0 40 8 L40 40")
	})

	it("shrinks a corner to half of a short segment", () => {
		expect(
			routePathData([
				{ x: 0, y: 0 },
				{ x: 6, y: 0 },
				{ x: 6, y: 40 },
			]),
		).toBe("M0 0 L3 0 Q6 0 6 3 L6 40")
	})
})

describe("arrowheadPathData", () => {
	it("opens a chevron 10 long and 12 wide behind the tip", () => {
		expect(arrowheadPathData({ x: 100, y: 50 }, { x: 1, y: 0 })).toBe(
			"M90 56 L100 50 L90 44",
		)
	})
})
