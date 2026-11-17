import { describe, expect, it } from "vitest"

import {
	commentPinTailOf,
	commentRingRadiusOf,
	commentRingRectOf,
	composerCornerOf,
	isNodeAnchor,
	threadCornerBesidePin,
	threadCornerUnderRing,
	toScreenPoint,
} from "@workspace/ui/components/board-comments"
import type {
	BoardRect,
	BoardViewport,
} from "@workspace/ui/components/board-view"

const NODE: BoardRect = { x: 200, y: 120, width: 160, height: 96 }
const ZOOMED: BoardViewport = { offset: { x: 24.25, y: -10 }, zoom: 2 }

describe("isNodeAnchor", () => {
	it("reads a node id as a node anchor and a board point as a free one", () => {
		expect(isNodeAnchor("boat")).toBe(true)
		expect(isNodeAnchor({ x: 0, y: 0 })).toBe(false)
	})
})

describe("commentPinTailOf", () => {
	it("puts the pin tail 10 screen pixels inside the top right corner", () => {
		expect(commentPinTailOf(NODE, { offset: { x: 0, y: 0 }, zoom: 1 })).toEqual(
			{ x: 350, y: 130 },
		)
	})

	it("keeps the same 10 screen pixels when the board is zoomed", () => {
		expect(commentPinTailOf(NODE, ZOOMED)).toEqual({ x: 734.25, y: 240 })
	})
})

describe("toScreenPoint", () => {
	it("follows the pan and the zoom", () => {
		expect(toScreenPoint({ x: 350, y: 130 }, ZOOMED)).toEqual({
			x: 724.25,
			y: 250,
		})
	})
})

describe("commentRingRectOf", () => {
	it("stays 6 screen pixels outside the node at every zoom", () => {
		expect(commentRingRectOf(NODE, ZOOMED)).toEqual({
			x: 418.25,
			y: 224,
			width: 332,
			height: 204,
		})
	})
})

describe("commentRingRadiusOf", () => {
	it("never goes under the 6 pixels of its outset", () => {
		expect(commentRingRadiusOf("0px", 1)).toBe("6px")
		expect(commentRingRadiusOf("4px", 1)).toBe("6px")
	})

	it("takes the drawn radius of a rounded node, at its zoomed size", () => {
		expect(commentRingRadiusOf("12px", 1)).toBe("12px")
		expect(commentRingRadiusOf("12px", 2)).toBe("24px")
		expect(commentRingRadiusOf("12px", 0.25)).toBe("6px")
	})

	it("keeps the radius of an ellipse", () => {
		expect(commentRingRadiusOf("50%", 2)).toBe("50%")
	})

	it("reads a radius the browser could not resolve as square", () => {
		expect(commentRingRadiusOf("", 1)).toBe("6px")
	})
})

describe("composerCornerOf", () => {
	it("opens the composer 8 right of the 32 pin, on the pin top", () => {
		expect(composerCornerOf({ x: 350, y: 130 })).toEqual({ x: 390, y: 98 })
	})
})

describe("threadCornerBesidePin", () => {
	it("ends the thread card 12 left of the pin, on the pin top", () => {
		expect(threadCornerBesidePin({ x: 350, y: 130 })).toEqual({
			x: 338,
			y: 98,
		})
	})
})

describe("threadCornerUnderRing", () => {
	it("ends the thread card on the ring right edge, 12 under the ring", () => {
		expect(
			threadCornerUnderRing({ x: 194, y: 114, width: 172, height: 108 }),
		).toEqual({ x: 366, y: 234 })
	})
})
