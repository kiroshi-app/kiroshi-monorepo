import { describe, expect, it } from "vitest"

import {
	arrowDirectionOf,
	BOARD_MIN_OBJECT_SIZE,
	inReadingOrder,
	movedRect,
	resizedFromCorner,
	roundedRect,
	toScreenRect,
} from "@workspace/ui/components/board-selection"
import type { BoardItem, BoardRect } from "@workspace/ui/components/board-view"

const RECT: BoardRect = { x: 100, y: 200, width: 160, height: 120 }

const itemAt = (id: string, x: number, y: number): BoardItem => ({
	id,
	kind: "sticky",
	position: { x, y },
	size: { width: 10, height: 10 },
	zOrder: 0,
	text: id,
})

describe("movedRect", () => {
	it("shifts the position and keeps the size", () => {
		expect(movedRect(RECT, { x: -10, y: 5 })).toEqual({
			x: 90,
			y: 205,
			width: 160,
			height: 120,
		})
	})
})

describe("resizedFromCorner", () => {
	it("keeps the top left fixed when the bottom right corner moves", () => {
		expect(resizedFromCorner(RECT, "bottom-right", { x: 20, y: 10 })).toEqual({
			x: 100,
			y: 200,
			width: 180,
			height: 130,
		})
	})

	it("keeps the bottom right fixed when the top left corner moves", () => {
		expect(resizedFromCorner(RECT, "top-left", { x: 20, y: 10 })).toEqual({
			x: 120,
			y: 210,
			width: 140,
			height: 110,
		})
	})

	it("keeps the bottom left fixed when the top right corner moves", () => {
		expect(resizedFromCorner(RECT, "top-right", { x: 20, y: -10 })).toEqual({
			x: 100,
			y: 190,
			width: 180,
			height: 130,
		})
	})

	it("holds the minimum size against the fixed corner", () => {
		expect(resizedFromCorner(RECT, "top-left", { x: 500, y: 500 })).toEqual({
			x: 100 + 160 - BOARD_MIN_OBJECT_SIZE,
			y: 200 + 120 - BOARD_MIN_OBJECT_SIZE,
			width: BOARD_MIN_OBJECT_SIZE,
			height: BOARD_MIN_OBJECT_SIZE,
		})
	})
})

describe("roundedRect", () => {
	it("rounds every edge to a whole board pixel", () => {
		expect(roundedRect({ x: 1.4, y: 1.6, width: 9.5, height: 2.2 })).toEqual({
			x: 1,
			y: 2,
			width: 10,
			height: 2,
		})
	})
})

describe("toScreenRect", () => {
	it("scales by the zoom and shifts by the offset", () => {
		expect(toScreenRect(RECT, { offset: { x: 10, y: -20 }, zoom: 2 })).toEqual({
			x: 210,
			y: 380,
			width: 320,
			height: 240,
		})
	})
})

describe("inReadingOrder", () => {
	it("sorts top to bottom, then left to right", () => {
		const order = inReadingOrder([
			itemAt("c", 0, 100),
			itemAt("b", 50, 0),
			itemAt("a", 0, 0),
		])
		expect(order.map((item) => item.id)).toEqual(["a", "b", "c"])
	})
})

describe("arrowDirectionOf", () => {
	it("maps each arrow to a unit step and anything else to nothing", () => {
		expect(arrowDirectionOf("ArrowLeft")).toEqual({ x: -1, y: 0 })
		expect(arrowDirectionOf("ArrowDown")).toEqual({ x: 0, y: 1 })
		expect(arrowDirectionOf("a")).toBeUndefined()
	})
})
