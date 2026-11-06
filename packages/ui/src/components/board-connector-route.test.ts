import { describe, expect, it } from "vitest"

import {
	anchorOf,
	arrowheadPathData,
	BOARD_ARROW_GAP,
	BOARD_SIDES,
	type BoardArrow,
	bendThrough,
	crossedRects,
	curveControl,
	directionAlong,
	exactPointOf,
	fractionNearest,
	lineEndOf,
	looseEnd,
	pointAlong,
	routeConnector,
	routeConnectors,
	routePathData,
	sectionTitleBox,
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

const LEFT_SHAPE: BoardRect = { x: 80, y: 126, width: 160, height: 120 }
const RIGHT_SHAPE: BoardRect = { x: 400, y: 126, width: 160, height: 120 }
const FAR_SHAPE: BoardRect = { x: 720, y: 126, width: 160, height: 120 }

const sticky = (x: number, y: number): BoardRect => ({
	x,
	y,
	width: 160,
	height: 160,
})
const DESKTOP_FRAME: BoardRect = { x: 40, y: 80, width: 608, height: 232 }
const SIDECAR_FRAME: BoardRect = { x: 40, y: 400, width: 408, height: 232 }
const CLOUD_FRAME: BoardRect = { x: 720, y: 80, width: 408, height: 232 }
const INTERFACE_REACT = sticky(64, 128)
const HOST_RUST = sticky(264, 128)
const LOCAL_STORAGE = sticky(464, 128)
const RELAY = sticky(744, 128)
const IPHONE_APP = sticky(944, 128)
const AGENT_SDK = sticky(64, 448)
const BOT_PLUGIN = sticky(264, 448)
const AFTER_BOARD_OBSTACLES = {
	blocks: [
		INTERFACE_REACT,
		HOST_RUST,
		LOCAL_STORAGE,
		RELAY,
		IPHONE_APP,
		AGENT_SDK,
		BOT_PLUGIN,
	],
	titles: [
		sectionTitleBox(DESKTOP_FRAME, "Application de bureau"),
		sectionTitleBox(SIDECAR_FRAME, "Sidecar"),
		sectionTitleBox(CLOUD_FRAME, "Cloud"),
	],
	frames: [DESKTOP_FRAME, SIDECAR_FRAME, CLOUD_FRAME],
}
const AFTER_BOARD_ARROWS: readonly [string, BoardArrow][] = [
	[
		"M232 208 L256 208",
		{
			source: { rect: INTERFACE_REACT },
			target: { rect: HOST_RUST },
			routing: "straight",
		},
	],
	[
		"M432 208 L456 208",
		{
			source: { rect: HOST_RUST },
			target: { rect: LOCAL_STORAGE },
			routing: "straight",
		},
	],
	[
		"M912 208 L936 208",
		{
			source: { rect: RELAY },
			target: { rect: IPHONE_APP },
			routing: "straight",
		},
	],
	[
		"M232 528 L256 528",
		{
			source: { rect: AGENT_SDK },
			target: { rect: BOT_PLUGIN },
			routing: "straight",
		},
	],
	[
		"M344 296 L344 360 Q344 368 336 368 L152 368 Q144 368 144 376 L144 440",
		{
			source: { rect: HOST_RUST },
			target: { rect: AGENT_SDK },
			routing: "elbow",
		},
	],
	[
		"M344 120 L344 64 Q344 56 352 56 L816 56 Q824 56 824 64 L824 120",
		{ source: { rect: HOST_RUST }, target: { rect: RELAY }, routing: "elbow" },
	],
]

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

const outwardBy = (side: BoardSide, rect: BoardRect, by: number) => {
	const anchor = anchorOf({ rect, side })
	return {
		x: anchor.x + OUTWARD[side].x * by,
		y: anchor.y + OUTWARD[side].y * by,
	}
}

describe("lineEndOf, the gap", () => {
	it("stops 8 before the outline of a shape bound at its centre", () => {
		expect(lineEndOf({ rect: LEFT_SHAPE }, { x: 480, y: 186 })).toEqual({
			x: 248,
			y: 186,
		})
		expect(lineEndOf({ rect: RIGHT_SHAPE }, { x: 160, y: 186 })).toEqual({
			x: 392,
			y: 186,
		})
	})

	it("stops 8 before a bound side along the line", () => {
		expect(
			lineEndOf({ rect: LEFT_SHAPE, side: "right" }, { x: 480, y: 186 }),
		).toEqual({ x: 248, y: 186 })
	})

	it("reaches an exact point with no gap", () => {
		const point = { x: 440, y: 186 }
		expect(lineEndOf({ rect: RIGHT_SHAPE, point }, { x: 160, y: 186 })).toBe(
			point,
		)
	})
})

describe("routeConnector straight", () => {
	it("1.2 Quick release: joins two centres from 248 to 392 on 186", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE },
			"straight",
		)
		expect(route).toEqual({
			points: [
				{ x: 248, y: 186 },
				{ x: 392, y: 186 },
			],
			arrow: { x: 1, y: 0 },
		})
		expect(routePathData(route)).toBe("M248 186 L392 186")
	})

	it("1.3 Exact point: ends the line and the head tip on the bound point", () => {
		const point = exactPointOf(RIGHT_SHAPE, { x: 0.25, y: 0.5 })
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE, point },
			"straight",
		)
		expect(point).toEqual({ x: 440, y: 186 })
		expect(route.points).toEqual([{ x: 248, y: 186 }, point])
		expect(arrowheadPathData(point, route.arrow)).toBe(
			"M430 192 L440 186 L430 180",
		)
	})

	for (const fromSide of BOARD_SIDES)
		for (const toSide of BOARD_SIDES)
			it(`joins the ${fromSide} side to the ${toSide} side 8 off each anchor`, () => {
				const target = LAYOUTS["overlapping on the vertical axis"]
				const { points } = routeConnector(
					{ rect: SOURCE, side: fromSide },
					{ rect: target, side: toSide },
					"straight",
				)
				const from = anchorOf({ rect: SOURCE, side: fromSide })
				const to = anchorOf({ rect: target, side: toSide })
				expect(points).toHaveLength(2)
				expect(
					Math.hypot(points[0].x - from.x, points[0].y - from.y),
				).toBeCloseTo(BOARD_ARROW_GAP)
				expect(Math.hypot(points[1].x - to.x, points[1].y - to.y)).toBeCloseTo(
					BOARD_ARROW_GAP,
				)
			})
})

