import { describe, expect, it } from "vitest"

import { imageCardCornerOf } from "@workspace/ui/components/library-image-comment-placement"

const STAGE = { left: 100, top: 50, right: 1100, bottom: 650 }
const CARD = { width: 360, height: 200 }

describe("imageCardCornerOf", () => {
	it("opens the card 8 right of the 32 pin, on the pin top", () => {
		expect(imageCardCornerOf({ x: 400, y: 300 }, CARD, STAGE)).toEqual({
			x: 440,
			y: 268,
		})
	})

	it("opens the card 12 left of the pin when it would cross the right edge", () => {
		expect(imageCardCornerOf({ x: 900, y: 300 }, CARD, STAGE)).toEqual({
			x: 528,
			y: 268,
		})
	})

	it("lifts the card off the bottom edge and keeps it beside the pin", () => {
		expect(imageCardCornerOf({ x: 400, y: 640 }, CARD, STAGE)).toEqual({
			x: 440,
			y: 450,
		})
	})

	it("drops the card under the top edge when the pin top is above it", () => {
		expect(imageCardCornerOf({ x: 400, y: 60 }, CARD, STAGE)).toEqual({
			x: 440,
			y: 50,
		})
	})

	it("stays against the right edge when neither side of the pin has room", () => {
		const narrow = { left: 100, top: 50, right: 500, bottom: 650 }

		expect(imageCardCornerOf({ x: 300, y: 300 }, CARD, narrow)).toEqual({
			x: 140,
			y: 268,
		})
	})

	it("starts on the stage corner when the card is larger than the stage", () => {
		const tiny = { left: 100, top: 50, right: 300, bottom: 150 }

		expect(imageCardCornerOf({ x: 200, y: 100 }, CARD, tiny)).toEqual({
			x: 100,
			y: 50,
		})
	})
})