describe("routeConnector curve", () => {
	it("2.1 Curve: bends the chord into a quadratic through its offset midpoint", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE },
			"straight",
			{ bend: 66 },
		)
		expect(route.points).toEqual([
			{ x: 248, y: 186 },
			{ x: 392, y: 186 },
		])
		expect(route.control).toEqual({ x: 320, y: 54 })
		expect(pointAlong(route, 0.5)).toEqual({ x: 320, y: 120 })
		expect(routePathData(route)).toBe("M248 186 Q320 54 392 186")
		expect(route.arrow.x).toBeCloseTo(72 / Math.hypot(72, 132))
		expect(route.arrow.y).toBeCloseTo(132 / Math.hypot(72, 132))
	})

	it("bows to the other side with a negative bend", () => {
		expect(curveControl({ x: 248, y: 186 }, { x: 392, y: 186 }, -66)).toEqual({
			x: 320,
			y: 318,
		})
	})
})

describe("bendThrough, the middle handle", () => {
	const from = { x: 248, y: 186 }
	const to = { x: 392, y: 186 }

	it("2.1 Curve: bends the arrow by the offset of the handle from the chord", () => {
		expect(bendThrough(from, to, { x: 320, y: 120 })).toBe(66)
	})

	it("measures the offset across the chord only", () => {
		expect(bendThrough(from, to, { x: 260, y: 252 })).toBe(-66)
	})

	it("draws the curve through the dragged handle", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE },
			"straight",
			{ bend: bendThrough(from, to, { x: 320, y: 90 }) },
		)
		expect(pointAlong(route, 0.5)).toEqual({ x: 320, y: 90 })
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
					const from = anchorOf({ rect: SOURCE, side: fromSide })
					const to = anchorOf({ rect: target, side: toSide })

					expect(directionOf(from, points[0])).toEqual(OUTWARD[fromSide])
					expect(directionOf(to, points.at(-1) as BoardPoint)).toEqual(
						OUTWARD[toSide],
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
			{ x: 168, y: 60 },
			{ x: 272, y: 60 },
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
			{ x: 168, y: 60 },
			{ x: 220, y: 60 },
			{ x: 220, y: 220 },
			{ x: 272, y: 220 },
		])
	})

	it("2.2 Elbow: passes 48 above the shape in its way, corners of radius 8", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: FAR_SHAPE },
			"elbow",
			{
				obstacles: {
					blocks: [LEFT_SHAPE, RIGHT_SHAPE, FAR_SHAPE],
					titles: [],
					frames: [],
				},
			},
		)
		expect(route.points).toEqual([
			outwardBy("top", LEFT_SHAPE, 8),
			{ x: 160, y: 78 },
			{ x: 800, y: 78 },
			outwardBy("top", FAR_SHAPE, 8),
		])
		expect(routePathData(route)).toBe(
			"M160 118 L160 86 Q160 78 168 78 L792 78 Q800 78 800 86 L800 118",
		)
		for (const [a, b] of segmentsOf(route.points))
			for (const shape of [LEFT_SHAPE, RIGHT_SHAPE, FAR_SHAPE])
				expect(crossesInside(a, b, shape)).toBe(false)
	})
})

describe("After board", () => {
	const routes = routeConnectors(
		AFTER_BOARD_ARROWS.map(([, arrow]) => arrow),
		AFTER_BOARD_OBSTACLES,
	)

	it.each(AFTER_BOARD_ARROWS.map(([path], index) => [index + 1, path]))(
		"draws arrow %i on %s",
		(index, path) => {
			expect(routePathData(routes[Number(index) - 1])).toBe(path)
		},
	)

	it("sends Hôte Rust to Relais over the top since the bottom side already leads to Agent SDK", () => {
		const alone = routeConnector(
			{ rect: HOST_RUST },
			{ rect: RELAY },
			"elbow",
			{ obstacles: AFTER_BOARD_OBSTACLES },
		)
		expect(alone.points[0]).toEqual({ x: 344, y: 296 })
		expect(routes[5].points[0]).toEqual({ x: 344, y: 120 })
	})

	it("crosses no sticky and no frame title on any arrow", () => {
		for (const { points } of routes)
			for (const [a, b] of segmentsOf(points))
				for (const block of [
					...AFTER_BOARD_OBSTACLES.blocks,
					...AFTER_BOARD_OBSTACLES.titles,
				])
					expect(crossesInside(a, b, block)).toBe(false)
	})
})

describe("loose ends", () => {
	const point = { x: 600, y: 320 }
	const loose = { rect: { ...point, width: 0, height: 0 }, point }

	it("ends the line and the head tip on a board point with no gap", () => {
		const route = routeConnector({ rect: LEFT_SHAPE }, loose, "straight")
		expect(route.points.at(-1)).toEqual(point)
		const length = Math.hypot(point.x - 160, point.y - 186)
		expect(route.points[0].x).toBeCloseTo(
			240 + (BOARD_ARROW_GAP * (point.x - 160)) / length,
		)
	})

	it("starts the line on a board point with no gap", () => {
		const route = routeConnector(loose, { rect: RIGHT_SHAPE }, "straight")
		expect(route.points[0]).toEqual(point)
	})

	it("draws a straight arrow between two board points, elbow or not", () => {
		const other = { x: 100, y: 40 }
		const route = routeConnector(
			loose,
			{ rect: { ...other, width: 0, height: 0 }, point: other },
			"elbow",
		)
		expect(route.points).toEqual([point, other])
	})

	it("routes an elbow from a shape to a board point, the last leg facing the shape", () => {
		const { points } = routeConnector({ rect: LEFT_SHAPE }, loose, "elbow")
		expect(points.at(-1)).toEqual(point)
		for (const [a, b] of segmentsOf(points))
			expect(a.x === b.x || a.y === b.y).toBe(true)
	})
})

describe("crossedRects", () => {
	it("names the shapes a straight arrow passes across", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: FAR_SHAPE },
			"straight",
		)
		expect(crossedRects(route, [RIGHT_SHAPE, AGENT_SDK])).toEqual([RIGHT_SHAPE])
	})

	it("follows the curve of a bent arrow", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: FAR_SHAPE },
			"straight",
			{ bend: 140 },
		)
		expect(crossedRects(route, [RIGHT_SHAPE])).toEqual([])
	})
})

describe("looseEnd", () => {
	it("ends exactly on the point and faces the point it is drawn from", () => {
		expect(looseEnd({ x: 400, y: 50 }, { x: 160, y: 60 })).toEqual({
			rect: { x: 400, y: 50, width: 0, height: 0 },
			side: "left",
			point: { x: 400, y: 50 },
		})
		expect(looseEnd({ x: 170, y: 400 }, { x: 160, y: 60 }).side).toBe("top")
	})
})

describe("routePathData", () => {
	it("draws a straight route as one line", () => {
		expect(
			routePathData({
				points: [
					{ x: 0, y: 0 },
					{ x: 30, y: 40 },
				],
			}),
		).toBe("M0 0 L30 40")
	})

	it("rounds each turn with a quadratic corner of radius 8", () => {
		expect(
			routePathData({
				points: [
					{ x: 0, y: 0 },
					{ x: 40, y: 0 },
					{ x: 40, y: 40 },
				],
			}),
		).toBe("M0 0 L32 0 Q40 0 40 8 L40 40")
	})

	it("shrinks a corner to half of a short segment", () => {
		expect(
			routePathData({
				points: [
					{ x: 0, y: 0 },
					{ x: 6, y: 0 },
					{ x: 6, y: 40 },
				],
			}),
		).toBe("M0 0 L3 0 Q6 0 6 3 L6 40")
	})
})

describe("pointAlong, the label position", () => {
	const route = routeConnector(
		{ rect: LEFT_SHAPE },
		{ rect: RIGHT_SHAPE },
		"straight",
	)

	it("4.1 Label: centres the label on the middle of the route by default", () => {
		expect(pointAlong(route, 0.5)).toEqual({ x: 320, y: 186 })
	})

	it("slides the label along the route with its position", () => {
		expect(pointAlong(route, 0.25)).toEqual({ x: 284, y: 186 })
	})

	it("measures an elbow along its length", () => {
		expect(
			pointAlong(
				{
					points: [
						{ x: 0, y: 0 },
						{ x: 40, y: 0 },
						{ x: 40, y: 40 },
					],
				},
				0.75,
			),
		).toEqual({ x: 40, y: 20 })
	})
})

describe("fractionNearest, the dragged label", () => {
	const route = routeConnector(
		{ rect: LEFT_SHAPE },
		{ rect: RIGHT_SHAPE },
		"straight",
	)

	it("slides the label to the point of the route nearest the pointer", () => {
		expect(fractionNearest(route, { x: 284, y: 140 })).toBe(0.25)
	})

	it("keeps the label on the route past its ends", () => {
		expect(fractionNearest(route, { x: 900, y: 186 })).toBe(1)
	})

	it("follows the curve of a bent arrow", () => {
		const curve = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE },
			"straight",
			{ bend: 66 },
		)
		expect(fractionNearest(curve, { x: 320, y: 100 })).toBe(0.5)
	})
})

describe("directionAlong, the label tick", () => {
	it("runs along a straight route", () => {
		const route = routeConnector(
			{ rect: LEFT_SHAPE },
			{ rect: RIGHT_SHAPE },
			"straight",
		)
		expect(directionAlong(route, 0.5)).toEqual({ x: 1, y: 0 })
	})

	it("runs along the leg of an elbow the fraction falls on", () => {
		const elbow = {
			points: [
				{ x: 0, y: 0 },
				{ x: 40, y: 0 },
				{ x: 40, y: 40 },
			],
		}
		expect(directionAlong(elbow, 0.75)).toEqual({ x: 0, y: 1 })
	})
})

describe("arrowheadPathData, the head", () => {
	const tip = { x: 392, y: 186 }
	const right = { x: 1, y: 0 }

	it("5.1 Three head sizes: opens a chevron 7 by 4, 10 by 6 and 14 by 8", () => {
		expect(arrowheadPathData(tip, right, "small")).toBe(
			"M385 190 L392 186 L385 182",
		)
		expect(arrowheadPathData(tip, right, "medium")).toBe(
			"M382 192 L392 186 L382 180",
		)
		expect(arrowheadPathData(tip, right, "large")).toBe(
			"M378 194 L392 186 L378 178",
		)
	})

	it("opens a medium chevron when no size is given", () => {
		expect(arrowheadPathData(tip, right)).toBe("M382 192 L392 186 L382 180")
	})
})
